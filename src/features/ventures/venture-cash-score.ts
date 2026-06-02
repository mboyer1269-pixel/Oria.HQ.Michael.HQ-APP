// src/features/ventures/venture-cash-score.ts
//
// Pure TypeScript engine that scores a venture — not an agent — on how close it
// is to generating cash. Input is one or more AgentRevenueOutcome records; output
// is a fully explainable VentureCashScore with survival status, decision flags,
// and a next focus recommendation.
//
// Dependency-free: no Supabase, no DB, no network, no UI, no persistence,
// no migrations, no server actions, no API routes, no runtime execution.
// Humans stay on the loop: ceoDecisionRequired is derived, never bypassed.
// Kill / pivot are classifications only — never executed here.

import type { AgentRevenueOutcome, AgentRevenueOutcomeSignalKey } from "./agent-revenue-outcome";

// ---------------------------------------------------------------------------
// SECTION A — Dimension weights
// ---------------------------------------------------------------------------

// cashGenerated is the dominant signal. Everything else is pre-cash evidence.
// cashProximity is explanatory only — capped so it cannot overpower the hard signals.
export const VENTURE_CASH_SCORE_WEIGHTS = {
  cashGenerated: 30,
  paymentSignal: 20,
  buyerIdentifiability: 15,
  painClarity: 15,
  offerTestability: 10,
  customerProof: 10,
} as const;

export type VentureCashScoreDimension = keyof typeof VENTURE_CASH_SCORE_WEIGHTS;

export const VENTURE_CASH_SCORE_DIMENSIONS: readonly VentureCashScoreDimension[] = [
  "cashGenerated",
  "paymentSignal",
  "buyerIdentifiability",
  "painClarity",
  "offerTestability",
  "customerProof",
];

// cashProximity contributes only as a tie-breaker / explanatory signal, capped
// at this fraction of the final score to prevent fluffy proximity narratives
// from inflating a venture that has no payment evidence.
export const CASH_PROXIMITY_MAX_CONTRIBUTION_PCT = 0.05;

// ---------------------------------------------------------------------------
// SECTION B — Score bands and survival status
// ---------------------------------------------------------------------------

export type VentureCashScoreBand =
  | "blocked"    // 0–24
  | "weak"       // 25–44
  | "promising"  // 45–69
  | "strong"     // 70–84
  | "cash_ready"; // 85–100

export type VentureSurvivalStatus =
  | "insufficient_evidence"
  | "kill_candidate"
  | "pivot_candidate"
  | "continue_candidate"
  | "cash_ready";

// ---------------------------------------------------------------------------
// SECTION C — Penalty types
// ---------------------------------------------------------------------------

export type VentureCashPenalty = {
  code:
    | "vagueEvidencePenalty"
    | "unsupportedClaimPenalty"
    | "noBuyerPenalty"
    | "noPaymentSignalPenalty"
    | "vanityOutputPenalty"
    | "repeatedRecommendationPenalty"
    | "nonRevenueActivityPenalty";
  reason: string;
  points: number;
};

// ---------------------------------------------------------------------------
// SECTION D — Output type
// ---------------------------------------------------------------------------

export type VentureCashScore = {
  ventureId: string;
  totalCashScore: number;          // 0–100, after penalties
  cashScoreBand: VentureCashScoreBand;
  cashScoreReasons: string[];      // human-readable explanation lines
  penalties: VentureCashPenalty[];
  survivalStatus: VentureSurvivalStatus;
  shouldContinue: boolean;
  shouldPivot: boolean;
  isKillCandidate: boolean;
  shouldRequestCeoDecision: boolean;
  strongestSignal: VentureCashScoreDimension;
  weakestSignal: VentureCashScoreDimension;
  nextScoreFocus: string;          // human-readable recommendation
  // Governance — never bypassed.
  humanOnTheLoop: true;
  approvalRequired: true;
  noExecutionAuthorized: true;
};

// ---------------------------------------------------------------------------
// SECTION E — Internal helpers
// ---------------------------------------------------------------------------

function averageSignalScore(
  outcomes: AgentRevenueOutcome[],
  key: AgentRevenueOutcomeSignalKey,
): number {
  if (outcomes.length === 0) return 0;
  const sum = outcomes.reduce((acc, o) => acc + o[key].score, 0);
  return sum / outcomes.length;
}

