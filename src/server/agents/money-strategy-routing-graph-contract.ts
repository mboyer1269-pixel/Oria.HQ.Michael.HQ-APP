// src/server/agents/money-strategy-routing-graph-contract.ts

/**
 * Pure local contract for money-strategy routing.
 *
 * This is a dynamic routing graph, not a linear task flow. It evaluates a
 * mandate and optional planning proposal, then selects the next state and
 * playbook based on evidence quality, expected economics, risk, and agent
 * initiative. It never dispatches runtime execution.
 */

import {
  deriveMandateInitiativeSignal,
  mandateRequiresCeoApproval,
  NextActionMandate,
  NextActionMandateInitiativeSignal,
  NextActionMandateStatus,
  NextActionMandateType,
  NextActionMandateRiskLevel,
} from "./next-action-mandate-contract";
import type { MandateWorkOrderPlan } from "./next-action-mandate-work-order-adapter";

export const MoneyStrategyState = {
  HYPOTHESIS: "hypothesis",
  VALIDATION_IN_PROGRESS: "validation_in_progress",
  EVIDENCE_COLLECTION: "evidence_collection",
  PAYMENT_SIGNAL: "payment_signal",
  PROOF_CONFIRMED: "proof_confirmed",
  SCALING_CANDIDATE: "scaling_candidate",
  COST_REDUCTION: "cost_reduction",
  CEO_REVIEW: "ceo_review",
  COMPLIANCE_REVIEW: "compliance_review",
  BLOCKED: "blocked",
} as const;

export type MoneyStrategyState =
  (typeof MoneyStrategyState)[keyof typeof MoneyStrategyState];

export const MoneyStrategyPlaybook = {
  BUYER_DISCOVERY: "buyer_discovery",
  PAIN_VALIDATION: "pain_validation",
  OFFER_TEST: "offer_test",
  EVIDENCE_COLLECTION: "evidence_collection",
  PAYMENT_SIGNAL_TEST: "payment_signal_test",
  CONVERSION: "conversion",
  COST_REDUCTION: "cost_reduction",
  SCALE_SIGNAL: "scale_signal",
  CEO_DECISION: "ceo_decision",
  RISK_CONTAINMENT: "risk_containment",
} as const;

export type MoneyStrategyPlaybook =
  (typeof MoneyStrategyPlaybook)[keyof typeof MoneyStrategyPlaybook];

export const MoneyStrategyEvidenceQuality = {
  NONE: "none",
  WEAK_SIGNAL: "weak_signal",
  MANUAL_OBSERVATION: "manual_observation",
  VERIFIED_FINANCIAL: "verified_financial",
} as const;

export type MoneyStrategyEvidenceQuality =
  (typeof MoneyStrategyEvidenceQuality)[keyof typeof MoneyStrategyEvidenceQuality];

export type MoneyStrategyRouteStatus =
  | "route_to_playbook"
  | "ceo_review"
  | "compliance_review"
  | "blocked";

export type MoneyStrategyValidationSeverity = "error" | "warning";

export interface MoneyStrategyRoutingIssue {
  code: string;
  message: string;
  path?: string;
  severity: MoneyStrategyValidationSeverity;
}

export interface MoneyStrategyRoutingValidation {
  valid: boolean;
  issues: MoneyStrategyRoutingIssue[];
}

export interface RouteMoneyStrategyInput {
  mandate: NextActionMandate;
  plan?: MandateWorkOrderPlan;
  currentState: MoneyStrategyState;
  evidenceQuality: MoneyStrategyEvidenceQuality;
  createdAt?: string;
}

export interface MoneyStrategyRoutingDecision {
  routeId: string;
  mandateId: string;
  planId?: string;
  workOrderId?: string;
  agentId: string;
  currentState: MoneyStrategyState;
  nextState: MoneyStrategyState;
  selectedPlaybook: MoneyStrategyPlaybook;
  routeStatus: MoneyStrategyRouteStatus;
  recommendedAction: string;
  cashHypothesis: string;
  requiredEvidence: string[];
  evidenceQuality: MoneyStrategyEvidenceQuality;
  expectedCashImpactCents?: number;
  expectedCostCents?: number;
  expectedRoiMultiple?: number;
  moneyScore: number;
  initiativeSignal: NextActionMandateInitiativeSignal;
  riskLevel: NextActionMandateRiskLevel;
  requiresCeoApproval: boolean;
  counterProposalFavored: boolean;
  reasoning: string[];
  createdAt: string;
  humanOnTheLoop: true;
  noExecutionAuthorized: true;
}

