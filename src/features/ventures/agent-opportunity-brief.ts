// src/features/ventures/agent-opportunity-brief.ts
//
// Pure TypeScript model for an agent-generated opportunity brief.
// Dependency-free — no Supabase, no database, no network, no UI components,
// no auto-approval, no execution authorization.
//
// Humans remain on the loop at every step: every brief has humanOnTheLoop,
// approvalRequired, and noExecutionAuthorized locked to literal true.

// ---------------------------------------------------------------------------
// SECTION A — Enum types
// ---------------------------------------------------------------------------

export type AgentOpportunitySource =
  | "agent_generated"
  | "research_observed"
  | "customer_signal"
  | "competitor_gap"
  | "internal_efficiency"
  | "market_trend"
  | "manual_seed";

export type AgentOpportunityRevenueModel =
  | "one_time_sale"
  | "subscription"
  | "retainer"
  | "usage_based"
  | "affiliate"
  | "marketplace"
  | "service"
  | "unknown";

export type AgentOpportunityRiskLevel = "low" | "medium" | "high" | "critical";

export type AgentOpportunityDecisionRecommendation =
  | "save_as_candidate"
  | "needs_more_research"
  | "reject_opportunity"
  | "prepare_validation_plan"
  | "request_ceo_review";

// ---------------------------------------------------------------------------
// SECTION B — Sub-model types
// ---------------------------------------------------------------------------

export type AgentOpportunityNextAction = {
  actionLabel: string;
  rationale: string;
  estimatedEffortHours: number;
};

export type AgentOpportunityValidationPlan = {
  hypothesis: string;
  firstValidationStep: string;
  validationChannel: string;
  successMetric: string;
  successThreshold: string;
  validationWindowDays: number;
  budgetCapCents: number;
};

export type AgentOpportunityKillCriterion = {
  metric: string;
  threshold: string;
  reason: string;
};

export type AgentOpportunityRiskProfile = {
  riskLevel: AgentOpportunityRiskLevel;
  riskFactors: string[];
  mitigationNotes: string[];
};

// ---------------------------------------------------------------------------
// SECTION C — Main brief type
// ---------------------------------------------------------------------------

export type AgentOpportunityBrief = {
  briefId: string;
  agentId: string;
  source: AgentOpportunitySource;
  title: string;
  targetCustomer: string;
  problem: string;
  proposedOffer: string;
  revenueModel: AgentOpportunityRevenueModel;
  estimatedRevenuePotentialCents: number;
  estimatedValidationCostCents: number;
  speedToFirstDollarDays: number;
  automationPotentialScore: number; // 0-100
  confidenceScore: number; // 0-100
  risk: AgentOpportunityRiskProfile;
  validationPlan: AgentOpportunityValidationPlan;
  killCriteria: AgentOpportunityKillCriterion[];
  recommendedDecision: AgentOpportunityDecisionRecommendation;
  nextAction: AgentOpportunityNextAction;
  rationale: string;
  evidence: string[];
  createdAt: string;
  humanOnTheLoop: true;
  approvalRequired: true;
  noExecutionAuthorized: true;
};

// ---------------------------------------------------------------------------
// SECTION D — Result types
// ---------------------------------------------------------------------------

export type AgentOpportunityBriefScore = {
  revenuePotentialScore: number;
  speedScore: number;
  costScore: number;
  automationScore: number;
  confidenceScore: number;
  riskAdjustedScore: number;
  overallScore: number;
  recommendation: AgentOpportunityDecisionRecommendation;
};

export type AgentOpportunityBriefValidation = {
  valid: boolean;
  errors: string[];
};

// ---------------------------------------------------------------------------
// SECTION E — Constants
// ---------------------------------------------------------------------------

export const AGENT_OPPORTUNITY_SOURCES: readonly AgentOpportunitySource[] = [
  "agent_generated",
  "research_observed",
  "customer_signal",
  "competitor_gap",
  "internal_efficiency",
  "market_trend",
  "manual_seed",
];

export const AGENT_OPPORTUNITY_REVENUE_MODELS: readonly AgentOpportunityRevenueModel[] = [
  "one_time_sale",
  "subscription",
  "retainer",
  "usage_based",
  "affiliate",
  "marketplace",
  "service",
  "unknown",
];

