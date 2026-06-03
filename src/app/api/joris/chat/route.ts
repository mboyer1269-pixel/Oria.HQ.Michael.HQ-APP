import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { requireOwnerApiSession } from "@/server/auth/owner";
import { CalendarRepositoryError } from "@/server/calendar/calendar-repository";
import { CalendarServiceError } from "@/server/calendar/calendar-service";
import { runJorisCommand } from "@/server/joris/brain";
import { logger } from "@/lib/logger";

const requestSchema = z.object({
  message: z.string().min(1).max(4000),
  locale: z.literal("fr-CA").default("fr-CA"),
});

export async function POST(request: Request) {
  const authResponse = await requireOwnerApiSession();
  if (authResponse) return authResponse;

  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Requete invalide.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const workspaceContext = getActiveWorkspaceContext();
    const result = await runJorisCommand(parsed.data.message, workspaceContext);
    return NextResponse.json(result);
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