// Cash score for cashGenerated is derived from the total amount across outcomes.
// Any positive verified amount scores strongly; unverified positive amount scores
// lower. We normalise to 0–100 using a soft cap at 100_000 cents (USD $1 000).
function cashGeneratedScore(outcomes: AgentRevenueOutcome[]): number {
  if (outcomes.length === 0) return 0;
  const totalCents = outcomes.reduce((acc, o) => acc + o.cashGenerated.amountCents, 0);
  if (totalCents === 0) return 0;
  const verifiedCents = outcomes.reduce(
    (acc, o) => acc + (o.cashGenerated.verified ? o.cashGenerated.amountCents : 0),
    0,
  );
  // A verified cent is worth 2× an unverified cent in scoring, capped at 100.
  const weightedCents = verifiedCents * 2 + (totalCents - verifiedCents);
  return Math.min(100, Math.round((weightedCents / 200_000) * 100));
}

function bandFromScore(score: number): VentureCashScoreBand {
  if (score >= 85) return "cash_ready";
  if (score >= 70) return "strong";
  if (score >= 45) return "promising";
  if (score >= 25) return "weak";
  return "blocked";
}

// ---------------------------------------------------------------------------
// SECTION F — scoringDimensions: the weighted score before penalties
// ---------------------------------------------------------------------------

type DimensionScores = Record<VentureCashScoreDimension, number>;

function computeDimensionScores(outcomes: AgentRevenueOutcome[]): DimensionScores {
  return {
    cashGenerated: cashGeneratedScore(outcomes),
    paymentSignal: averageSignalScore(outcomes, "paymentSignal"),
    buyerIdentifiability: averageSignalScore(outcomes, "buyerIdentifiability"),
    painClarity: averageSignalScore(outcomes, "painClarity"),
    offerTestability: averageSignalScore(outcomes, "offerTestability"),
    customerProof: averageSignalScore(outcomes, "customerProof"),
  };
}

function computeWeightedScore(
  dimScores: DimensionScores,
  outcomes: AgentRevenueOutcome[],
): number {
  // Core weighted score across the six dimensions.
  const coreScore = VENTURE_CASH_SCORE_DIMENSIONS.reduce((acc, dim) => {
    return acc + (dimScores[dim] * VENTURE_CASH_SCORE_WEIGHTS[dim]) / 100;
  }, 0);

  // cashProximity contributes only up to CASH_PROXIMITY_MAX_CONTRIBUTION_PCT of
  // the final score, so it cannot rescue a venture with no payment evidence.
  const proximityAvg = averageSignalScore(outcomes, "cashProximity");
  const proximityBonus = Math.min(
    coreScore * CASH_PROXIMITY_MAX_CONTRIBUTION_PCT,
    proximityAvg * CASH_PROXIMITY_MAX_CONTRIBUTION_PCT,
  );

  return Math.min(100, coreScore + proximityBonus);
}

// ---------------------------------------------------------------------------
// SECTION G — penalty detection
// ---------------------------------------------------------------------------

function detectPenalties(
  outcomes: AgentRevenueOutcome[],
  dimScores: DimensionScores,
): VentureCashPenalty[] {
  const penalties: VentureCashPenalty[] = [];

  if (outcomes.length === 0) return penalties;

  // vagueEvidencePenalty — all evidence arrays across all outcomes are empty.
  const totalEvidence = outcomes.reduce(
    (acc, o) =>
      acc +
      o.customerProof.evidence.length +
      o.paymentSignal.evidence.length +
      o.painClarity.evidence.length +
      o.buyerIdentifiability.evidence.length +
      o.offerTestability.evidence.length +
      o.cashProximity.evidence.length +
      o.cashGenerated.evidence.length,
    0,
  );
  if (totalEvidence === 0) {
    penalties.push({
      code: "vagueEvidencePenalty",
      reason: "No outcome carries any evidence items — all claims are unsupported.",
      points: 10,
    });
  }

  // unsupportedClaimPenalty — at least one signal score >= 60 has no evidence.
  const highSignalKeys: AgentRevenueOutcomeSignalKey[] = [
    "paymentSignal",
    "buyerIdentifiability",
    "painClarity",
    "offerTestability",
    "customerProof",
  ];
  const hasUnsupportedHighClaim = outcomes.some((o) =>
    highSignalKeys.some((k) => o[k].score >= 60 && o[k].evidence.length === 0),
  );
  if (hasUnsupportedHighClaim) {
    penalties.push({
      code: "unsupportedClaimPenalty",
      reason: "At least one signal scored ≥ 60 without supporting evidence.",
      points: 8,
    });
  }

  // noBuyerPenalty — buyerIdentifiability average is zero.
  if (dimScores.buyerIdentifiability === 0) {
    penalties.push({
      code: "noBuyerPenalty",
      reason: "No buyer has been identified across any outcome.",
      points: 10,
    });
  }

  // noPaymentSignalPenalty — paymentSignal average is zero.
  if (dimScores.paymentSignal === 0) {
    penalties.push({
      code: "noPaymentSignalPenalty",
      reason: "No payment signal has been observed across any outcome.",
      points: 10,
    });
  }

  // vanityOutputPenalty — many outcomes but no evidence and no cash.
  if (outcomes.length >= 3 && totalEvidence === 0 && dimScores.cashGenerated === 0) {
    penalties.push({
      code: "vanityOutputPenalty",
      reason: "Multiple outcomes submitted with no evidence and no cash generated.",
      points: 8,
    });
  }

  // repeatedRecommendationPenalty — all nextCashAction labels are identical.
  if (outcomes.length >= 2) {
    const labels = outcomes.map((o) => o.nextCashAction.actionLabel.trim().toLowerCase());
    const allSame = labels.every((l) => l === labels[0]);
    if (allSame) {
      penalties.push({
        code: "repeatedRecommendationPenalty",
        reason: "Every outcome recommends the same next action — no progress detected.",
        points: 5,
      });
    }
  }

  // nonRevenueActivityPenalty — high offerTestability but zero paymentSignal and
  // zero cashGenerated suggests activity that does not move toward revenue.
  if (
    dimScores.offerTestability > 50 &&
    dimScores.paymentSignal === 0 &&
    dimScores.cashGenerated === 0
  ) {
    penalties.push({
      code: "nonRevenueActivityPenalty",
      reason:
        "Offer testing is active but no payment signal or cash has resulted.",
      points: 5,
    });
  }

  return penalties;
}

