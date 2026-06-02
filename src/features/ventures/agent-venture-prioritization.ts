// src/features/ventures/agent-venture-prioritization.ts
//
// Pure prioritization helper for local agent-prepared venture workbench items.
// No persistence, no Supabase, no API calls, no server actions, and no runtime
// execution. Ranking is deterministic and read-only.

import type {
  AgentVentureProfitabilityBlocker,
  AgentVentureProfitabilityRecommendation,
} from "./agent-venture-profitability";
import type { AgentVentureWorkbenchItem } from "./agent-venture-workbench-data";

export type AgentVenturePrioritySeverity = "clear" | "watch" | "severe";

export type AgentVenturePrioritizationItem = {
  rank: number;
  workbenchItemId: string;
  opportunityTitle: string;
  agentId: string;
  profitabilityScore: number;
  recommendation: AgentVentureProfitabilityRecommendation;
  expectedRevenuePotentialCents: number;
  validationCostCents: number;
  speedToFirstDollarDays: number;
  offerClarityScore: number;
  acquisitionEaseScore: number;
  estimatedMarginScore: number;
  riskLevel: AgentVentureWorkbenchItem["brief"]["risk"]["riskLevel"];
  blockers: AgentVentureProfitabilityBlocker[];
  blockerSeverity: AgentVenturePrioritySeverity;
  nextCeoDecision: string;
  whyRankedThere: string;
};

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function blockerSeverityFor(
  blockers: AgentVentureProfitabilityBlocker[],
): AgentVenturePrioritySeverity {
  if (blockers.some((blocker) => blocker.severity === "critical")) return "severe";
  if (blockers.some((blocker) => blocker.severity === "warning")) return "watch";
  return "clear";
}

function recommendationPriority(
  recommendation: AgentVentureProfitabilityRecommendation,
): number {
  switch (recommendation) {
    case "prioritize_for_validation":
      return 6;
    case "request_ceo_review":
      return 5;
    case "refine_offer":
      return 4;
    case "gather_more_evidence":
      return 3;
    case "reduce_validation_cost":
      return 2;
    case "reject_for_now":
      return 1;
  }
}

function severityPenalty(severity: AgentVenturePrioritySeverity): number {
  switch (severity) {
    case "clear":
      return 0;
    case "watch":
      return 8;
    case "severe":
      return 20;
  }
}

function riskPenalty(
  riskLevel: AgentVentureWorkbenchItem["brief"]["risk"]["riskLevel"],
): number {
  switch (riskLevel) {
    case "low":
      return 0;
    case "medium":
      return 8;
    case "high":
      return 18;
    case "critical":
      return 36;
  }
}

function offerClarityScore(item: AgentVentureWorkbenchItem): number {
  let score = 0;
  if (item.brief.targetCustomer.trim() !== "") score += 20;
  if (item.brief.problem.trim() !== "") score += 20;
  if (item.brief.proposedOffer.trim() !== "") score += 20;
  if (item.brief.validationPlan.successMetric.trim() !== "") score += 15;
  if (item.brief.killCriteria.length > 0) score += 10;
  if (item.workstream.businessObjectives.length > 0) score += 15;
  return clampScore(score);
}

function acquisitionEaseScore(item: AgentVentureWorkbenchItem): number {
  let score = 0;
  if (item.brief.validationPlan.validationChannel.trim() !== "") score += 20;
  score += item.profitabilityScore.speedScore * 0.3;
  score += item.profitabilityScore.confidenceScore * 0.2;
  score += item.profitabilityScore.evidenceStrengthScore * 0.2;
  score += item.profitabilityScore.costEfficiencyScore * 0.1;
  score -= riskPenalty(item.brief.risk.riskLevel) * 0.35;
  return clampScore(score);
}

function estimatedMarginScore(item: AgentVentureWorkbenchItem): number {
  const revenue = item.profitabilityScore.revenuePotentialScore;
  const automation = item.profitabilityScore.automationLeverageScore;
  const costEfficiency = item.profitabilityScore.costEfficiencyScore;
  const confidence = item.profitabilityScore.confidenceScore;
  const risk = riskPenalty(item.brief.risk.riskLevel);

  return clampScore(
    revenue * 0.35 +
      automation * 0.3 +
      costEfficiency * 0.2 +
      confidence * 0.15 -
      risk * 0.4,
  );
}

