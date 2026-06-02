// src/features/ventures/auto-agent-operator-score.ts
//
// Pure TypeScript engine that scores an agent as an economic operator.
// Input: AgentRevenueOutcome records for this agent (caller filters by agentId).
// Output: AgentOperatorScore — explainable, deterministic, cash-first.
//
// Scores the agent, not the venture. VentureCashScore handles the venture.
// Dependency-free: no Supabase, no DB, no network, no UI, no persistence,
// no migrations, no server actions, no API routes, no runtime execution.
//
// Humans stay on the loop at every step. All governance locks pinned to true.
// No firing, no demotion, no removal — classification and routing only.

import type { AgentRevenueOutcome, AgentRevenueOutcomeSignalKey } from "./agent-revenue-outcome";

// ---------------------------------------------------------------------------
// SECTION A — Dimension weights
// ---------------------------------------------------------------------------

// revenueImpact is the dominant signal. skillGrowth counts but never overrides
// cash contribution. Weights sum to 100.
export const AGENT_OPERATOR_SCORE_WEIGHTS = {
  revenueImpact: 30,
  economicInitiative: 15,
  executionEfficiency: 15,
  productionQuality: 15,
  credibility: 10,
  usefulInnovation: 10,
  skillGrowth: 5,
} as const;

export type OperatorDimension = keyof typeof AGENT_OPERATOR_SCORE_WEIGHTS;

export const AGENT_OPERATOR_DIMENSIONS: readonly OperatorDimension[] = [
  "revenueImpact",
  "economicInitiative",
  "executionEfficiency",
  "productionQuality",
  "credibility",
  "usefulInnovation",
  "skillGrowth",
];

// talentSignal is explanatory only — capped so it cannot rescue an agent with
// no revenue contribution or evidence quality.
export const TALENT_SIGNAL_MAX_CONTRIBUTION_PCT = 0.03;

// Minimum fraction of outcomes that must carry evidence to avoid the
// lowEvidenceRatePenalty.
export const EVIDENCE_RATE_THRESHOLD = 0.5;

// Signal score at or above which evidence is required for credibility to hold.
const CREDIBILITY_EVIDENCE_THRESHOLD = 60;

const CREDIBILITY_SIGNAL_KEYS: AgentRevenueOutcomeSignalKey[] = [
  "customerProof",
  "paymentSignal",
  "painClarity",
  "buyerIdentifiability",
  "offerTestability",
];

// ---------------------------------------------------------------------------
// SECTION B — Score bands and operator status
// ---------------------------------------------------------------------------

export type OperatorScoreBand =
  | "underperforming" // 0–24
  | "developing"      // 25–44
  | "capable"         // 45–69
  | "high_performer"  // 70–84
  | "elite_operator"; // 85–100

export type OperatorStatus =
  | "insufficient_evidence"
  | "underperforming_operator"
  | "developing_operator"
  | "capable_operator"
  | "high_performer"
  | "elite_operator";

// ---------------------------------------------------------------------------
// SECTION C — Penalty types
// ---------------------------------------------------------------------------

export type OperatorPenalty = {
  code:
    | "noRevenueContributionPenalty"
    | "lowEvidenceRatePenalty"
    | "unsupportedHighClaimPenalty"
    | "repeatedActionPenalty"
    | "noInitiativePenalty"
    | "vanityWorkPenalty";
  reason: string;
  points: number;
};

// ---------------------------------------------------------------------------
// SECTION D — Output types
// ---------------------------------------------------------------------------

export type OperatorDimensionScores = Record<OperatorDimension, number>;

export type AgentOperatorScore = {
  agentId: string;
  totalOperatorScore: number;       // 0–100, after penalties
  operatorScoreBand: OperatorScoreBand;
  dimensionScores: OperatorDimensionScores;
  talentSignal: number;             // 0–100, explanatory — not in weighted total
  scoreReasons: string[];
  penalties: OperatorPenalty[];
  operatorStatus: OperatorStatus;
  shouldAssignMoreWork: boolean;
  shouldRequireStrongerEvidence: boolean;
  shouldPairWithAgent: boolean;
  shouldFlagForReview: boolean;
  strongestDimension: OperatorDimension;
  weakestDimension: OperatorDimension;
  nextOperatorFocus: string;
  humanOnTheLoop: true;
  approvalRequired: true;
  noExecutionAuthorized: true;
};

