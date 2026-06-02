// src/features/ventures/agent-venture-profitability.ts
//
// Pure decision-support scoring for agent-prepared venture workstreams.
// No persistence, no Supabase, no network, no server actions, no runtime
// execution, and no approval workflow. This is an estimate, not a financial
// guarantee.

import type {
  AgentOpportunityBrief,
  AgentOpportunityRiskLevel,
} from "./agent-opportunity-brief";
import type {
  AgentVentureWorkstream,
  AgentVentureWorkstreamReadinessScore,
} from "./agent-venture-workstream";
import { scoreAgentVentureWorkstreamReadiness } from "./agent-venture-workstream";

export type AgentVentureProfitabilityRecommendation =
  | "prioritize_for_validation"
  | "refine_offer"
  | "reduce_validation_cost"
  | "gather_more_evidence"
  | "request_ceo_review"
  | "reject_for_now";

export type AgentVentureProfitabilityBlockerSeverity =
  | "info"
  | "warning"
  | "critical";

export type AgentVentureProfitabilityBlocker = {
  blockerId: string;
  label: string;
  severity: AgentVentureProfitabilityBlockerSeverity;
  reason: string;
};

export type AgentVentureProfitabilityInput = {
  brief: AgentOpportunityBrief;
  workstream: AgentVentureWorkstream;
  workstreamReadiness?: AgentVentureWorkstreamReadinessScore;
};

export type AgentVentureProfitabilityScore = {
  profitabilityScore: number;
  revenuePotentialScore: number;
  costEfficiencyScore: number;
  speedScore: number;
  confidenceScore: number;
  automationLeverageScore: number;
  evidenceStrengthScore: number;
  riskPenalty: number;
  readinessContributionScore: number;
  kpiQualityScore: number;
  blockerCount: number;
  recommendation: AgentVentureProfitabilityRecommendation;
  nextCeoDecision: string;
  blockers: AgentVentureProfitabilityBlocker[];
  rationale: string;
};

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function scoreRevenuePotential(cents: number): number {
  if (cents >= 100_000_000) return 100;
  if (cents >= 50_000_000) return 85;
  if (cents >= 20_000_000) return 70;
  if (cents >= 10_000_000) return 55;
  if (cents >= 5_000_000) return 40;
  if (cents >= 1_000_000) return 20;
  return 5;
}

function scoreCostEfficiency(validationCostCents: number, revenuePotentialCents: number): number {
  if (validationCostCents <= 0) return 100;

  const costRatio =
    revenuePotentialCents > 0 ? validationCostCents / revenuePotentialCents : 1;

  if (validationCostCents <= 100_000 && costRatio <= 0.02) return 100;
  if (validationCostCents <= 300_000 && costRatio <= 0.04) return 85;
  if (validationCostCents <= 750_000 && costRatio <= 0.08) return 70;
  if (validationCostCents <= 1_500_000 && costRatio <= 0.15) return 50;
  if (validationCostCents <= 5_000_000 && costRatio <= 0.3) return 30;
  return 10;
}

function scoreSpeed(days: number): number {
  if (days <= 7) return 100;
  if (days <= 14) return 90;
  if (days <= 30) return 75;
  if (days <= 60) return 55;
  if (days <= 90) return 35;
  return 15;
}

function scoreEvidenceStrength(brief: AgentOpportunityBrief, workstream: AgentVentureWorkstream): number {
  const evidenceCount = Math.max(brief.evidence.length, workstream.evidence.length);
  if (evidenceCount >= 5) return 100;
  if (evidenceCount >= 3) return 80;
  if (evidenceCount >= 2) return 60;
  if (evidenceCount === 1) return 35;
  return 0;
}

function scoreKpiQuality(workstream: AgentVentureWorkstream): number {
  const kpis = workstream.kpis;
  if (kpis.length === 0) return 0;

  const completeKpis = kpis.filter((kpi) => {
    return (
      kpi.label.trim() !== "" &&
      kpi.description.trim() !== "" &&
      kpi.targetValue.trim() !== "" &&
      kpi.unit.trim() !== ""
    );
  }).length;
  const criticalKpis = kpis.filter((kpi) => kpi.isCritical).length;

  const countScore = kpis.length >= 3 ? 35 : kpis.length === 2 ? 25 : 15;
  const completenessScore = Math.round((completeKpis / kpis.length) * 35);
  const criticalScore = criticalKpis >= 2 ? 30 : criticalKpis === 1 ? 18 : 0;

  return clampScore(countScore + completenessScore + criticalScore);
}

