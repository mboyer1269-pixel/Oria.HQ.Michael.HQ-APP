import {
  canPrepareExecution,
  buildDryRunExecutionPlan,
} from "@/server/runtime/execution-guard";
import type { ExecutionGuardInput } from "@/server/runtime/execution-guard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ArenaCandidateKind = "mission" | "idea" | "agent-action";

export type ArenaDecision = "promising" | "marginal" | "reject" | "not-evaluable";

export type ArenaCandidate = {
  id: string;
  kind: ArenaCandidateKind;
  title: string;
  workspaceId: string;
  missionId?: string;
  skillId?: string;
  agentId?: string;
  objective?: string;
  expectedOutput?: string;
  riskLevel?: "low" | "medium" | "high";
  autonomyLevel?: number;
  assumedRevenueInfluencedCents?: number;
  estimatedCostCents?: number;
};

export type ArenaVerdict = {
  candidateId: string;
  kind: ArenaCandidateKind;
  decision: ArenaDecision;
  score: number;
  netValueCents: number | null;
  roiMultiple: number | null;
  executable: boolean;
  guardReason?: string;
  reasons: string[];
};

export type ArenaEvaluationContext = {
  requestedMode?: "read-only" | "dry-run";
};

type CandidateValueEstimate = {
  netValueCents: number | null;
  roiMultiple: number | null;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Hard ceiling on caller-supplied revenue to catch obviously invalid inputs.
// $10M (1,000,000,000 cents) — revise upward in PR7.2 if needed.
export const REVENUE_SANITY_CEILING_CENTS = 1_000_000_000;

// ---------------------------------------------------------------------------
// Value estimation
// ---------------------------------------------------------------------------

/**
 * Deterministic. Uses caller-supplied assumedRevenueInfluencedCents.
 * Never invents revenue. Returns null fields when inputs are absent.
 */
export function estimateCandidateValue(candidate: ArenaCandidate): CandidateValueEstimate {
  const revenue = candidate.assumedRevenueInfluencedCents;
  const cost = candidate.estimatedCostCents;

  if (revenue === undefined || revenue === null || cost === undefined || cost === null) {
    return { netValueCents: null, roiMultiple: null };
  }

  const netValueCents = revenue - cost;
  const roiMultiple = cost > 0 ? revenue / cost : null;
  return { netValueCents, roiMultiple };
}

// ---------------------------------------------------------------------------
// Financial input validation
// ---------------------------------------------------------------------------

/**
 * Returns an error string if any provided financial input is out of bounds,
 * or null when inputs are valid (or absent — absence is handled separately).
 */
function validateFinancialInputs(candidate: ArenaCandidate): string | null {
  const revenue = candidate.assumedRevenueInfluencedCents;
  const cost = candidate.estimatedCostCents;

  if (revenue !== undefined && revenue !== null) {
    if (revenue < 0) {
      return "assumedRevenueInfluencedCents must be non-negative.";
    }
    if (revenue > REVENUE_SANITY_CEILING_CENTS) {
      return `assumedRevenueInfluencedCents exceeds sanity ceiling (${REVENUE_SANITY_CEILING_CENTS} cents = $10M).`;
    }
  }

  if (cost !== undefined && cost !== null) {
    if (cost < 0) {
      return "estimatedCostCents must be non-negative.";
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Scoring heuristic (hardcoded, no LLM, no external call)
// ---------------------------------------------------------------------------

function computeScore(candidate: ArenaCandidate, roiMultiple: number | null): number {
  let score = 50;

  // ROI contribution (0–30 points)
  if (roiMultiple === null) {
    // cost = 0 with positive revenue: treat as high-value
    score += 25;
  } else if (roiMultiple >= 5) {
    score += 30;
  } else if (roiMultiple >= 3) {
    score += 22;
  } else if (roiMultiple >= 2) {
    score += 15;
  } else if (roiMultiple >= 1.5) {
    score += 10;
  } else if (roiMultiple >= 1.0) {
    score += 5;
  }
  // roiMultiple < 1 → netValueCents < 0 → already rejected before this point

  // Risk penalty
  if (candidate.riskLevel === "high") score -= 15;
  else if (candidate.riskLevel === "medium") score -= 8;

  // Autonomy penalty — higher autonomy = more governance scrutiny
  const autonomy = candidate.autonomyLevel ?? 1;
  if (autonomy === 3) score -= 5;
  else if (autonomy >= 4) score -= 15;

  return Math.max(0, Math.min(100, score));
}

function decisionFromScore(score: number): ArenaDecision {
  if (score >= 70) return "promising";
  if (score >= 45) return "marginal";
  return "reject";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNotEvaluable(
  candidate: ArenaCandidate,
  reason: string,
  guardReason?: string,
): ArenaVerdict {
  return {
    candidateId: candidate.id,
    kind: candidate.kind,
    decision: "not-evaluable",
    score: 0,
    netValueCents: null,
    roiMultiple: null,
    executable: false,
    ...(guardReason !== undefined ? { guardReason } : {}),
    reasons: [reason],
  };
}

// ---------------------------------------------------------------------------
// Kind-specific evaluators (pure — no writes, no external calls, no LLM)
// ---------------------------------------------------------------------------

function evaluateIdea(candidate: ArenaCandidate): ArenaVerdict {
  const { netValueCents, roiMultiple } = estimateCandidateValue(candidate);
  if (netValueCents === null) {
    return makeNotEvaluable(
      candidate,
      "Missing assumedRevenueInfluencedCents or estimatedCostCents — ROI cannot be computed.",
    );
  }

  if (netValueCents < 0) {
    return {
      candidateId: candidate.id,
      kind: candidate.kind,
      decision: "reject",
      score: 0,
      netValueCents,
      roiMultiple,
      executable: false,
      reasons: [`Net value negative (${netValueCents} cents) — cost exceeds assumed revenue.`],
    };
  }

  const score = computeScore(candidate, roiMultiple);
  const autonomyLevel = candidate.autonomyLevel ?? 1;

  return {
    candidateId: candidate.id,
    kind: candidate.kind,
    decision: decisionFromScore(score),
    score,
    netValueCents,
    roiMultiple,
    executable: false, // ideas are not directly executable — no skill/agent assigned
    reasons: [
      `Score: ${score}. ROI multiple: ${roiMultiple !== null ? roiMultiple.toFixed(2) : "N/A (zero cost)"}.`,
      `Net value: ${netValueCents} cents.`,
      `Risk: ${candidate.riskLevel ?? "unspecified"}. Autonomy: ${autonomyLevel}.`,
      "Idea — not directly executable. Assign a skill and agent to make it executable.",
    ],
  };
}

function evaluateAgentAction(
  candidate: ArenaCandidate,
  context: ArenaEvaluationContext,
): ArenaVerdict {
  if (!candidate.skillId || !candidate.agentId) {
    return makeNotEvaluable(
      candidate,
      "agent-action requires both skillId and agentId to be evaluated.",
    );
  }

  const { netValueCents, roiMultiple } = estimateCandidateValue(candidate);
  if (netValueCents === null) {
    return makeNotEvaluable(
      candidate,
      "Missing assumedRevenueInfluencedCents or estimatedCostCents — ROI cannot be computed.",
    );
  }

  const autonomyLevel = candidate.autonomyLevel ?? 1;
  const guardInput: ExecutionGuardInput = {
    skillId: candidate.skillId,
    agentId: candidate.agentId,
    requestedMode: context.requestedMode ?? "dry-run",
    autonomyLevel,
  };

  let guardDecision;
  try {
    guardDecision = canPrepareExecution(guardInput);
  } catch {
    return makeNotEvaluable(candidate, "Guard threw unexpectedly — evaluation blocked.");
  }

  if (!guardDecision.allowed) {
    return makeNotEvaluable(
      candidate,
      `Guard denied: ${guardDecision.code} — ${guardDecision.reason}`,
      guardDecision.reason,
    );
  }

  const plan = buildDryRunExecutionPlan(guardInput);

  if (netValueCents < 0) {
    return {
      candidateId: candidate.id,
      kind: candidate.kind,
      decision: "reject",
      score: 0,
      netValueCents,
      roiMultiple,
      executable: true,
      reasons: [
        `Net value negative (${netValueCents} cents) — cost exceeds assumed revenue.`,
        `Guard: ${plan.summary}`,
      ],
    };
  }

  const score = computeScore(candidate, roiMultiple);

  return {
    candidateId: candidate.id,
    kind: candidate.kind,
    decision: decisionFromScore(score),
    score,
    netValueCents,
    roiMultiple,
    executable: true,
    reasons: [
      `Score: ${score}. ROI multiple: ${roiMultiple !== null ? roiMultiple.toFixed(2) : "N/A (zero cost)"}.`,
      `Net value: ${netValueCents} cents.`,
      `Risk: ${candidate.riskLevel ?? "unspecified"}. Autonomy: ${autonomyLevel}.`,
      `Guard: ${plan.summary}`,
    ],
  };
}

// ---------------------------------------------------------------------------
// Core evaluation (pure — no writes, no external calls, no LLM)
// ---------------------------------------------------------------------------

/**
 * Evaluates a single candidate and returns an ArenaVerdict.
 *
 * Pure function. Uses the PR6 execution guard to check feasibility for
 * mission and agent-action kinds. Does not execute, persist, write, or
 * call any external system.
 */
export function evaluateCandidate(
  candidate: ArenaCandidate,
  context: ArenaEvaluationContext = {},
): ArenaVerdict {
  // Sanity-check financial inputs before kind-specific logic
  const sanityError = validateFinancialInputs(candidate);
  if (sanityError) {
    return makeNotEvaluable(candidate, sanityError);
  }

  if (candidate.kind === "idea") {
    return evaluateIdea(candidate);
  }

  if (candidate.kind === "agent-action") {
    return evaluateAgentAction(candidate, context);
  }

  // mission path
  const { netValueCents, roiMultiple } = estimateCandidateValue(candidate);
  if (netValueCents === null) {
    return makeNotEvaluable(
      candidate,
      "Missing assumedRevenueInfluencedCents or estimatedCostCents — ROI cannot be computed.",
    );
  }

  const autonomyLevel = candidate.autonomyLevel ?? 1;
  const guardInput: ExecutionGuardInput = {
    skillId: candidate.skillId ?? "mission.plan",
    agentId: candidate.agentId ?? "joris",
    requestedMode: context.requestedMode ?? "dry-run",
    autonomyLevel,
  };

  let guardDecision;
  try {
    guardDecision = canPrepareExecution(guardInput);
  } catch {
    return makeNotEvaluable(candidate, "Guard threw unexpectedly — evaluation blocked.");
  }

  if (!guardDecision.allowed) {
    return makeNotEvaluable(
      candidate,
      `Guard denied: ${guardDecision.code} — ${guardDecision.reason}`,
      guardDecision.reason,
    );
  }

  const plan = buildDryRunExecutionPlan(guardInput);

  if (netValueCents < 0) {
    return {
      candidateId: candidate.id,
      kind: candidate.kind,
      decision: "reject",
      score: 0,
      netValueCents,
      roiMultiple,
      executable: true,
      reasons: [
        `Net value negative (${netValueCents} cents) — cost exceeds assumed revenue.`,
        `Guard: ${plan.summary}`,
      ],
    };
  }

  const score = computeScore(candidate, roiMultiple);

  const reasons: string[] = [
    `Score: ${score}. ROI multiple: ${roiMultiple !== null ? roiMultiple.toFixed(2) : "N/A (zero cost)"}.`,
    `Net value: ${netValueCents} cents.`,
    `Risk: ${candidate.riskLevel ?? "unspecified"}. Autonomy: ${autonomyLevel}.`,
    `Guard: ${plan.summary}`,
  ];

  return {
    candidateId: candidate.id,
    kind: candidate.kind,
    decision: decisionFromScore(score),
    score,
    netValueCents,
    roiMultiple,
    executable: true,
    reasons,
  };
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

/**
 * Evaluates all candidates and sorts by score descending.
 * not-evaluable verdicts are always placed at the bottom.
 */
export function rankCandidates(
  candidates: ArenaCandidate[],
  context: ArenaEvaluationContext = {},
): ArenaVerdict[] {
  const verdicts = candidates.map((c) => evaluateCandidate(c, context));

  return verdicts.sort((a, b) => {
    const aIsNE = a.decision === "not-evaluable";
    const bIsNE = b.decision === "not-evaluable";
    if (aIsNE && !bIsNE) return 1;
    if (!aIsNE && bIsNE) return -1;
    return b.score - a.score;
  });
}