// ---------------------------------------------------------------------------
// SECTION E — Internal helpers
// ---------------------------------------------------------------------------

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// Verified cash counts double, capped at 100 — mirrors the VentureCashScore
// approach so the two scoring layers stay coherent.
function cashGeneratedScore(outcomes: AgentRevenueOutcome[]): number {
  if (outcomes.length === 0) return 0;
  const totalCents = outcomes.reduce((acc, o) => acc + o.cashGenerated.amountCents, 0);
  if (totalCents === 0) return 0;
  const verifiedCents = outcomes.reduce(
    (acc, o) => acc + (o.cashGenerated.verified ? o.cashGenerated.amountCents : 0),
    0,
  );
  const weightedCents = verifiedCents * 2 + (totalCents - verifiedCents);
  return Math.min(100, Math.round((weightedCents / 200_000) * 100));
}

// ---------------------------------------------------------------------------
// SECTION F — Dimension calculators
// ---------------------------------------------------------------------------

// revenueImpact: cash (70%) + payment signal (30%)
function computeRevenueImpact(outcomes: AgentRevenueOutcome[]): number {
  if (outcomes.length === 0) return 0;
  const cashScore = cashGeneratedScore(outcomes);
  const paymentAvg = avg(outcomes.map((o) => o.paymentSignal.score));
  return Math.min(100, Math.round(cashScore * 0.7 + paymentAvg * 0.3));
}

// economicInitiative: agent proactively pursues payment, buyers, and testable offers
function computeEconomicInitiative(outcomes: AgentRevenueOutcome[]): number {
  if (outcomes.length === 0) return 0;
  const payment = avg(outcomes.map((o) => o.paymentSignal.score));
  const buyer = avg(outcomes.map((o) => o.buyerIdentifiability.score));
  const offer = avg(outcomes.map((o) => o.offerTestability.score));
  return Math.min(100, Math.round((payment + buyer + offer) / 3));
}

// executionEfficiency: fraction of outcomes that carry at least one piece of evidence
function computeExecutionEfficiency(outcomes: AgentRevenueOutcome[]): number {
  if (outcomes.length === 0) return 0;
  const evidencedCount = outcomes.filter(
    (o) =>
      o.customerProof.evidence.length > 0 ||
      o.paymentSignal.evidence.length > 0 ||
      o.painClarity.evidence.length > 0 ||
      o.buyerIdentifiability.evidence.length > 0 ||
      o.cashGenerated.evidence.length > 0,
  ).length;
  return Math.round((evidencedCount / outcomes.length) * 100);
}

// productionQuality: average of customerProof and offerTestability — outputs a
// buyer can evaluate and respond to
function computeProductionQuality(outcomes: AgentRevenueOutcome[]): number {
  if (outcomes.length === 0) return 0;
  const proof = avg(outcomes.map((o) => o.customerProof.score));
  const offer = avg(outcomes.map((o) => o.offerTestability.score));
  return Math.min(100, Math.round((proof + offer) / 2));
}

// credibility: fraction of high-scoring signals (>= 60) that are backed by evidence.
// No high claims → neutral 50 (conservative is not penalised here; penalties
// catch zero-evidence patterns elsewhere).
function computeCredibility(outcomes: AgentRevenueOutcome[]): number {
  if (outcomes.length === 0) return 0;
  let highClaims = 0;
  let backedClaims = 0;
  for (const o of outcomes) {
    for (const k of CREDIBILITY_SIGNAL_KEYS) {
      if (o[k].score >= CREDIBILITY_EVIDENCE_THRESHOLD) {
        highClaims++;
        if (o[k].evidence.length > 0) backedClaims++;
      }
    }
  }
  if (highClaims === 0) return 50;
  return Math.round((backedClaims / highClaims) * 100);
}

// usefulInnovation: uniqueness of nextCashAction labels — repeated proposals
// indicate stagnation. Single outcome returns neutral 50.
function computeUsefulInnovation(outcomes: AgentRevenueOutcome[]): number {
  if (outcomes.length === 0) return 0;
  if (outcomes.length === 1) return 50;
  const labels = outcomes.map((o) =>
    o.nextCashAction.actionLabel.trim().toLowerCase(),
  );
  return Math.round((new Set(labels).size / labels.length) * 100);
}