function riskPenaltyFor(riskLevel: AgentOpportunityRiskLevel): number {
  switch (riskLevel) {
    case "low":
      return 0;
    case "medium":
      return 10;
    case "high":
      return 24;
    case "critical":
      return 45;
  }
}

function blockerPenalty(blockers: AgentVentureProfitabilityBlocker[]): number {
  return Math.min(
    24,
    blockers.reduce((total, blocker) => {
      if (blocker.severity === "critical") return total + 10;
      if (blocker.severity === "warning") return total + 5;
      return total + 2;
    }, 0),
  );
}

function addBlocker(
  blockers: AgentVentureProfitabilityBlocker[],
  blocker: AgentVentureProfitabilityBlocker,
): void {
  blockers.push(blocker);
}

function nextDecisionFor(recommendation: AgentVentureProfitabilityRecommendation): string {
  switch (recommendation) {
    case "prioritize_for_validation":
      return "Prioritize this for CEO validation planning.";
    case "refine_offer":
      return "Refine the offer, target customer, or validation plan before prioritizing.";
    case "reduce_validation_cost":
      return "Reduce validation cost or narrow the first test before proceeding.";
    case "gather_more_evidence":
      return "Gather stronger evidence before spending validation budget.";
    case "request_ceo_review":
      return "Request CEO review because risk or tradeoffs require judgment.";
    case "reject_for_now":
      return "Reject for now and focus attention on stronger opportunities.";
  }
}

function recommendationReason(recommendation: AgentVentureProfitabilityRecommendation): string {
  switch (recommendation) {
    case "prioritize_for_validation":
      return "The opportunity has strong economics, acceptable risk, usable evidence, and enough readiness to justify CEO validation priority.";
    case "refine_offer":
      return "The opportunity is not weak, but the offer or validation shape needs tightening before it deserves priority.";
    case "reduce_validation_cost":
      return "The first validation step is too expensive relative to confidence, so the safer move is to narrow the test.";
    case "gather_more_evidence":
      return "The evidence base is not strong enough to justify priority yet.";
    case "request_ceo_review":
      return "The score has meaningful upside but risk or blockers require human judgment.";
    case "reject_for_now":
      return "The current signal is too weak to justify CEO attention or validation budget.";
  }
}

function buildRationale(score: {
  profitabilityScore: number;
  revenuePotentialScore: number;
  costEfficiencyScore: number;
  speedScore: number;
  confidenceScore: number;
  automationLeverageScore: number;
  evidenceStrengthScore: number;
  readinessContributionScore: number;
  kpiQualityScore: number;
  riskPenalty: number;
  blockerCount: number;
  recommendation: AgentVentureProfitabilityRecommendation;
}): string {
  return [
    `Profitability score ${score.profitabilityScore}/100 combines revenue ${score.revenuePotentialScore}/100, cost efficiency ${score.costEfficiencyScore}/100, speed ${score.speedScore}/100, confidence ${score.confidenceScore}/100, automation leverage ${score.automationLeverageScore}/100, evidence ${score.evidenceStrengthScore}/100, readiness ${score.readinessContributionScore}/100, and KPI quality ${score.kpiQualityScore}/100.`,
    `Risk penalty ${score.riskPenalty} and ${score.blockerCount} blocker(s) reduce the priority estimate.`,
    recommendationReason(score.recommendation),
  ].join(" ");
}

