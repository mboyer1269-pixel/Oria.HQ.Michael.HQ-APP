import type { Mission } from "@/core/types";
import type { Json } from "@/server/db/types";
import { createOptionalSupabaseAdminClient } from "@/server/supabase/admin";

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
 * admin client. Upsert by id so a re-confirm is idempotent. Throws (fail-closed)
 * when no Supabase admin client is configured — the caller must only reach this
 * path with durable persistence enabled and Supabase available.
 */
export async function persistMissionDraftDurable(mission: Mission): Promise<Mission> {
  const supabase = createOptionalSupabaseAdminClient();

  if (!supabase) {
    throw new MissionDraftDurableRepositoryError(
      "Durable mission draft persistence requires a configured Supabase admin client.",
    );
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
  });

  if (error) {
    throw new MissionDraftDurableRepositoryError(
      `Failed to persist mission draft to Supabase: ${error.message}`,
    );
  }

  return mission;
}
