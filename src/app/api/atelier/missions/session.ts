import { NextResponse } from "next/server";
import { requireWorkspaceApiSession } from "@/server/auth/owner";
import { isSubscriptionOwner } from "@/server/ai/subscription-owner";
import { reapOrphanChildren } from "@/server/atelier/atelier-mission";
import type { AtelierCtx } from "./handlers";

/**
 * B1 boundary (PR #410): authenticated identity + explicit/legacy workspace (x-oria-workspace header or ?workspace=).
 * Reads: any member of the workspace. Mutations launch CLIs on a PERSONAL subscription: workspace owner AND
 * subscription owner (SENT-X-1, SENT-412-8). Errors are { error, code }.
 */
export async function atelierSession(request: Request): Promise<AtelierCtx | NextResponse> {
  const session = await requireWorkspaceApiSession(request);
  if (session instanceof NextResponse) return session;
  if (request.method === "GET" || request.method === "HEAD") return { userId: session.ctx.userId, workspaceId: session.ctx.workspaceId };
  if (session.ctx.role !== "owner") {
    return NextResponse.json({ error: "Action réservée au propriétaire de l'espace.", code: "atelier_owner_only" }, { status: 403 });
  }
  if (!isSubscriptionOwner(session.ctx.userId)) {
    return NextResponse.json({ error: "Abonnement CLI réservé à son titulaire.", code: "subscription_owner_only" }, { status: 403 });
  }
  // SENT-412-9: orphan cleanup only on an authorised owner action (never on a read), at every such action.
  try { reapOrphanChildren(); } catch { /* never blocks the request */ }
  return { userId: session.ctx.userId, workspaceId: session.ctx.workspaceId };
}
export const isResponse = (v: unknown): v is NextResponse => v instanceof NextResponse;
