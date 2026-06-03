// src/server/ventures/agent-score-snapshot-row-mapping.ts
//
// Pure row <-> AgentScoreSnapshot mapping for the agent-score-snapshot
// persistence layer. Side-effect free. Validates the band/status whitelists and
// the dimension_scores shape; an invalid row throws AgentScoreSnapshotMappingError
// rather than producing a half-populated snapshot.

import type {
  AgentScoreSnapshot,
} from "@/features/ventures/agent-score-snapshot";
import type {
  OperatorDimension,
  OperatorDimensionScores,
  OperatorScoreBand,
  OperatorStatus,
} from "@/features/ventures/auto-agent-operator-score";
import { AGENT_OPERATOR_DIMENSIONS } from "@/features/ventures/auto-agent-operator-score";
import type { AgentScoreSnapshotInsert, AgentScoreSnapshotRow, Json } from "@/server/db/types";

const BANDS: ReadonlySet<string> = new Set<OperatorScoreBand>([
  "underperforming",
  "developing",
  "capable",
  "high_performer",
  "elite_operator",
]);

const STATUSES: ReadonlySet<string> = new Set<OperatorStatus>([
  "insufficient_evidence",
  "underperforming_operator",
  "developing_operator",
  "capable_operator",
  "high_performer",
  "elite_operator",
]);

export class AgentScoreSnapshotMappingError extends Error {
  constructor(message: string) {
    super(`Agent score snapshot mapping failed: ${message}`);
    this.name = "AgentScoreSnapshotMappingError";
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new AgentScoreSnapshotMappingError(`missing or empty required field "${field}"`);
  }
  return value;
}

function requireBand(value: unknown): OperatorScoreBand {
  if (typeof value !== "string" || !BANDS.has(value)) {
    throw new AgentScoreSnapshotMappingError(`invalid operator_score_band "${String(value)}"`);
  }
  return value as OperatorScoreBand;
}

function requireStatus(value: unknown): OperatorStatus {
  if (typeof value !== "string" || !STATUSES.has(value)) {
    throw new AgentScoreSnapshotMappingError(`invalid operator_status "${String(value)}"`);
  }
  return value as OperatorStatus;
}

function requireScore(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new AgentScoreSnapshotMappingError(`${field} must be a number between 0 and 100`);
  }
  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireDimensionScores(value: unknown): OperatorDimensionScores {
  if (!isObject(value)) {
    throw new AgentScoreSnapshotMappingError("dimension_scores must be an object");
  }
  const out = {} as Record<OperatorDimension, number>;
  for (const dim of AGENT_OPERATOR_DIMENSIONS) {
    out[dim] = requireScore(value[dim], `dimension_scores.${dim}`);
  }
  return out;
}

function requireOutcomeCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new AgentScoreSnapshotMappingError("outcome_count must be a non-negative integer");
  }
  return value;
}

/**
 * Builds a DB insert from an AgentScoreSnapshot. Pure: the DB assigns id and
 * created_at. workspaceId and userId are the persistence scope.
 */
export function mapSnapshotToInsert(
  workspaceId: string,
  userId: string,
  snapshot: AgentScoreSnapshot,
): AgentScoreSnapshotInsert {
  return {
    workspace_id: requireString(workspaceId, "workspaceId"),
    created_by_user_id: requireString(userId, "userId"),
    snapshot_id: requireString(snapshot.snapshotId, "snapshotId"),
    agent_id: requireString(snapshot.agentId, "agentId"),
    scored_at: requireString(snapshot.scoredAt, "scoredAt"),
    total_operator_score: requireScore(snapshot.totalOperatorScore, "totalOperatorScore"),
    operator_score_band: requireBand(snapshot.operatorScoreBand),
    operator_status: requireStatus(snapshot.operatorStatus),
    dimension_scores: requireDimensionScores(snapshot.dimensionScores) as unknown as Json,
    outcome_count: requireOutcomeCount(snapshot.outcomeCount),
  };
}

/**
 * Builds an AgentScoreSnapshot from a DB row, validating whitelists and shape.
 */
export function mapRowToSnapshot(row: AgentScoreSnapshotRow): AgentScoreSnapshot {
  return {
    snapshotId: requireString(row.snapshot_id, "snapshot_id"),
    agentId: requireString(row.agent_id, "agent_id"),
    scoredAt: requireString(row.scored_at, "scored_at"),
    totalOperatorScore: requireScore(row.total_operator_score, "total_operator_score"),
    operatorScoreBand: requireBand(row.operator_score_band),
    operatorStatus: requireStatus(row.operator_status),
    dimensionScores: requireDimensionScores(row.dimension_scores),
    outcomeCount: requireOutcomeCount(row.outcome_count),
  };
}
