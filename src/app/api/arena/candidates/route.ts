import { NextResponse } from "next/server";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { requireOwnerApiSession } from "@/server/auth/owner";
import { generateArenaCandidatesFromMissions } from "@/server/arena/arena-candidate-generator";
import { listMissionsForWorkspace } from "@/server/missions";

// GET /api/arena/candidates
export async function GET() {
  const authError = await requireOwnerApiSession();
  if (authError) return authError;

  const { activeWorkspace, activeMode } = getActiveWorkspaceContext();
  const missionsResult = await listMissionsForWorkspace({
    workspaceId: activeWorkspace.id,
    modeId: activeMode.id,
  });

  const candidates = generateArenaCandidatesFromMissions({
    missions: missionsResult.missions,
    workspaceId: activeWorkspace.id,
  });

  return NextResponse.json({
    workspaceId: activeWorkspace.id,
    modeId: activeMode.id,
    source: missionsResult.source,
    candidates,
  });
}
