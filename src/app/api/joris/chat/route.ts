import { loadSubscriptionCatalog, subscriptionOptions, subscriptionSelectionSchema } from "@/server/ai/subscription-catalog";
import { runSubscriptionTurn } from "@/server/ai/subscription-runtime";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { authzIdentity, requireWorkspaceApiSession } from "@/server/auth/owner";
import { isSubscriptionOwner } from "@/server/ai/subscription-owner";
import { CalendarRepositoryError } from "@/server/calendar/calendar-repository";
import { CalendarServiceError } from "@/server/calendar/calendar-service";
import { runJorisCommand } from "@/server/joris/brain";
import { logger } from "@/lib/logger";
import { chatModelOptions, chatModelSelectionSchema, loadChatCapabilityCatalog, resolveChatModelBinding } from "@/server/joris/chat-model-binding";

const requestSchema = z.object({
  message: z.string().min(1).max(4000),
  locale: z.literal("fr-CA").default("fr-CA"),
  modelSelection: chatModelSelectionSchema.optional(),
  subscriptionSelection: subscriptionSelectionSchema.optional(),
}).strict().refine(value => !(value.modelSelection && value.subscriptionSelection));

export async function GET(request: Request) {
  const session = await requireWorkspaceApiSession(request);
  if (session instanceof NextResponse) return session;
  const ctx = getActiveWorkspaceContext({ ...session.ctx, email: session.user.email, emailVerified: authzIdentity(session.user).emailVerified });
  const catalog=await loadChatCapabilityCatalog();
  // Subscription options are listed only to the subscription holder (same rule as POST).
  const subscriptionHolder=isSubscriptionOwner(session.user.id);
  return NextResponse.json({options:[...chatModelOptions(catalog,ctx.workspace.id),...(subscriptionHolder?subscriptionOptions(await loadSubscriptionCatalog()):[])],status:catalog?"server_qualification":"unavailable"},{headers:{"Cache-Control":"no-store"}});
}

export async function POST(request: Request) {
  const session = await requireWorkspaceApiSession(request);
  if (session instanceof NextResponse) return session;

  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Requete invalide.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const workspaceContext = getActiveWorkspaceContext({ ...session.ctx, email: session.user.email, emailVerified: authzIdentity(session.user).emailVerified });
    if (parsed.data.subscriptionSelection) {
      // The CLI runs on a personal subscription on this machine: only its holder
      // (ORIA_SUBSCRIPTION_OWNERS, default MICHAEL_HQ_OWNER_ID) may use it, even
      // once #410 widens this route to other workspace owners/members (SENT-X-1, SENT-412-8).
      if (!isSubscriptionOwner(session.user.id)) {
        return NextResponse.json({ error: "Abonnement CLI réservé à son titulaire.", code: "SUBSCRIPTION_OWNER_ONLY" }, { status: 403 });
      }
      const turn = await runSubscriptionTurn(parsed.data.subscriptionSelection, parsed.data.message, await loadSubscriptionCatalog());
      return NextResponse.json(turn, turn.reason === "runtime_busy" ? { status: 429, headers: { "Retry-After": "5" } } : undefined);
    }
    const catalog=await loadChatCapabilityCatalog();
    const binding=resolveChatModelBinding(catalog,workspaceContext.workspace.id,parsed.data.modelSelection);
    const result = await runJorisCommand(parsed.data.message, workspaceContext, undefined, binding);
    return NextResponse.json({...result,consumptionMode:"pay_per_use_api"});
  } catch (error) {
    if (error instanceof CalendarServiceError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }

    if (error instanceof CalendarRepositoryError) {
      return NextResponse.json(
        { error: "Le calendrier n'est pas disponible pour le moment.", code: error.code },
        { status: 503 },
      );
    }

    logger.error("joris.command.failed", {
      reason: error instanceof Error ? error.message : "unknown",
    });

    return NextResponse.json(
      { error: "Joris a eu un probleme serveur." },
      { status: 500 },
    );
  }
}