// skillGrowth: compares first-half vs second-half average signal scores.
// Single outcome → neutral 50.
function computeSkillGrowth(outcomes: AgentRevenueOutcome[]): number {
  if (outcomes.length === 0) return 0;
  if (outcomes.length === 1) return 50;
  const mid = Math.floor(outcomes.length / 2);
  const early = outcomes.slice(0, mid);
  const late = outcomes.slice(mid);
  const GROWTH_KEYS: AgentRevenueOutcomeSignalKey[] = [
    "customerProof",
    "paymentSignal",
    "painClarity",
    "buyerIdentifiability",
    "offerTestability",
  ];
  const avgForSet = (set: AgentRevenueOutcome[]) =>
    avg(set.flatMap((o) => GROWTH_KEYS.map((k) => o[k].score)));
  const improvement = avgForSet(late) - avgForSet(early);
  // +20 pts improvement → 100, no change → 50, -20 → 0
  return Math.max(0, Math.min(100, Math.round(50 + improvement * 2.5)));
}

// talentSignal: pain sensitivity + cash proximity — explanatory only, capped
function computeTalentSignal(outcomes: AgentRevenueOutcome[]): number {
  if (outcomes.length === 0) return 0;
  const pain = avg(outcomes.map((o) => o.painClarity.score));
  const proximity = avg(outcomes.map((o) => o.cashProximity.score));
  return Math.min(100, Math.round((pain + proximity) / 2));
}

// ---------------------------------------------------------------------------
// SECTION G — Weighted score computation
// ---------------------------------------------------------------------------

function computeAllDimensions(outcomes: AgentRevenueOutcome[]): OperatorDimensionScores {
  return {
    revenueImpact: computeRevenueImpact(outcomes),
    economicInitiative: computeEconomicInitiative(outcomes),
    executionEfficiency: computeExecutionEfficiency(outcomes),
    productionQuality: computeProductionQuality(outcomes),
    credibility: computeCredibility(outcomes),
    usefulInnovation: computeUsefulInnovation(outcomes),
    skillGrowth: computeSkillGrowth(outcomes),
  };
}

function computeWeightedScore(
  dims: OperatorDimensionScores,
  talentSignal: number,
): number {
  const coreScore = AGENT_OPERATOR_DIMENSIONS.reduce((acc, dim) => {
    return acc + (dims[dim] * AGENT_OPERATOR_SCORE_WEIGHTS[dim]) / 100;
  }, 0);
  // talentSignal contributes at most TALENT_SIGNAL_MAX_CONTRIBUTION_PCT of the
  // raw score so it cannot override weak revenue/evidence fundamentals.
  const talentBonus = Math.min(
    coreScore * TALENT_SIGNAL_MAX_CONTRIBUTION_PCT,
    talentSignal * TALENT_SIGNAL_MAX_CONTRIBUTION_PCT,
  );
  return Math.min(100, coreScore + talentBonus);
}

// ---------------------------------------------------------------------------
// SECTION H — Penalty detection
// ---------------------------------------------------------------------------

