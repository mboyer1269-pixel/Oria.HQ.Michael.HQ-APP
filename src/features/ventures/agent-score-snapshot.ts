// src/features/ventures/agent-score-snapshot.ts
//
// Pure model for a point-in-time snapshot of an agent's operator score. Storing
// these turns a single instantaneous score into a performance CURVE: the CEO can
// see whether an agent is trending up, flat, or decaying, and allocate compute
// accordingly.
//
// A snapshot is a derived, read-only record. It authorizes nothing, fires
// nothing, and never executes. Pure/local: no DB, no network, no UI, no runtime.
// It reuses the operator-score types so the snapshot stays coherent with the
// live scorer.

import type {
  AgentOperatorScore,
  OperatorDimension,
  OperatorDimensionScores,
  OperatorScoreBand,
  OperatorStatus,
} from "./auto-agent-operator-score";
import { AGENT_OPERATOR_DIMENSIONS } from "./auto-agent-operator-score";

// ---------------------------------------------------------------------------
// SECTION A — The snapshot type
// ---------------------------------------------------------------------------

export type AgentScoreSnapshot = {
  snapshotId: string;
  agentId: string;
  scoredAt: string; // ISO date string

  totalOperatorScore: number; // 0–100
  operatorScoreBand: OperatorScoreBand;
  operatorStatus: OperatorStatus;
  dimensionScores: OperatorDimensionScores;

  // How many revenue outcomes fed the score — context for reading the number.
  outcomeCount: number;
};

// ---------------------------------------------------------------------------
// SECTION B — Validation
// ---------------------------------------------------------------------------

export type AgentScoreSnapshotValidation = {
  valid: boolean;
  errors: string[];
};

function requireText(value: unknown, field: string, errors: string[]): void {
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`${field} must be non-empty`);
  }
}

function requireScore(value: unknown, field: string, errors: string[]): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    errors.push(`${field} must be a number between 0 and 100`);
  }
}

export function validateAgentScoreSnapshot(
  snapshot: AgentScoreSnapshot,
): AgentScoreSnapshotValidation {
  const errors: string[] = [];

  requireText(snapshot.snapshotId, "snapshotId", errors);
  requireText(snapshot.agentId, "agentId", errors);

  if (typeof snapshot.scoredAt !== "string" || isNaN(+new Date(snapshot.scoredAt))) {
    errors.push("scoredAt must be a valid ISO date string");
  }

  requireScore(snapshot.totalOperatorScore, "totalOperatorScore", errors);

  if (!snapshot.dimensionScores || typeof snapshot.dimensionScores !== "object") {
    errors.push("dimensionScores must be present");
  } else {
    for (const dim of AGENT_OPERATOR_DIMENSIONS) {
      requireScore(snapshot.dimensionScores[dim], `dimensionScores.${dim}`, errors);
    }
  }

  if (
    typeof snapshot.outcomeCount !== "number" ||
    !Number.isInteger(snapshot.outcomeCount) ||
    snapshot.outcomeCount < 0
  ) {
    errors.push("outcomeCount must be a non-negative integer");
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// SECTION C — Builder (from a live operator score)
// ---------------------------------------------------------------------------

export type BuildAgentScoreSnapshotInput = {
  score: AgentOperatorScore;
  scoredAt: string;
  outcomeCount: number;
  // Optional explicit id; otherwise derived deterministically from agent + time.
  snapshotId?: string;
};

function copyDimensionScores(dims: OperatorDimensionScores): OperatorDimensionScores {
  const out = {} as Record<OperatorDimension, number>;
  for (const dim of AGENT_OPERATOR_DIMENSIONS) {
    out[dim] = dims[dim];
  }
  return out;
}

// Build a snapshot from a computed operator score. Deterministic — derives a
// stable id from agentId + scoredAt when none is provided.
export function buildAgentScoreSnapshot(
  input: BuildAgentScoreSnapshotInput,
): AgentScoreSnapshot {
  const { score, scoredAt, outcomeCount } = input;
  return {
    snapshotId: input.snapshotId ?? `${score.agentId}_score_${scoredAt}`,
    agentId: score.agentId,
    scoredAt,
    totalOperatorScore: score.totalOperatorScore,
    operatorScoreBand: score.operatorScoreBand,
    operatorStatus: score.operatorStatus,
    dimensionScores: copyDimensionScores(score.dimensionScores),
    outcomeCount,
  };
}