const VALID_STATES: ReadonlySet<string> = new Set(Object.values(MoneyStrategyState));
const VALID_PLAYBOOKS: ReadonlySet<string> = new Set(Object.values(MoneyStrategyPlaybook));
const VALID_EVIDENCE_QUALITIES: ReadonlySet<string> = new Set(Object.values(MoneyStrategyEvidenceQuality));
const VALID_ROUTE_STATUSES: ReadonlySet<string> = new Set([
  "route_to_playbook",
  "ceo_review",
  "compliance_review",
  "blocked",
]);

const ISO_DATE_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

function routingIssue(
  code: string,
  message: string,
  severity: MoneyStrategyValidationSeverity = "error",
  path?: string,
): MoneyStrategyRoutingIssue {
  const result: MoneyStrategyRoutingIssue = { code, message, severity };
  if (path !== undefined) result.path = path;
  return result;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isIsoDateString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    ISO_DATE_PATTERN.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function stableToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 96) || "unknown";
}

function boundedScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function deriveEffectiveEconomics(mandate: NextActionMandate): {
  expectedCashImpactCents?: number;
  expectedCostCents?: number;
  expectedRoiMultiple?: number;
  counterProposalFavored: boolean;
  recommendedAction: string;
} {
  if (
    mandate.status === NextActionMandateStatus.COUNTER_PROPOSED &&
    mandate.counterProposal !== undefined
  ) {
    return {
      expectedCashImpactCents:
        mandate.counterProposal.expectedCashImpactCents ?? mandate.expectedCashImpactCents,
      expectedCostCents: mandate.counterProposal.expectedCostCents ?? mandate.expectedCostCents,
      expectedRoiMultiple: deriveRoiMultiple(
        mandate.counterProposal.expectedCashImpactCents ?? mandate.expectedCashImpactCents,
        mandate.counterProposal.expectedCostCents ?? mandate.expectedCostCents,
        mandate.expectedRoiMultiple,
      ),
      counterProposalFavored: true,
      recommendedAction: mandate.counterProposal.recommendedAction,
    };
  }

  return {
    expectedCashImpactCents: mandate.expectedCashImpactCents,
    expectedCostCents: mandate.expectedCostCents,
    expectedRoiMultiple: deriveRoiMultiple(
      mandate.expectedCashImpactCents,
      mandate.expectedCostCents,
      mandate.expectedRoiMultiple,
    ),
    counterProposalFavored: false,
    recommendedAction: mandate.recommendedAction,
  };
}

function deriveRoiMultiple(
  expectedCashImpactCents?: number,
  expectedCostCents?: number,
  explicitRoi?: number,
): number | undefined {
  if (explicitRoi !== undefined) return explicitRoi;
  if (
    expectedCashImpactCents !== undefined &&
    expectedCostCents !== undefined &&
    expectedCostCents > 0
  ) {
    return expectedCashImpactCents / expectedCostCents;
  }
  return undefined;
}

function scoreEvidence(evidenceQuality: MoneyStrategyEvidenceQuality): number {
  if (evidenceQuality === MoneyStrategyEvidenceQuality.VERIFIED_FINANCIAL) return 35;
  if (evidenceQuality === MoneyStrategyEvidenceQuality.MANUAL_OBSERVATION) return 20;
  if (evidenceQuality === MoneyStrategyEvidenceQuality.WEAK_SIGNAL) return 12;
  return 0;
}

function scoreRisk(riskLevel: NextActionMandateRiskLevel): number {
  if (riskLevel === "low") return 20;
  if (riskLevel === "medium") return 12;
  if (riskLevel === "high") return 4;
  return -20;
}

