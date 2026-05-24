import type { Mission } from "@/core/types";
import { mockMissions } from "@/features/missions/seed";
import { isLocalPersistenceFallbackAllowed } from "@/lib/server-env";
import type { MissionRow } from "@/server/db/types";
import { createOptionalSupabaseAdminClient } from "@/server/supabase/admin";
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

  return {
    workspaceId: input.workspaceId,
    modeId: input.modeId,
    missions,
    source: "local",
  };
}

function mapMissionRow(row: MissionRow): Mission {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    modeId: row.mode_id,
    title: row.title,
    objective: row.objective,
    assignedAgentId: row.assigned_agent_id,
    autonomyLevel: row.autonomy_level as Mission["autonomyLevel"],
    status: row.status,
    riskLevel: row.risk_level,
    input: toRecord(row.input),
    expectedOutput: row.expected_output,
    requiresApproval: row.requires_approval,
    costBudgetCents: row.cost_budget_cents ?? undefined,
    result: row.result === null ? undefined : toRecord(row.result),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? undefined,
  };
}

function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}
