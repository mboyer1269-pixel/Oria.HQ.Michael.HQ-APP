import type { Mission } from "@/core/types";
import { mockMissions } from "@/features/missions/seed";
import type { ListMissionsInput, ListMissionsResult } from "./types";

/**
 * Returns missions for a workspace from the mock seed.
 *
 * This function enforces workspace isolation: only missions whose workspaceId
 * matches the input are returned. The pattern is forward-compatible with a
 * Supabase query behind RLS — swap the mock filter for a Supabase select when
 * the mission table migration is approved.
 *
 * No writes. No AI calls. No side effects.
 */
export function listMissionsForWorkspace(input: ListMissionsInput): ListMissionsResult {
  let missions: Mission[] = mockMissions.filter((m) => m.workspaceId === input.workspaceId);

  if (input.modeId !== undefined) {
    missions = missions.filter((m) => m.modeId === input.modeId);
  }

  return {
    workspaceId: input.workspaceId,
    modeId: input.modeId,
    missions,
    source: "mock",
  };
}
