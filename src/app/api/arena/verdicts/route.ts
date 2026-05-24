import { NextResponse } from "next/server";
import { requireOwnerApiSession } from "@/server/auth/owner";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { defaultArenaEvaluationService } from "@/server/arena/arena-evaluation-service";

// GET /api/arena/verdicts
// Returns all non-expired verdicts for the authenticated owner's active workspace.
export async function GET() {
  const authError = await requireOwnerApiSession();
  if (authError) return authError;

  const { activeWorkspace } = getActiveWorkspaceContext();
  const records = await defaultArenaEvaluationService.listVerdicts(activeWorkspace.id);
  return NextResponse.json({ verdicts: records, total: records.length });
}