export function scoreAgentVentureProfitability(
  input: AgentVentureProfitabilityInput,
): AgentVentureProfitabilityScore {
  const readiness =
    input.workstreamReadiness ?? scoreAgentVentureWorkstreamReadiness(input.workstream);

  const revenuePotentialScore = scoreRevenuePotential(
    input.brief.estimatedRevenuePotentialCents,
  );
  const costEfficiencyScore = scoreCostEfficiency(
    input.brief.estimatedValidationCostCents,
    input.brief.estimatedRevenuePotentialCents,
  );
  const speedScore = scoreSpeed(input.brief.speedToFirstDollarDays);
  const confidenceScore = clampScore(input.brief.confidenceScore);
  const automationLeverageScore = clampScore(input.brief.automationPotentialScore);
  const evidenceStrengthScore = scoreEvidenceStrength(input.brief, input.workstream);
  const readinessContributionScore = clampScore(readiness.overallReadinessScore);
  const kpiQualityScore = scoreKpiQuality(input.workstream);
  const riskPenalty = riskPenaltyFor(input.brief.risk.riskLevel);

  const blockers: AgentVentureProfitabilityBlocker[] = [];

  if (input.brief.risk.riskLevel === "critical") {
    addBlocker(blockers, {
      blockerId: "critical-risk",
      label: "Critical risk",
      severity: "critical",
      reason: "Critical risk requires CEO judgment and cannot be auto-prioritized.",
    });
  } else if (input.brief.risk.riskLevel === "high") {
    addBlocker(blockers, {
      blockerId: "high-risk",
      label: "High risk",
      severity: "warning",
      reason: "High risk reduces profitability priority until mitigations are stronger.",
    });
  }

  if (evidenceStrengthScore < 40) {
    addBlocker(blockers, {
      blockerId: "weak-evidence",
      label: "Weak evidence",
      severity: "critical",
      reason: "Evidence is too thin to justify validation priority.",
    });
  }

  if (costEfficiencyScore < 35) {
    addBlocker(blockers, {
      blockerId: "validation-cost",
      label: "Validation cost pressure",
      severity: "warning",
      reason: "The first validation budget is high relative to estimated upside.",
    });
  }

  if (confidenceScore < 45) {
    addBlocker(blockers, {
      blockerId: "low-confidence",
      label: "Low confidence",
      severity: "warning",
      reason: "Confidence is too low to spend much validation budget.",
    });
  }

  if (readinessContributionScore < 50) {
    addBlocker(blockers, {
      blockerId: "low-readiness",
      label: "Low workstream readiness",
      severity: "warning",
      reason: "The workstream is not yet prepared enough for validation priority.",
    });
  }

  if (kpiQualityScore < 50) {
    addBlocker(blockers, {
      blockerId: "weak-kpis",
      label: "Weak KPI quality",
      severity: "warning",
      reason: "KPIs are not yet strong enough to measure validation success.",
    });
  }

  if (readiness.blockers.length > 0) {
    addBlocker(blockers, {
      blockerId: "readiness-blockers",
      label: "Readiness blockers",
      severity: "warning",
      reason: readiness.blockers.join("; "),
    });
  }

  const weightedBase =
    revenuePotentialScore * 0.2 +
    costEfficiencyScore * 0.14 +
    speedScore * 0.12 +
    confidenceScore * 0.16 +
    automationLeverageScore * 0.14 +
    evidenceStrengthScore * 0.1 +
    readinessContributionScore * 0.07 +
    kpiQualityScore * 0.09;

  const profitabilityScore = clampScore(
    weightedBase - riskPenalty - blockerPenalty(blockers),
  );

  let recommendation: AgentVentureProfitabilityRecommendation;
  if (input.brief.risk.riskLevel === "critical") {
    recommendation = "request_ceo_review";
  } else if (evidenceStrengthScore < 40) {
    recommendation = "gather_more_evidence";
  } else if (costEfficiencyScore < 35 && confidenceScore < 50) {
    recommendation = profitabilityScore < 35 ? "reject_for_now" : "reduce_validation_cost";
  } else if (profitabilityScore < 35) {
    recommendation = "reject_for_now";
  } else if (costEfficiencyScore < 45 && confidenceScore < 65) {
    recommendation = "reduce_validation_cost";
  } else if (
    profitabilityScore >= 72 &&
    riskPenalty <= 10 &&
    evidenceStrengthScore >= 60 &&
    readinessContributionScore >= 60 &&
    kpiQualityScore >= 60 &&
    blockers.filter((blocker) => blocker.severity === "critical").length === 0
  ) {
    recommendation = "prioritize_for_validation";
  } else if (profitabilityScore >= 58 || input.brief.risk.riskLevel === "high") {
    recommendation = "request_ceo_review";
  } else {
    recommendation = "refine_offer";
  }

  const blockerCount = blockers.length;
  const rationale = buildRationale({
    profitabilityScore,
    revenuePotentialScore,
    costEfficiencyScore,
    speedScore,
    confidenceScore,
    automationLeverageScore,
    evidenceStrengthScore,
    readinessContributionScore,
    kpiQualityScore,
    riskPenalty,
    blockerCount,
    recommendation,
  });

  return {
    profitabilityScore,
    revenuePotentialScore,
    costEfficiencyScore,
    speedScore,
    confidenceScore,
    automationLeverageScore,
    evidenceStrengthScore,
    riskPenalty,
    readinessContributionScore,
    kpiQualityScore,
    blockerCount,
    recommendation,
    nextCeoDecision: nextDecisionFor(recommendation),
    blockers,
    rationale,
  };
}
