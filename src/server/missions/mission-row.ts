import type { Mission } from "@/core/types";
import type { MissionRow } from "@/server/db/types";

export function mapMissionRow(row: MissionRow): Mission {
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