export const AGENT_OPPORTUNITY_RISK_LEVELS: readonly AgentOpportunityRiskLevel[] = [
  "low",
  "medium",
  "high",
  "critical",
];

export const AGENT_OPPORTUNITY_RECOMMENDATIONS: readonly AgentOpportunityDecisionRecommendation[] = [
  "save_as_candidate",
  "needs_more_research",
  "reject_opportunity",
  "prepare_validation_plan",
  "request_ceo_review",
];

// ---------------------------------------------------------------------------
// SECTION F — validateAgentOpportunityBrief
// ---------------------------------------------------------------------------

export function validateAgentOpportunityBrief(
  brief: AgentOpportunityBrief,
): AgentOpportunityBriefValidation {
  const errors: string[] = [];

  // Required non-empty string fields
  if (!brief.briefId) errors.push("briefId must be non-empty");
  if (!brief.agentId) errors.push("agentId must be non-empty");
  if (!brief.title) errors.push("title must be non-empty");
  if (!brief.targetCustomer) errors.push("targetCustomer must be non-empty");
  if (!brief.problem) errors.push("problem must be non-empty");
  if (!brief.proposedOffer) errors.push("proposedOffer must be non-empty");
  if (!brief.rationale) errors.push("rationale must be non-empty");

  // Enum membership
  if (!(AGENT_OPPORTUNITY_SOURCES as readonly string[]).includes(brief.source)) {
    errors.push(`source '${brief.source}' is not a valid AgentOpportunitySource`);
  }
  if (!(AGENT_OPPORTUNITY_REVENUE_MODELS as readonly string[]).includes(brief.revenueModel)) {
    errors.push(`revenueModel '${brief.revenueModel}' is not a valid AgentOpportunityRevenueModel`);
  }

  // Numeric range checks
  if (typeof brief.estimatedRevenuePotentialCents !== "number" || brief.estimatedRevenuePotentialCents < 0) {
    errors.push("estimatedRevenuePotentialCents must be >= 0");
  }
  if (typeof brief.estimatedValidationCostCents !== "number" || brief.estimatedValidationCostCents < 0) {
    errors.push("estimatedValidationCostCents must be >= 0");
  }
  if (typeof brief.speedToFirstDollarDays !== "number" || brief.speedToFirstDollarDays < 0) {
    errors.push("speedToFirstDollarDays must be >= 0");
  }
  if (
    !Number.isInteger(brief.automationPotentialScore) ||
    brief.automationPotentialScore < 0 ||
    brief.automationPotentialScore > 100
  ) {
    errors.push("automationPotentialScore must be an integer in [0, 100]");
  }
  if (
    !Number.isInteger(brief.confidenceScore) ||
    brief.confidenceScore < 0 ||
    brief.confidenceScore > 100
  ) {
    errors.push("confidenceScore must be an integer in [0, 100]");
  }

  // Risk profile
  if (!(AGENT_OPPORTUNITY_RISK_LEVELS as readonly string[]).includes(brief.risk.riskLevel)) {
    errors.push(`risk.riskLevel '${brief.risk.riskLevel}' is not a valid AgentOpportunityRiskLevel`);
  }
  if (!Array.isArray(brief.risk.riskFactors) || brief.risk.riskFactors.length === 0) {
    errors.push("risk.riskFactors must be a non-empty array");
  }
  if (!Array.isArray(brief.risk.mitigationNotes)) {
    errors.push("risk.mitigationNotes must be an array");
  }

  // Validation plan
  if (!brief.validationPlan.hypothesis) errors.push("validationPlan.hypothesis must be non-empty");
  if (!brief.validationPlan.firstValidationStep) errors.push("validationPlan.firstValidationStep must be non-empty");
  if (!brief.validationPlan.validationChannel) errors.push("validationPlan.validationChannel must be non-empty");
  if (!brief.validationPlan.successMetric) errors.push("validationPlan.successMetric must be non-empty");
  if (!brief.validationPlan.successThreshold) errors.push("validationPlan.successThreshold must be non-empty");
  if (
    typeof brief.validationPlan.validationWindowDays !== "number" ||
    brief.validationPlan.validationWindowDays < 1
  ) {
    errors.push("validationPlan.validationWindowDays must be >= 1");
  }
  if (
    typeof brief.validationPlan.budgetCapCents !== "number" ||
    brief.validationPlan.budgetCapCents < 0
  ) {
    errors.push("validationPlan.budgetCapCents must be >= 0");
  }

  // Kill criteria
  if (!Array.isArray(brief.killCriteria) || brief.killCriteria.length === 0) {
    errors.push("killCriteria must be a non-empty array");
  } else {
    for (let i = 0; i < brief.killCriteria.length; i++) {
      const kc = brief.killCriteria[i];
      if (!kc.metric) errors.push(`killCriteria[${i}].metric must be non-empty`);
      if (!kc.threshold) errors.push(`killCriteria[${i}].threshold must be non-empty`);
      if (!kc.reason) errors.push(`killCriteria[${i}].reason must be non-empty`);
    }
  }

  // Evidence
  if (!Array.isArray(brief.evidence)) {
    errors.push("evidence must be an array");
  }

  // createdAt — valid ISO string
  if (!brief.createdAt || isNaN(+new Date(brief.createdAt))) {
    errors.push("createdAt must be a valid ISO date string");
  }

  // Governance locks
  if (brief.humanOnTheLoop !== true) errors.push("humanOnTheLoop must be true");
  if (brief.approvalRequired !== true) errors.push("approvalRequired must be true");
  if (brief.noExecutionAuthorized !== true) errors.push("noExecutionAuthorized must be true");

  // Next action
  if (!brief.nextAction.actionLabel) errors.push("nextAction.actionLabel must be non-empty");
  if (
    typeof brief.nextAction.estimatedEffortHours !== "number" ||
    brief.nextAction.estimatedEffortHours < 0
  ) {
    errors.push("nextAction.estimatedEffortHours must be >= 0");
  }

  // Recommended decision
  if (!(AGENT_OPPORTUNITY_RECOMMENDATIONS as readonly string[]).includes(brief.recommendedDecision)) {
    errors.push(`recommendedDecision '${brief.recommendedDecision}' is not a valid AgentOpportunityDecisionRecommendation`);
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// SECTION G — scoreAgentOpportunityBrief
// ---------------------------------------------------------------------------

export function scoreAgentOpportunityBrief(
  brief: AgentOpportunityBrief,
): AgentOpportunityBriefScore {
  // Revenue potential score (step tiers on estimatedRevenuePotentialCents)
  let revenuePotentialScore: number;
  if (brief.estimatedRevenuePotentialCents >= 100_000_000) {
    revenuePotentialScore = 100;
  } else if (brief.estimatedRevenuePotentialCents >= 50_000_000) {
    revenuePotentialScore = 85;
  } else if (brief.estimatedRevenuePotentialCents >= 10_000_000) {
    revenuePotentialScore = 65;
  } else if (brief.estimatedRevenuePotentialCents >= 5_000_000) {
    revenuePotentialScore = 45;
  } else if (brief.estimatedRevenuePotentialCents >= 1_000_000) {
    revenuePotentialScore = 25;
  } else {
    revenuePotentialScore = 10;
  }

  // Speed score (speedToFirstDollarDays)
  let speedScore: number;
  if (brief.speedToFirstDollarDays <= 7) {
    speedScore = 100;
  } else if (brief.speedToFirstDollarDays <= 14) {
    speedScore = 90;
  } else if (brief.speedToFirstDollarDays <= 30) {
    speedScore = 75;
  } else if (brief.speedToFirstDollarDays <= 60) {
    speedScore = 55;
  } else if (brief.speedToFirstDollarDays <= 90) {
    speedScore = 35;
  } else {
    speedScore = 15;
  }

  // Cost score (estimatedValidationCostCents, lower is better)
  let costScore: number;
  if (brief.estimatedValidationCostCents <= 0) {
    costScore = 100;
  } else if (brief.estimatedValidationCostCents <= 100_000) {
    costScore = 90;
  } else if (brief.estimatedValidationCostCents <= 500_000) {
    costScore = 70;
  } else if (brief.estimatedValidationCostCents <= 1_000_000) {
    costScore = 50;
  } else if (brief.estimatedValidationCostCents <= 5_000_000) {
    costScore = 25;
  } else {
    costScore = 10;
  }

  const automationScore = brief.automationPotentialScore;
  const confidenceScore = brief.confidenceScore;

  const weightedBase =
    revenuePotentialScore * 0.25 +
    speedScore * 0.15 +
    costScore * 0.15 +
    automationScore * 0.2 +
    confidenceScore * 0.25;

  let riskMultiplier: number;
  switch (brief.risk.riskLevel) {
    case "low":
      riskMultiplier = 1.0;
      break;
    case "medium":
      riskMultiplier = 0.85;
      break;
    case "high":
      riskMultiplier = 0.65;
      break;
    case "critical":
      riskMultiplier = 0.4;
      break;
  }

  const riskAdjustedScore = Math.round(
    Math.min(100, Math.max(0, weightedBase * riskMultiplier)),
  );
  const overallScore = riskAdjustedScore;

  // Recommendation logic (evaluated in order)
  let recommendation: AgentOpportunityDecisionRecommendation;
  if (brief.risk.riskLevel === "critical") {
    recommendation = "request_ceo_review";
  } else if (overallScore < 30) {
    recommendation = "reject_opportunity";
  } else if (overallScore < 50) {
    recommendation = "needs_more_research";
  } else if (brief.evidence.length === 0) {
    recommendation = "needs_more_research";
  } else if (brief.confidenceScore < 50) {
    recommendation = "prepare_validation_plan";
  } else if (overallScore >= 70 && brief.evidence.length > 0 && brief.confidenceScore >= 60) {
    recommendation = "save_as_candidate";
  } else {
    recommendation = "prepare_validation_plan";
  }

  return {
    revenuePotentialScore,
    speedScore,
    costScore,
    automationScore,
    confidenceScore,
    riskAdjustedScore,
    overallScore,
    recommendation,
  };
}

// ---------------------------------------------------------------------------
// SECTION H — buildAgentOpportunityBrief
// ---------------------------------------------------------------------------

export type BuildAgentOpportunityBriefInput = Omit<
  AgentOpportunityBrief,
  "humanOnTheLoop" | "approvalRequired" | "noExecutionAuthorized"
>;

export function buildAgentOpportunityBrief(
  input: BuildAgentOpportunityBriefInput,
): AgentOpportunityBrief {
  return {
    briefId: input.briefId,
    agentId: input.agentId,
    source: input.source,
    title: input.title,
    targetCustomer: input.targetCustomer,
    problem: input.problem,
    proposedOffer: input.proposedOffer,
    revenueModel: input.revenueModel,
    estimatedRevenuePotentialCents: input.estimatedRevenuePotentialCents,
    estimatedValidationCostCents: input.estimatedValidationCostCents,
    speedToFirstDollarDays: input.speedToFirstDollarDays,
    automationPotentialScore: input.automationPotentialScore,
    confidenceScore: input.confidenceScore,
    risk: {
      riskLevel: input.risk.riskLevel,
      riskFactors: [...input.risk.riskFactors],
      mitigationNotes: [...input.risk.mitigationNotes],
    },
    validationPlan: {
      hypothesis: input.validationPlan.hypothesis,
      firstValidationStep: input.validationPlan.firstValidationStep,
      validationChannel: input.validationPlan.validationChannel,
      successMetric: input.validationPlan.successMetric,
      successThreshold: input.validationPlan.successThreshold,
      validationWindowDays: input.validationPlan.validationWindowDays,
      budgetCapCents: input.validationPlan.budgetCapCents,
    },
    killCriteria: [...input.killCriteria],
    recommendedDecision: input.recommendedDecision,
    nextAction: {
      actionLabel: input.nextAction.actionLabel,
      rationale: input.nextAction.rationale,
      estimatedEffortHours: input.nextAction.estimatedEffortHours,
    },
    rationale: input.rationale,
    evidence: [...input.evidence],
    createdAt: input.createdAt,
    humanOnTheLoop: true,
    approvalRequired: true,
    noExecutionAuthorized: true,
  };
}
