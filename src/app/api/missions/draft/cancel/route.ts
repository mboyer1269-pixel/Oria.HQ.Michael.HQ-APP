import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { requireOwnerApiSession } from "@/server/auth/owner";
import { cancelPendingMissionDraft } from "@/server/missions/mission-draft-control";

const requestSchema = z.object({
  pendingDraftId: z.string().min(1).optional(),
});

/**
 * POST /api/missions/draft/cancel
 *
 * Cancels the pending mission draft without booking.
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

  const ctx = getActiveWorkspaceContext();
  const result = cancelPendingMissionDraft(ctx, {
    pendingDraftId: parsed.data.pendingDraftId,
  });

  return NextResponse.json(result);
}