// ---------------------------------------------------------------------------
// SECTION H — survival status and decision flags
// ---------------------------------------------------------------------------

type DecisionResult = {
  survivalStatus: VentureSurvivalStatus;
  shouldContinue: boolean;
  shouldPivot: boolean;
  isKillCandidate: boolean;
  shouldRequestCeoDecision: boolean;
};

function deriveDecision(
  outcomes: AgentRevenueOutcome[],
  dimScores: DimensionScores,
  finalScore: number,
): DecisionResult {
  // No outcomes — cannot assess.
  if (outcomes.length === 0) {
    return {
      survivalStatus: "insufficient_evidence",
      shouldContinue: false,
      shouldPivot: false,
      isKillCandidate: false,
      shouldRequestCeoDecision: false,
    };
  }

  const hasAnyEvidence = outcomes.some(
    (o) =>
      o.customerProof.evidence.length > 0 ||
      o.paymentSignal.evidence.length > 0 ||
      o.painClarity.evidence.length > 0 ||
      o.buyerIdentifiability.evidence.length > 0 ||
      o.cashGenerated.evidence.length > 0,
  );

  const hasBuyer = dimScores.buyerIdentifiability > 20;
  const hasPain = dimScores.painClarity > 20;
  const hasPayment = dimScores.paymentSignal > 0;
  const hasCash = dimScores.cashGenerated > 0;

  // Positive cash with evidence → cash_ready.
  if (hasCash && hasEvidenceBackedCash(outcomes)) {
    return {
      survivalStatus: "cash_ready",
      shouldContinue: true,
      shouldPivot: false,
      isKillCandidate: false,
      shouldRequestCeoDecision: true, // scaling requires CEO approval
    };
  }

  // Strong payment signal but no cash yet → continue and flag CEO for scaling decision.
  if (hasPayment && !hasCash && finalScore >= 45) {
    return {
      survivalStatus: "continue_candidate",
      shouldContinue: true,
      shouldPivot: false,
      isKillCandidate: false,
      shouldRequestCeoDecision: true,
    };
  }

  // Buyer/pain present but no payment/cash → pivot or continue based on evidence quality.
  if ((hasBuyer || hasPain) && !hasPayment && !hasCash) {
    if (hasAnyEvidence && finalScore >= 25) {
      return {
        survivalStatus: "continue_candidate",
        shouldContinue: true,
        shouldPivot: false,
        isKillCandidate: false,
        shouldRequestCeoDecision: false,
      };
    }
    // Buyer/pain visible but too weak to continue without pivoting.
    return {
      survivalStatus: "pivot_candidate",
      shouldContinue: false,
      shouldPivot: true,
      isKillCandidate: false,
      shouldRequestCeoDecision: true,
    };
  }

  // Low score, no buyer, no payment, no cash → kill candidate.
  if (finalScore < 25 && !hasBuyer && !hasPayment && !hasCash) {
    return {
      survivalStatus: "kill_candidate",
      shouldContinue: false,
      shouldPivot: false,
      isKillCandidate: true,
      shouldRequestCeoDecision: true, // never auto-kill — CEO decides
    };
  }

  // Default: insufficient evidence to classify further.
  return {
    survivalStatus: "insufficient_evidence",
    shouldContinue: false,
    shouldPivot: false,
    isKillCandidate: false,
    shouldRequestCeoDecision: false,
  };
}

