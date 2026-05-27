import { NextResponse } from "next/server";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { requireOwnerApiSession } from "@/server/auth/owner";
import { getMissionDraftPendingView } from "@/server/missions/mission-draft-control";

/**
 * GET /api/missions/draft/pending
 *
 * Returns the current pending mission draft for the authenticated owner session.
 * Read-only; does not confirm or cancel.
 */
export async function GET() {
  const authResponse = await requireOwnerApiSession();
  if (authResponse) return authResponse;

  const ctx = getActiveWorkspaceContext();
  const pending = getMissionDraftPendingView(ctx);

  return NextResponse.json(pending);
}