function scoreInitiative(signal: NextActionMandateInitiativeSignal): number {
  if (signal === "high") return 20;
  if (signal === "medium") return 14;
  if (signal === "low") return 6;
  return 0;
}

function scoreRoi(expectedRoiMultiple?: number): number {
  if (expectedRoiMultiple === undefined) return 0;
  if (expectedRoiMultiple >= 10) return 35;
  if (expectedRoiMultiple >= 3) return 25;
  if (expectedRoiMultiple >= 1) return 12;
  if (expectedRoiMultiple > 0) return -10;
  return -20;
}

function deriveMoneyScore(input: {
  evidenceQuality: MoneyStrategyEvidenceQuality;
  riskLevel: NextActionMandateRiskLevel;
  initiativeSignal: NextActionMandateInitiativeSignal;
  expectedRoiMultiple?: number;
}): number {
  return boundedScore(
    scoreEvidence(input.evidenceQuality) +
    scoreRisk(input.riskLevel) +
    scoreInitiative(input.initiativeSignal) +
    scoreRoi(input.expectedRoiMultiple),
  );
}

function selectDefaultPlaybook(mandateType: NextActionMandateType): MoneyStrategyPlaybook {
  if (mandateType === NextActionMandateType.FIND_BUYER) return MoneyStrategyPlaybook.BUYER_DISCOVERY;
  if (mandateType === NextActionMandateType.VALIDATE_PAIN) return MoneyStrategyPlaybook.PAIN_VALIDATION;
  if (mandateType === NextActionMandateType.COLLECT_EVIDENCE) return MoneyStrategyPlaybook.EVIDENCE_COLLECTION;
  if (mandateType === NextActionMandateType.TEST_PAYMENT_SIGNAL) return MoneyStrategyPlaybook.PAYMENT_SIGNAL_TEST;
  if (mandateType === NextActionMandateType.REDUCE_COST) return MoneyStrategyPlaybook.COST_REDUCTION;
  if (mandateType === NextActionMandateType.SCALE_SIGNAL) return MoneyStrategyPlaybook.SCALE_SIGNAL;
  if (mandateType === NextActionMandateType.CEO_DECISION) return MoneyStrategyPlaybook.CEO_DECISION;
  return MoneyStrategyPlaybook.OFFER_TEST;
}

function routeCore(input: {
  mandate: NextActionMandate;
  evidenceQuality: MoneyStrategyEvidenceQuality;
  expectedRoiMultiple?: number;
  requiresCeoApproval: boolean;
}): {
  nextState: MoneyStrategyState;
  selectedPlaybook: MoneyStrategyPlaybook;
  routeStatus: MoneyStrategyRouteStatus;
  reasoning: string[];
} {
  const { mandate } = input;
  const reasoning: string[] = [];

  if (mandate.status === NextActionMandateStatus.IGNORED) {
    reasoning.push("Mandate was ignored, so the graph routes to compliance review.");
    return {
      nextState: MoneyStrategyState.COMPLIANCE_REVIEW,
      selectedPlaybook: MoneyStrategyPlaybook.RISK_CONTAINMENT,
      routeStatus: "compliance_review",
      reasoning,
    };
  }

  if (
    mandate.status === NextActionMandateStatus.NEEDS_CEO_DECISION ||
    input.requiresCeoApproval ||
    mandate.riskLevel === "critical"
  ) {
    reasoning.push("Mandate requires CEO review before any external action can be considered.");
    return {
      nextState: MoneyStrategyState.CEO_REVIEW,
      selectedPlaybook: MoneyStrategyPlaybook.CEO_DECISION,
      routeStatus: "ceo_review",
      reasoning,
    };
  }

  if (
    input.expectedRoiMultiple !== undefined &&
    input.expectedRoiMultiple < 1
  ) {
    reasoning.push("Expected ROI is below 1x, so the graph routes to cost reduction.");
    return {
      nextState: MoneyStrategyState.COST_REDUCTION,
      selectedPlaybook: MoneyStrategyPlaybook.COST_REDUCTION,
      routeStatus: "route_to_playbook",
      reasoning,
    };
  }

  if (
    input.evidenceQuality === MoneyStrategyEvidenceQuality.VERIFIED_FINANCIAL &&
    input.expectedRoiMultiple !== undefined &&
    input.expectedRoiMultiple >= 10 &&
    mandate.mandateType === NextActionMandateType.SCALE_SIGNAL
  ) {
    reasoning.push("Verified financial evidence and high ROI make this a scaling candidate.");
    return {
      nextState: MoneyStrategyState.SCALING_CANDIDATE,
      selectedPlaybook: MoneyStrategyPlaybook.SCALE_SIGNAL,
      routeStatus: "route_to_playbook",
      reasoning,
    };
  }

  if (input.evidenceQuality === MoneyStrategyEvidenceQuality.VERIFIED_FINANCIAL) {
    reasoning.push("Verified financial evidence routes toward conversion.");
    return {
      nextState: MoneyStrategyState.PROOF_CONFIRMED,
      selectedPlaybook: MoneyStrategyPlaybook.CONVERSION,
      routeStatus: "route_to_playbook",
      reasoning,
    };
  }

  if (input.evidenceQuality === MoneyStrategyEvidenceQuality.NONE) {
    reasoning.push("No evidence yet, so the graph routes to evidence collection.");
    return {
      nextState: MoneyStrategyState.EVIDENCE_COLLECTION,
      selectedPlaybook: MoneyStrategyPlaybook.EVIDENCE_COLLECTION,
      routeStatus: "route_to_playbook",
      reasoning,
    };
  }

  reasoning.push("Weak or qualitative evidence routes to validation before scaling.");
  return {
    nextState: MoneyStrategyState.VALIDATION_IN_PROGRESS,
    selectedPlaybook: selectDefaultPlaybook(mandate.mandateType),
    routeStatus: "route_to_playbook",
    reasoning,
  };
}

