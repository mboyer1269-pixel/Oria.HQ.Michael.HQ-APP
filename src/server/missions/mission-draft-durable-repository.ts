import type { Mission } from "@/core/types";
import type { Json } from "@/server/db/types";
import { createOptionalSupabaseAdminClient } from "@/server/supabase/admin";
import { mapMissionRow } from "./mission-row";

// Durable (Supabase) mission-draft persistence — DORMANT.
//
// This writes a mission draft to the existing `missions` table (status carried
// from the mission, typically 'draft'). It is gated behind the OFF-by-default
// mission-persistence flag and is NOT wired into the live confirmation path in
// this module; the dispatcher in mission-draft-repository.ts selects it only
// when the flag is enabled. No new migration is required — the missions table
// already exists (0001/0005).

export class MissionDraftDurableRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MissionDraftDurableRepositoryError";
  }
}

/**
 * Persist a mission draft durably to the `missions` table via the service-role
 * admin client. Insert-or-ignore by id so re-confirmation cannot overwrite an
 * existing mission or its external-dispatch reservation. Returns the canonical
 * persisted row, scoped to the workspace. Throws (fail-closed)
 * when no Supabase admin client is configured — the caller must only reach this
 * path with durable persistence enabled and Supabase available.
 */
export async function persistMissionDraftDurable(mission: Mission, supabase = createOptionalSupabaseAdminClient()): Promise<Mission> {

  if (!supabase) {
    throw new MissionDraftDurableRepositoryError(
      "Durable mission draft persistence requires a configured Supabase admin client.",
    );
  }

  if (Object.prototype.hasOwnProperty.call(mission.input, "_paperclipDispatch")) {
    throw new MissionDraftDurableRepositoryError("Draft creation cannot supply an external dispatch receipt.");
  }
  const { error } = await supabase.from("missions").upsert({
    id: mission.id,
    workspace_id: mission.workspaceId,
    mode_id: mission.modeId,
    title: mission.title,
    objective: mission.objective,
    assigned_agent_id: mission.assignedAgentId,
    autonomy_level: mission.autonomyLevel,
    status: mission.status,
    risk_level: mission.riskLevel,
    requires_approval: mission.requiresApproval,
    cost_budget_cents: mission.costBudgetCents ?? null,
    input: mission.input as unknown as Json,
    expected_output: mission.expectedOutput,
    result: (mission.result ?? null) as unknown as Json,
    created_at: mission.createdAt,
    updated_at: mission.updatedAt,
    completed_at: mission.completedAt ?? null,
  }, { onConflict: "id", ignoreDuplicates: true });

  if (error) {
    throw new MissionDraftDurableRepositoryError(
      `Failed to persist mission draft to Supabase: ${error.message}`,
    );
  }

  const { data, error: readError } = await supabase.from("missions").select().eq("id", mission.id).eq("workspace_id", mission.workspaceId).single();
  if (readError || !data) throw new MissionDraftDurableRepositoryError("Persisted mission is unavailable in this workspace.");
  return mapMissionRow(data);
}
