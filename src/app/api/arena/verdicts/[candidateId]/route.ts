import { NextResponse } from "next/server";
import { requireOwnerApiSession } from "@/server/auth/owner";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { getArenaEvaluationService } from "@/server/arena/get-arena-service";

// GET /api/arena/verdicts/[candidateId]
// Returns a specific verdict scoped to the authenticated owner's active workspace.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  const authError = await requireOwnerApiSession();
  if (authError) return authError;

  const { activeWorkspace } = getActiveWorkspaceContext();
  const { candidateId } = await params;

  if (!candidateId || typeof candidateId !== "string") {
    return NextResponse.json({ error: "candidateId is required." }, { status: 400 });
  }

  const record = await getArenaEvaluationService().getVerdict(candidateId, activeWorkspace.id);

  if (!record) {
    return NextResponse.json(
      { error: `No verdict found for candidateId: ${candidateId}` },
      { status: 404 },
    );
  }

  return NextResponse.json(record);
}