export function routeMoneyStrategy(
  input: RouteMoneyStrategyInput,
): MoneyStrategyRoutingDecision {
  const createdAt = input.createdAt ?? input.mandate.createdAt;
  const economics = deriveEffectiveEconomics(input.mandate);
  const initiativeSignal = deriveMandateInitiativeSignal(input.mandate);
  const requiresCeoApproval = mandateRequiresCeoApproval(input.mandate);
  const moneyScore = deriveMoneyScore({
    evidenceQuality: input.evidenceQuality,
    riskLevel: input.mandate.riskLevel,
    initiativeSignal,
    expectedRoiMultiple: economics.expectedRoiMultiple,
  });
  const coreRoute = routeCore({
    mandate: input.mandate,
    evidenceQuality: input.evidenceQuality,
    expectedRoiMultiple: economics.expectedRoiMultiple,
    requiresCeoApproval,
  });

  const decision: MoneyStrategyRoutingDecision = {
    routeId: [
      "money_route",
      stableToken(input.mandate.mandateId),
      input.plan?.planId === undefined ? "no_plan" : stableToken(input.plan.planId),
      stableToken(input.currentState),
      stableToken(createdAt),
    ].join("_"),
    mandateId: input.mandate.mandateId,
    agentId: input.mandate.agentId,
    currentState: input.currentState,
    nextState: coreRoute.nextState,
    selectedPlaybook: coreRoute.selectedPlaybook,
    routeStatus: coreRoute.routeStatus,
    recommendedAction: economics.recommendedAction,
    cashHypothesis: input.mandate.cashHypothesis,
    requiredEvidence: [...input.mandate.requiredEvidence],
    evidenceQuality: input.evidenceQuality,
    moneyScore,
    initiativeSignal,
    riskLevel: input.mandate.riskLevel,
    requiresCeoApproval,
    counterProposalFavored: economics.counterProposalFavored,
    reasoning: coreRoute.reasoning,
    createdAt,
    humanOnTheLoop: true,
    noExecutionAuthorized: true,
  };

  if (input.plan?.planId !== undefined) decision.planId = input.plan.planId;
  if (input.plan?.workOrderId !== undefined) decision.workOrderId = input.plan.workOrderId;
  if (economics.expectedCashImpactCents !== undefined) {
    decision.expectedCashImpactCents = economics.expectedCashImpactCents;
  }
  if (economics.expectedCostCents !== undefined) {
    decision.expectedCostCents = economics.expectedCostCents;
  }
  if (economics.expectedRoiMultiple !== undefined) {
    decision.expectedRoiMultiple = economics.expectedRoiMultiple;
  }

  return decision;
}