function detectPenalties(
  outcomes: AgentRevenueOutcome[],
  dims: OperatorDimensionScores,
): OperatorPenalty[] {
  const penalties: OperatorPenalty[] = [];

  if (outcomes.length === 0) return penalties;

  // noRevenueContributionPenalty: no payment signal AND no cash impact
  if (dims.revenueImpact === 0 && dims.economicInitiative === 0) {
    penalties.push({
      code: "noRevenueContributionPenalty",
      reason: "Agent produced no payment signal and no cash across all outcomes.",
      points: 15,
    });
  }

  // lowEvidenceRatePenalty: fewer than half of outcomes carry evidence
  const evidencedCount = outcomes.filter(
    (o) =>
      o.customerProof.evidence.length > 0 ||
      o.paymentSignal.evidence.length > 0 ||
      o.painClarity.evidence.length > 0 ||
      o.buyerIdentifiability.evidence.length > 0 ||
      o.cashGenerated.evidence.length > 0,
  ).length;
  const evidenceRate = evidencedCount / outcomes.length;
  if (evidenceRate < EVIDENCE_RATE_THRESHOLD) {
    penalties.push({
      code: "lowEvidenceRatePenalty",
      reason: `Only ${Math.round(evidenceRate * 100)}% of outcomes carry evidence (threshold: ${Math.round(EVIDENCE_RATE_THRESHOLD * 100)}%).`,
      points: 10,
    });
  }

  // unsupportedHighClaimPenalty: a signal scored >= 60 with no evidence
  const hasUnsupportedHighClaim = outcomes.some((o) =>
    CREDIBILITY_SIGNAL_KEYS.some(
      (k) => o[k].score >= CREDIBILITY_EVIDENCE_THRESHOLD && o[k].evidence.length === 0,
    ),
  );
  if (hasUnsupportedHighClaim) {
    penalties.push({
      code: "unsupportedHighClaimPenalty",
      reason: "Agent made at least one claim scored ≥ 60 without supporting evidence.",
      points: 8,
    });
  }

  // repeatedActionPenalty: every outcome proposes the same next action
  if (outcomes.length >= 2) {
    const labels = outcomes.map((o) =>
      o.nextCashAction.actionLabel.trim().toLowerCase(),
    );
    if (new Set(labels).size === 1) {
      penalties.push({
        code: "repeatedActionPenalty",
        reason: "Agent recommended the same next action across all outcomes — no initiative detected.",
        points: 8,
      });
    }
  }

  // noInitiativePenalty: no economic initiative — no payment, buyer, or testable offer
  if (dims.economicInitiative === 0) {
    penalties.push({
      code: "noInitiativePenalty",
      reason: "Agent showed no economic initiative across any outcome.",
      points: 8,
    });
  }

  // vanityWorkPenalty: 3+ outcomes with no revenue impact and no revenue evidence
  const revenueEvidenceCount = outcomes.reduce(
    (acc, o) =>
      acc + o.paymentSignal.evidence.length + o.cashGenerated.evidence.length,
    0,
  );
  if (outcomes.length >= 3 && dims.revenueImpact === 0 && revenueEvidenceCount === 0) {
    penalties.push({
      code: "vanityWorkPenalty",
      reason: "Multiple outcomes submitted with no revenue evidence — output volume without impact.",
      points: 8,
    });
  }

  return penalties;
}

// ---------------------------------------------------------------------------
// SECTION I — Operator status and decision flags
// ---------------------------------------------------------------------------

type OperatorDecision = {
  operatorStatus: OperatorStatus;
  shouldAssignMoreWork: boolean;
  shouldRequireStrongerEvidence: boolean;
  shouldPairWithAgent: boolean;
  shouldFlagForReview: boolean;
};

function bandFromScore(score: number): OperatorScoreBand {
  if (score >= 85) return "elite_operator";
  if (score >= 70) return "high_performer";
  if (score >= 45) return "capable";
  if (score >= 25) return "developing";
  return "underperforming";
}

function deriveOperatorDecision(
  outcomes: AgentRevenueOutcome[],
  dims: OperatorDimensionScores,
  finalScore: number,
): OperatorDecision {
  if (outcomes.length === 0) {
    return {
      operatorStatus: "insufficient_evidence",
      shouldAssignMoreWork: false,
      shouldRequireStrongerEvidence: false,
      shouldPairWithAgent: false,
      shouldFlagForReview: false,
    };
  }

  const band = bandFromScore(finalScore);

  const operatorStatusMap: Record<OperatorScoreBand, OperatorStatus> = {
    elite_operator: "elite_operator",
    high_performer: "high_performer",
    capable: "capable_operator",
    developing: "developing_operator",
    underperforming: "underperforming_operator",
  };
  const operatorStatus = operatorStatusMap[band];

  const evidenceQualityWeak =
    dims.executionEfficiency < 50 || dims.credibility < 50;

  return {
    operatorStatus,
    shouldAssignMoreWork: finalScore >= 60,
    shouldRequireStrongerEvidence: evidenceQualityWeak,
    // Pair when developing but not yet contributing revenue — needs a stronger partner
    shouldPairWithAgent:
      operatorStatus === "developing_operator" && dims.revenueImpact < 30,
    // Flag when underperforming, or when multiple outcomes carry zero evidence
    shouldFlagForReview:
      operatorStatus === "underperforming_operator" ||
      (dims.executionEfficiency === 0 && outcomes.length >= 2),
  };
}

// ---------------------------------------------------------------------------
// SECTION J — Strongest/weakest + nextOperatorFocus
// ---------------------------------------------------------------------------

