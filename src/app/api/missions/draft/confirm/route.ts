import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { requireOwnerApiSession } from "@/server/auth/owner";
import { CalendarRepositoryError } from "@/server/calendar/calendar-repository";
import { CalendarServiceError } from "@/server/calendar/calendar-service";
import { confirmPendingMissionDraft } from "@/server/missions/mission-draft-control";

const requestSchema = z.object({
  pendingDraftId: z.string().min(1).optional(),
});

/**
 * POST /api/missions/draft/confirm
 *
 * Confirms the pending calendar.book mission draft (same path as Joris « confirme »).
 * Not live mission execution — creates local draft + calendar event + ledger.
 */
export async function POST(request: Request) {
  const authResponse = await requireOwnerApiSession();
  if (authResponse) return authResponse;

  const body = await request.json().catch(() => ({}));
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Requête invalide.",
        issues: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  try {
    const ctx = getActiveWorkspaceContext();
    const result = await confirmPendingMissionDraft(ctx, {
      pendingDraftId: parsed.data.pendingDraftId,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CalendarServiceError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
        },
        { status: error.status },
      );
    }

    if (error instanceof CalendarRepositoryError) {
      return NextResponse.json(
        {
          error: "Le calendrier n'est pas disponible pour le moment.",
          code: error.code,
        },
        { status: 503 },
      );
    }

    console.error(
      "POST /api/missions/draft/confirm failed:",
      error instanceof Error ? error.message : "Unknown error",
    );

    return NextResponse.json({ error: "Confirmation indisponible." }, { status: 500 });
  }
}
