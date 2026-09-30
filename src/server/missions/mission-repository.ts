import type { Mission } from "@/core/types";
import { mockMissions } from "@/features/missions/seed";
import { isLocalPersistenceFallbackAllowed } from "@/lib/server-env";
import { mapMissionRow } from "./mission-row";
import { createOptionalSupabaseAdminClient } from "@/server/supabase/admin";
import { listLocalMissionDrafts } from "./mission-draft-repository";
import type { ListMissionsInput, ListMissionsResult } from "./types";

/**
 * Returns missions for a workspace. Supabase is the source of truth when
 * configured; development can fall back to the local seed without writes.
 */
export async function listMissionsForWorkspace(input: ListMissionsInput): Promise<ListMissionsResult> {
  const supabase = createOptionalSupabaseAdminClient();

  if (supabase) {
    let query = supabase
      .from("missions")
      .select()
      .eq("workspace_id", input.workspaceId)
      .order("created_at", { ascending: true });

    if (input.modeId !== undefined) {
      query = query.eq("mode_id", input.modeId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to list missions from Supabase: ${error.message}`);
    }

    return {
      workspaceId: input.workspaceId,
      modeId: input.modeId,
      missions: (data ?? []).map(mapMissionRow),
      source: "supabase",
    };
  }

  if (!isLocalPersistenceFallbackAllowed()) {
    throw new Error("Supabase configuration is required for mission persistence in production.");
  }

  let missions: Mission[] = mockMissions.filter((m) => m.workspaceId === input.workspaceId);

  if (input.modeId !== undefined) {
    missions = missions.filter((m) => m.modeId === input.modeId);
  }

  const localDrafts = listLocalMissionDrafts(input.workspaceId, input.modeId);
  const mergedById = new Map<string, Mission>();
  for (const mission of [...missions, ...localDrafts]) {
    mergedById.set(mission.id, mission);
  }

  return {
    workspaceId: input.workspaceId,
    modeId: input.modeId,
    missions: [...mergedById.values()],
    source: "local",
  };
}
