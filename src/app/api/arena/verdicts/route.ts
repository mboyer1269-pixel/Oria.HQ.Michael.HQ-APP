import { NextResponse } from "next/server";
import { requireOwnerApiSession } from "@/server/auth/owner";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { defaultArenaEvaluationService } from "@/server/arena/arena-evaluation-service";

type ArenaEvaluationService = typeof defaultArenaEvaluationService;

function getArenaEvaluationService(): ArenaEvaluationService {
  const globals = globalThis as typeof globalThis & {
    __arenaEvaluationServiceTestOverride?: ArenaEvaluationService;
  };

  return globals.__arenaEvaluationServiceTestOverride ?? defaultArenaEvaluationService;
}

// GET /api/arena/verdicts
// Returns all non-expired verdicts for the authenticated owner's active workspace.
export async function GET() {
  const authError = await requireOwnerApiSession();
  if (authError) return authError;

  const { activeWorkspace } = getActiveWorkspaceContext();
  const records = await getArenaEvaluationService().listVerdicts(activeWorkspace.id);
  return NextResponse.json({ verdicts: records, total: records.length });
}
