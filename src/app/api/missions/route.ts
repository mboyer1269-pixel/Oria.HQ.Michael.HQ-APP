import { NextResponse } from "next/server";
import { requireOwnerApiSession } from "@/server/auth/owner";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { listMissionsForWorkspace } from "@/server/missions";

/**
 * GET /api/missions
 *
 * Returns the missions for the authenticated owner's active workspace.
 * Read-only. No query parameters accepted — workspace and mode are resolved
 * server-side from the authenticated session to prevent cross-workspace reads.
 */
export async function GET() {
  const authResponse = await requireOwnerApiSession();
  if (authResponse) return authResponse;

  try {
    const { activeWorkspace, activeMode } = getActiveWorkspaceContext();
    const result = listMissionsForWorkspace({
      workspaceId: activeWorkspace.id,
      modeId: activeMode.id,
    });

    return NextResponse.json({
      workspaceId: result.workspaceId,
      modeId: result.modeId,
      source: result.source,
      missions: result.missions,
    });
  } catch (error) {
    console.error("GET /api/missions failed:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Missions unavailable." }, { status: 500 });
  }
}