function hasEvidenceBackedCash(outcomes: AgentRevenueOutcome[]): boolean {
  return outcomes.some(
    (o) => o.cashGenerated.amountCents > 0 && o.cashGenerated.evidence.length > 0,
  );
}

// ---------------------------------------------------------------------------
// SECTION I — strongest/weakest and nextScoreFocus
// ---------------------------------------------------------------------------

function findStrongestAndWeakest(dimScores: DimensionScores): {
  strongest: VentureCashScoreDimension;
  weakest: VentureCashScoreDimension;
} {
  let strongest: VentureCashScoreDimension = "cashGenerated";
  let weakest: VentureCashScoreDimension = "cashGenerated";
  let maxScore = -1;
  let minScore = 101;

  for (const dim of VENTURE_CASH_SCORE_DIMENSIONS) {
    const s = dimScores[dim];
    if (s > maxScore) { maxScore = s; strongest = dim; }
    if (s < minScore) { minScore = s; weakest = dim; }
  }

  return { strongest, weakest };
}

const NEXT_FOCUS_BY_WEAKEST: Record<VentureCashScoreDimension, string> = {
  cashGenerated: "Convert payment signals into a closed transaction to generate realized cash.",
  paymentSignal: "Find a buyer willing to pay now — letter of intent, invoice, or deposit.",
  buyerIdentifiability: "Identify at least one named, reachable buyer with a clear pain.",
  painClarity: "Interview potential buyers to sharpen the problem statement and quantify the pain.",
  offerTestability: "Build a minimal testable offer that a buyer can react to and pay for.",
  customerProof: "Collect written or recorded evidence from a real customer who experienced the solution.",
};

// ---------------------------------------------------------------------------
// SECTION J — score reasons
// ---------------------------------------------------------------------------

function buildReasons(
  dimScores: DimensionScores,
  penalties: VentureCashPenalty[],
  finalScore: number,
  survivalStatus: VentureSurvivalStatus,
): string[] {
  const reasons: string[] = [];

  reasons.push(`Total cash score: ${finalScore}/100 (${survivalStatus}).`);

  for (const dim of VENTURE_CASH_SCORE_DIMENSIONS) {
    const s = dimScores[dim];
    const w = VENTURE_CASH_SCORE_WEIGHTS[dim];
    reasons.push(`${dim}: ${Math.round(s)}/100 (weight ${w}%).`);
  }

  for (const p of penalties) {
    reasons.push(`Penalty [${p.code}]: -${p.points}pts — ${p.reason}`);
  }

  return reasons;
}

// ---------------------------------------------------------------------------
// SECTION K — scoreVenture (main export)
// ---------------------------------------------------------------------------

export function scoreVenture(
  ventureId: string,
  outcomes: AgentRevenueOutcome[],
): VentureCashScore {
  if (!ventureId || ventureId.trim() === "") {
    throw new Error("ventureId must be non-empty");
  }

  const dimScores = computeDimensionScores(outcomes);
  const rawWeightedScore = computeWeightedScore(dimScores, outcomes);
  const penalties = detectPenalties(outcomes, dimScores);
  const totalPenaltyPoints = penalties.reduce((acc, p) => acc + p.points, 0);
  const totalCashScore = Math.max(0, Math.round(rawWeightedScore - totalPenaltyPoints));

  const cashScoreBand = bandFromScore(totalCashScore);
  const decision = deriveDecision(outcomes, dimScores, totalCashScore);
  const { strongest, weakest } = findStrongestAndWeakest(dimScores);
  const nextScoreFocus = NEXT_FOCUS_BY_WEAKEST[weakest];
  const cashScoreReasons = buildReasons(
    dimScores,
    penalties,
    totalCashScore,
    decision.survivalStatus,
  );

  return {
    ventureId,
    totalCashScore,
    cashScoreBand,
    cashScoreReasons,
    penalties,
    survivalStatus: decision.survivalStatus,
    shouldContinue: decision.shouldContinue,
    shouldPivot: decision.shouldPivot,
    isKillCandidate: decision.isKillCandidate,
    shouldRequestCeoDecision: decision.shouldRequestCeoDecision,
    strongestSignal: strongest,
    weakestSignal: weakest,
    nextScoreFocus,
    humanOnTheLoop: true,
    approvalRequired: true,
    noExecutionAuthorized: true,
  };
}
