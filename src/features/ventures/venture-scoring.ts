// src/features/ventures/venture-scoring.ts
//
// Pure scoring helpers for CEO venture scoring (PR152). Computes a normalized
// overall score (0–100) from the 11 sub-scores and derives a recommendation —
// dependency-free, safe to import from both client and server.
//
// Polarity matters: most dimensions are "higher is better", but cost, owner
// involvement, execution difficulty, and risk are "higher is worse" and are
// inverted before averaging so they pull the overall score DOWN.

import type { VentureScore } from "./types";

/** The 11 CEO-entered sub-scores (0–10 each), without the derived fields. */
export type VentureSubScores = Omit<VentureScore, "overallScore" | "recommendation">;

export type VentureScoreRecommendation = VentureScore["recommendation"];

export type ScoreDimension = {
  key: keyof VentureSubScores;
  label: string;
  /** "positive": higher is better. "negative": higher is worse (inverted). */
  polarity: "positive" | "negative";
};

/** Ordered for display; covers exactly the 11 sub-score keys. */
export const SCORE_DIMENSIONS: readonly ScoreDimension[] = [
  { key: "revenuePotential", label: "Potentiel de revenu", polarity: "positive" },
  { key: "speedToFirstDollar", label: "Vitesse au 1er euro", polarity: "positive" },
  { key: "costToValidate", label: "Coût de validation", polarity: "negative" },
  { key: "automationPotential", label: "Potentiel d'automatisation", polarity: "positive" },
  { key: "ownerInvolvementRequired", label: "Implication CEO requise", polarity: "negative" },
  { key: "marketPain", label: "Douleur marché", polarity: "positive" },
  { key: "differentiation", label: "Différenciation", polarity: "positive" },
  { key: "executionDifficulty", label: "Difficulté d'exécution", polarity: "negative" },
  { key: "risk", label: "Risque", polarity: "negative" },
  { key: "grossMarginPotential", label: "Marge brute potentielle", polarity: "positive" },
  { key: "strategicFit", label: "Alignement stratégique", polarity: "positive" },
];

export const MIN_SUB_SCORE = 0;
export const MAX_SUB_SCORE = 10;

function isValidSubScore(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= MIN_SUB_SCORE &&
    value <= MAX_SUB_SCORE
  );
}

/** True when every one of the 11 dimensions holds a number in [0, 10]. */
export function isValidSubScores(scores: Partial<VentureSubScores> | undefined): scores is VentureSubScores {
  if (!scores || typeof scores !== "object") return false;
  return SCORE_DIMENSIONS.every((dimension) => isValidSubScore(scores[dimension.key]));
}

/**
 * Normalized overall score in [0, 100]. Each dimension contributes its 0–10
 * value (inverted for "negative" polarity), averaged across all 11 and scaled
 * to 100. Assumes valid sub-scores — validate with isValidSubScores first.
 */
export function computeOverallScore(scores: VentureSubScores): number {
  let total = 0;
  for (const dimension of SCORE_DIMENSIONS) {
    const value = scores[dimension.key];
    total += dimension.polarity === "negative" ? MAX_SUB_SCORE - value : value;
  }
  const maxTotal = SCORE_DIMENSIONS.length * MAX_SUB_SCORE;
  return Math.round((total / maxTotal) * 100);
}

/** Derives a recommendation band from the overall score (CEO may override it). */
export function deriveRecommendation(overallScore: number): VentureScoreRecommendation {
  if (overallScore >= 70) return "go";
  if (overallScore >= 55) return "test_small";
  if (overallScore >= 40) return "hold";
  return "kill";
}

/**
 * Builds a complete VentureScore from the 11 sub-scores: computes the overall
 * and the recommendation (CEO override wins when provided).
 */
export function buildVentureScore(
  scores: VentureSubScores,
  recommendationOverride?: VentureScoreRecommendation,
): VentureScore {
  const overallScore = computeOverallScore(scores);
  return {
    ...scores,
    overallScore,
    recommendation: recommendationOverride ?? deriveRecommendation(overallScore),
  };
}