function findStrongestAndWeakest(dims: OperatorDimensionScores): {
  strongest: OperatorDimension;
  weakest: OperatorDimension;
} {
  let strongest: OperatorDimension = "revenueImpact";
  let weakest: OperatorDimension = "revenueImpact";
  let maxScore = -1;
  let minScore = 101;

  for (const dim of AGENT_OPERATOR_DIMENSIONS) {
    const s = dims[dim];
    if (s > maxScore) { maxScore = s; strongest = dim; }
    if (s < minScore) { minScore = s; weakest = dim; }
  }

  return { strongest, weakest };
}

const NEXT_FOCUS_BY_WEAKEST: Record<OperatorDimension, string> = {
  revenueImpact:
    "Convert tasks directly to payment signals or closed cash — every action should point at a buyer who can pay now.",
  economicInitiative:
    "Proactively identify buyers, test offers, and pursue payment signals rather than waiting for task assignments.",
  executionEfficiency:
    "Back every outcome with at least one concrete evidence item before submitting — zero-evidence outcomes are not complete.",
  productionQuality:
    "Produce outputs a buyer can evaluate — testable offers and customer-facing proof, not internal analysis.",
  credibility:
    "When scoring a signal >= 60, attach the evidence immediately — do not claim strength without backing.",
  usefulInnovation:
    "Propose a different next cash action each time — repeated recommendations signal stagnation, not progress.",
  skillGrowth:
    "Build on prior outcomes — show improving signal scores and tighter evidence across successive submissions.",
};

// ---------------------------------------------------------------------------
// SECTION K — Score reasons
// ---------------------------------------------------------------------------

function buildReasons(
  dims: OperatorDimensionScores,
  talentSignal: number,
  penalties: OperatorPenalty[],
  finalScore: number,
  operatorStatus: OperatorStatus,
): string[] {
  const reasons: string[] = [];

  reasons.push(`Total operator score: ${finalScore}/100 (${operatorStatus}).`);

  for (const dim of AGENT_OPERATOR_DIMENSIONS) {
    reasons.push(
      `${dim}: ${Math.round(dims[dim])}/100 (weight ${AGENT_OPERATOR_SCORE_WEIGHTS[dim]}%).`,
    );
  }

  reasons.push(
    `talentSignal: ${Math.round(talentSignal)}/100 (explanatory, capped at ${Math.round(TALENT_SIGNAL_MAX_CONTRIBUTION_PCT * 100)}% contribution).`,
  );

  for (const p of penalties) {
    reasons.push(`Penalty [${p.code}]: -${p.points}pts — ${p.reason}`);
  }

  return reasons;
}

// ---------------------------------------------------------------------------
// SECTION L — scoreAgentOperator (main export)
// ---------------------------------------------------------------------------

export function scoreAgentOperator(
  agentId: string,
  outcomes: AgentRevenueOutcome[],
): AgentOperatorScore {
  if (!agentId || agentId.trim() === "") {
    throw new Error("agentId must be non-empty");
  }

  const dims = computeAllDimensions(outcomes);
  const talentSignal = computeTalentSignal(outcomes);
  const rawScore = computeWeightedScore(dims, talentSignal);
  const penalties = detectPenalties(outcomes, dims);
  const totalPenaltyPoints = penalties.reduce((acc, p) => acc + p.points, 0);
  const totalOperatorScore = Math.max(0, Math.round(rawScore - totalPenaltyPoints));

  const operatorScoreBand = bandFromScore(totalOperatorScore);
  const decision = deriveOperatorDecision(outcomes, dims, totalOperatorScore);
  const { strongest, weakest } = findStrongestAndWeakest(dims);
  const nextOperatorFocus = NEXT_FOCUS_BY_WEAKEST[weakest];
  const scoreReasons = buildReasons(
    dims,
    talentSignal,
    penalties,
    totalOperatorScore,
    decision.operatorStatus,
  );

  return {
    agentId,
    totalOperatorScore,
    operatorScoreBand,
    dimensionScores: { ...dims },
    talentSignal,
    scoreReasons,
    penalties,
    operatorStatus: decision.operatorStatus,
    shouldAssignMoreWork: decision.shouldAssignMoreWork,
    shouldRequireStrongerEvidence: decision.shouldRequireStrongerEvidence,
    shouldPairWithAgent: decision.shouldPairWithAgent,
    shouldFlagForReview: decision.shouldFlagForReview,
    strongestDimension: strongest,
    weakestDimension: weakest,
    nextOperatorFocus,
    humanOnTheLoop: true,
    approvalRequired: true,
    noExecutionAuthorized: true,
  };
}