export function validateMoneyStrategyRoutingDecision(
  decision: Record<string, unknown>,
): MoneyStrategyRoutingValidation {
  const issues: MoneyStrategyRoutingIssue[] = [];

  if (!isNonEmptyString(decision.routeId)) {
    issues.push(routingIssue("missing_route_id", "Routing decision is missing routeId"));
  }
  if (!isNonEmptyString(decision.mandateId)) {
    issues.push(routingIssue("missing_mandate_id", "Routing decision is missing mandateId"));
  }
  if (!isNonEmptyString(decision.agentId)) {
    issues.push(routingIssue("missing_agent_id", "Routing decision is missing agentId"));
  }
  if (!isNonEmptyString(decision.currentState) || !VALID_STATES.has(decision.currentState)) {
    issues.push(routingIssue("invalid_current_state", "Routing decision has invalid currentState"));
  }
  if (!isNonEmptyString(decision.nextState) || !VALID_STATES.has(decision.nextState)) {
    issues.push(routingIssue("invalid_next_state", "Routing decision has invalid nextState"));
  }
  if (!isNonEmptyString(decision.selectedPlaybook) || !VALID_PLAYBOOKS.has(decision.selectedPlaybook)) {
    issues.push(routingIssue("invalid_playbook", "Routing decision has invalid selectedPlaybook"));
  }
  if (!isNonEmptyString(decision.routeStatus) || !VALID_ROUTE_STATUSES.has(decision.routeStatus)) {
    issues.push(routingIssue("invalid_route_status", "Routing decision has invalid routeStatus"));
  }
  if (!isNonEmptyString(decision.evidenceQuality) || !VALID_EVIDENCE_QUALITIES.has(decision.evidenceQuality)) {
    issues.push(routingIssue("invalid_evidence_quality", "Routing decision has invalid evidenceQuality"));
  }
  if (!isNonEmptyString(decision.recommendedAction)) {
    issues.push(routingIssue("missing_recommended_action", "Routing decision is missing recommendedAction"));
  }
  if (!isNonEmptyString(decision.cashHypothesis)) {
    issues.push(routingIssue("missing_cash_hypothesis", "Routing decision is missing cashHypothesis"));
  }
  if (!Array.isArray(decision.requiredEvidence)) {
    issues.push(routingIssue("invalid_required_evidence", "Routing decision requiredEvidence must be an array"));
  }
  if (typeof decision.moneyScore !== "number" || !Number.isFinite(decision.moneyScore)) {
    issues.push(routingIssue("invalid_money_score", "Routing decision moneyScore must be a finite number"));
  }
  if (typeof decision.requiresCeoApproval !== "boolean") {
    issues.push(routingIssue("invalid_requires_ceo_approval", "requiresCeoApproval must be boolean"));
  }
  if (typeof decision.counterProposalFavored !== "boolean") {
    issues.push(routingIssue("invalid_counter_proposal_favored", "counterProposalFavored must be boolean"));
  }
  if (!Array.isArray(decision.reasoning)) {
    issues.push(routingIssue("invalid_reasoning", "Routing decision reasoning must be an array"));
  }
  if (!isNonEmptyString(decision.createdAt)) {
    issues.push(routingIssue("missing_created_at", "Routing decision is missing createdAt"));
  } else if (!isIsoDateString(decision.createdAt)) {
    issues.push(routingIssue("invalid_created_at", "Routing decision createdAt must be ISO 8601"));
  }
  if (decision.humanOnTheLoop !== true) {
    issues.push(routingIssue(
      "human_on_the_loop_required",
      "Routing decision humanOnTheLoop must be true",
    ));
  }
  if (decision.noExecutionAuthorized !== true) {
    issues.push(routingIssue(
      "no_execution_authorized_required",
      "Routing decision noExecutionAuthorized must be true",
    ));
  }

  return {
    valid: issues.filter((issue) => issue.severity === "error").length === 0,
    issues,
  };
}