function prioritizationValue(item: AgentVentureWorkbenchItem): number {
  const profitability = item.profitabilityScore;
  const severity = blockerSeverityFor(profitability.blockers);
  const offerClarity = offerClarityScore(item);
  const acquisitionEase = acquisitionEaseScore(item);
  const estimatedMargin = estimatedMarginScore(item);

  let value = profitability.profitabilityScore;
  value += recommendationPriority(profitability.recommendation) * 5;
  value += offerClarity * 0.16;
  value += acquisitionEase * 0.18;
  value += estimatedMargin * 0.16;
  value += item.workstreamReadiness.overallReadinessScore * 0.12;
  value += profitability.speedScore * 0.08;
  value += profitability.costEfficiencyScore * 0.08;
  value -= riskPenalty(item.brief.risk.riskLevel);
  value -= severityPenalty(severity);

  if (
    item.brief.risk.riskLevel === "critical" &&
    profitability.recommendation !== "request_ceo_review"
  ) {
    value -= 50;
  }

  return Math.round(value * 100) / 100;
}

function explainRanking(item: AgentVentureWorkbenchItem): string {
  const profitability = item.profitabilityScore;
  const blockerSeverity = blockerSeverityFor(profitability.blockers);
  const offerClarity = offerClarityScore(item);
  const acquisitionEase = acquisitionEaseScore(item);
  const estimatedMargin = estimatedMarginScore(item);
  const blockerText =
    profitability.blockers.length === 0
      ? "no active blockers"
      : `${profitability.blockers.length} blocker(s) marked ${blockerSeverity}`;

  return [
    `${profitability.profitabilityScore}/100 profitability with ${offerClarity}/100 offer clarity, ${acquisitionEase}/100 acquisition ease, and ${estimatedMargin}/100 estimated margin quality.`,
    `${item.brief.speedToFirstDollarDays} day(s) to first dollar and ${item.workstream.estimatedTotalBudgetCents <= item.brief.estimatedValidationCostCents ? "tight" : "expanded"} validation budget assumptions improve or reduce its revenue priority.`,
    `${item.brief.risk.riskLevel} risk and ${blockerText} shape the priority order.`,
    `Next CEO decision: ${profitability.nextCeoDecision}`,
  ].join(" ");
}

export function buildAgentVenturePrioritizationQueue(
  items: AgentVentureWorkbenchItem[],
): AgentVenturePrioritizationItem[] {
  const ranked = [...items].sort((left, right) => {
    const leftValue = prioritizationValue(left);
    const rightValue = prioritizationValue(right);
    if (rightValue !== leftValue) return rightValue - leftValue;

    const scoreDelta =
      right.profitabilityScore.profitabilityScore -
      left.profitabilityScore.profitabilityScore;
    if (scoreDelta !== 0) return scoreDelta;

    const blockerDelta =
      left.profitabilityScore.blockerCount - right.profitabilityScore.blockerCount;
    if (blockerDelta !== 0) return blockerDelta;

    const speedDelta =
      left.brief.speedToFirstDollarDays - right.brief.speedToFirstDollarDays;
    if (speedDelta !== 0) return speedDelta;

    const costDelta =
      left.brief.estimatedValidationCostCents -
      right.brief.estimatedValidationCostCents;
    if (costDelta !== 0) return costDelta;

    const revenueDelta =
      right.brief.estimatedRevenuePotentialCents -
      left.brief.estimatedRevenuePotentialCents;
    if (revenueDelta !== 0) return revenueDelta;

    return left.id.localeCompare(right.id);
  });

  return ranked.map((item, index) => ({
    rank: index + 1,
    workbenchItemId: item.id,
    opportunityTitle: item.brief.title,
    agentId: item.brief.agentId,
    profitabilityScore: item.profitabilityScore.profitabilityScore,
    recommendation: item.profitabilityScore.recommendation,
    expectedRevenuePotentialCents: item.brief.estimatedRevenuePotentialCents,
    validationCostCents: item.brief.estimatedValidationCostCents,
    speedToFirstDollarDays: item.brief.speedToFirstDollarDays,
    offerClarityScore: offerClarityScore(item),
    acquisitionEaseScore: acquisitionEaseScore(item),
    estimatedMarginScore: estimatedMarginScore(item),
    riskLevel: item.brief.risk.riskLevel,
    blockers: item.profitabilityScore.blockers,
    blockerSeverity: blockerSeverityFor(item.profitabilityScore.blockers),
    nextCeoDecision: item.profitabilityScore.nextCeoDecision,
    whyRankedThere: explainRanking(item),
  }));
}
