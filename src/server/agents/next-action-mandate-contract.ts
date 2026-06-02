// src/server/agents/next-action-mandate-contract.ts

/**
 * Pure local contract for agent next-action mandates.
 *
 * A Next Action Mandate is a planning/control-loop object. It captures the
 * next cash-oriented move, the evidence needed to justify it, and whether the
 * agent accepts, refutes, or counter-proposes. It never authorizes live or
 * external execution.
 */

// ---------------------------------------------------------------------------
// Enumerations & supporting types
// ---------------------------------------------------------------------------

export const NextActionMandateStatus = {
  PENDING: "PENDING",
  ACCEPTED_FOR_NEXT_WORK: "ACCEPTED_FOR_NEXT_WORK",
  REFUTED: "REFUTED",
  COUNTER_PROPOSED: "COUNTER_PROPOSED",
  IGNORED: "IGNORED",
  NEEDS_CEO_DECISION: "NEEDS_CEO_DECISION",
} as const;

export type NextActionMandateStatus =
  (typeof NextActionMandateStatus)[keyof typeof NextActionMandateStatus];

export const NextActionMandateType = {
  FIND_BUYER: "find_buyer",
  VALIDATE_PAIN: "validate_pain",
  TEST_OFFER: "test_offer",
  COLLECT_EVIDENCE: "collect_evidence",
  TEST_PAYMENT_SIGNAL: "test_payment_signal",
  REDUCE_COST: "reduce_cost",
  SCALE_SIGNAL: "scale_signal",
  CEO_DECISION: "ceo_decision",
} as const;

export type NextActionMandateType =
  (typeof NextActionMandateType)[keyof typeof NextActionMandateType];

export type NextActionMandateComplianceRisk = "none" | "low" | "medium" | "high";
export type NextActionMandateInitiativeSignal = "none" | "low" | "medium" | "high";
export type NextActionMandateRiskLevel = "low" | "medium" | "high" | "critical";

export type NextActionMandateValidationSeverity = "error" | "warning";

export interface NextActionMandateIssue {
  code: string;
  message: string;
  path?: string;
  severity: NextActionMandateValidationSeverity;
}

export interface NextActionMandateValidation {
  valid: boolean;
  issues: NextActionMandateIssue[];
}

// ---------------------------------------------------------------------------
// Core contract
// ---------------------------------------------------------------------------

export interface NextActionMandateCounterProposal {
  recommendedAction: string;
  rationale: string;
  expectedCashImpactCents?: number;
  expectedCostCents?: number;
}

export interface NextActionMandate {
  mandateId: string;
  previousActionId: string;
  workOrderId?: string;
  ventureId?: string;
  agentId: string;
  mandateType: NextActionMandateType;
  recommendedAction: string;
  cashHypothesis: string;
  requiredEvidence: string[];
  expectedCashImpactCents?: number;
  expectedCostCents?: number;
  expectedRoiMultiple?: number;
  status: NextActionMandateStatus;
  refutationRationale?: string;
  counterProposal?: NextActionMandateCounterProposal;
  complianceRisk: NextActionMandateComplianceRisk;
  initiativeSignal: NextActionMandateInitiativeSignal;
  riskLevel: NextActionMandateRiskLevel;
  requiresCeoApproval: boolean;
  createdAt: string;
  humanOnTheLoop: true;
  noExecutionAuthorized: true;
}

export interface BuildNextActionMandateInput {
  mandateId: string;
  previousActionId: string;
  workOrderId?: string;
  ventureId?: string;
  agentId: string;
  mandateType: NextActionMandateType;
  recommendedAction: string;
  cashHypothesis: string;
  requiredEvidence: string[];
  expectedCashImpactCents?: number;
  expectedCostCents?: number;
  expectedRoiMultiple?: number;
  status?: NextActionMandateStatus;
  refutationRationale?: string;
  counterProposal?: NextActionMandateCounterProposal;
  complianceRisk?: NextActionMandateComplianceRisk;
  initiativeSignal?: NextActionMandateInitiativeSignal;
  requiresCeoApproval?: boolean;
  riskLevel?: NextActionMandateRiskLevel;
  createdAt?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_STATUSES: ReadonlySet<string> = new Set(Object.values(NextActionMandateStatus));
const VALID_MANDATE_TYPES: ReadonlySet<string> = new Set(Object.values(NextActionMandateType));

const VALID_COMPLIANCE_RISKS: ReadonlySet<string> = new Set([
  "none",
  "low",
  "medium",
  "high",
]);

const VALID_INITIATIVE_SIGNALS: ReadonlySet<string> = new Set([
  "none",
  "low",
  "medium",
  "high",
]);

const VALID_RISK_LEVELS: ReadonlySet<string> = new Set([
  "low",
  "medium",
  "high",
  "critical",
]);

const COMPLIANCE_RISK_RANK: Record<NextActionMandateComplianceRisk, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
};

const INITIATIVE_SIGNAL_RANK: Record<NextActionMandateInitiativeSignal, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
};

const ISO_DATE_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

const SENSITIVE_ACTION_PATTERNS: readonly RegExp[] = [
  /\bsend\s+(?:an?\s+)?email\b/i,
  /\bcontact\s+(?:a\s+|the\s+)?customer\b/i,
  /\bspend\s+money\b/i,
  /\bpublish\b/i,
  /\bdeploy\b/i,
  /\bmodify\s+(?:the\s+)?database\b/i,
  /\btransfer\s+money\b/i,
  /\bconnect\s+(?:an?\s+)?external\s+tool\b/i,
];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function mandateIssue(
  code: string,
  message: string,
  severity: NextActionMandateValidationSeverity = "error",
  path?: string,
): NextActionMandateIssue {
  const result: NextActionMandateIssue = { code, message, severity };
  if (path !== undefined) result.path = path;
  return result;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isValidComplianceRisk(value: unknown): value is NextActionMandateComplianceRisk {
  return typeof value === "string" && VALID_COMPLIANCE_RISKS.has(value);
}

function isValidInitiativeSignal(value: unknown): value is NextActionMandateInitiativeSignal {
  return typeof value === "string" && VALID_INITIATIVE_SIGNALS.has(value);
}

function isIsoDateString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    ISO_DATE_PATTERN.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function hasSensitiveActionLanguage(action: unknown): boolean {
  if (typeof action !== "string") return false;
  return SENSITIVE_ACTION_PATTERNS.some((pattern) => pattern.test(action));
}

function getCounterProposalAction(counterProposal: unknown): unknown {
  if (!counterProposal || typeof counterProposal !== "object" || Array.isArray(counterProposal)) {
    return undefined;
  }

  return (counterProposal as Record<string, unknown>).recommendedAction;
}

function hasCeoApprovalTrigger(mandate: {
  status?: unknown;
  riskLevel?: unknown;
  recommendedAction?: unknown;
  counterProposal?: unknown;
}): boolean {
  return (
    mandate.status === NextActionMandateStatus.NEEDS_CEO_DECISION ||
    mandate.riskLevel === "critical" ||
    hasSensitiveActionLanguage(mandate.recommendedAction) ||
    hasSensitiveActionLanguage(getCounterProposalAction(mandate.counterProposal))
  );
}

function complianceRiskAtLeast(
  risk: NextActionMandateComplianceRisk,
  minimum: NextActionMandateComplianceRisk,
): boolean {
  return COMPLIANCE_RISK_RANK[risk] >= COMPLIANCE_RISK_RANK[minimum];
}

function initiativeSignalAtLeast(
  signal: NextActionMandateInitiativeSignal,
  minimum: NextActionMandateInitiativeSignal,
): boolean {
  return INITIATIVE_SIGNAL_RANK[signal] >= INITIATIVE_SIGNAL_RANK[minimum];
}

function copyCounterProposal(
  counterProposal: NextActionMandateCounterProposal,
): NextActionMandateCounterProposal {
  const copy: NextActionMandateCounterProposal = {
    recommendedAction: counterProposal.recommendedAction,
    rationale: counterProposal.rationale,
  };

  if (counterProposal.expectedCashImpactCents !== undefined) {
    copy.expectedCashImpactCents = counterProposal.expectedCashImpactCents;
  }
  if (counterProposal.expectedCostCents !== undefined) {
    copy.expectedCostCents = counterProposal.expectedCostCents;
  }

  return copy;
}

function validateCounterProposal(
  counterProposal: unknown,
  required: boolean,
): NextActionMandateIssue[] {
  const issues: NextActionMandateIssue[] = [];

  if (!counterProposal || typeof counterProposal !== "object" || Array.isArray(counterProposal)) {
    if (required) {
      issues.push(mandateIssue(
        "counter_proposal_required",
        "COUNTER_PROPOSED mandates require a complete counterProposal",
        "error",
        "counterProposal",
      ));
    }
    return issues;
  }

  const proposal = counterProposal as Record<string, unknown>;

  if (!isNonEmptyString(proposal.recommendedAction)) {
    issues.push(mandateIssue(
      "counter_proposal_required",
      "counterProposal.recommendedAction is required",
      "error",
      "counterProposal.recommendedAction",
    ));
  }

  if (!isNonEmptyString(proposal.rationale)) {
    issues.push(mandateIssue(
      "counter_proposal_required",
      "counterProposal.rationale is required",
      "error",
      "counterProposal.rationale",
    ));
  }

  if (
    proposal.expectedCashImpactCents !== undefined &&
    !isNonNegativeNumber(proposal.expectedCashImpactCents)
  ) {
    issues.push(mandateIssue(
      "invalid_counter_proposal_expected_cash_impact_cents",
      "counterProposal.expectedCashImpactCents must be non-negative when present",
      "error",
      "counterProposal.expectedCashImpactCents",
    ));
  }

  if (
    proposal.expectedCostCents !== undefined &&
    !isNonNegativeNumber(proposal.expectedCostCents)
  ) {
    issues.push(mandateIssue(
      "invalid_counter_proposal_expected_cost_cents",
      "counterProposal.expectedCostCents must be non-negative when present",
      "error",
      "counterProposal.expectedCostCents",
    ));
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Derives the minimum compliance risk required by the mandate status.
 * IGNORED mandates are never allowed to remain below medium compliance risk.
 */
export function deriveMandateComplianceRisk(mandate: {
  status?: unknown;
  complianceRisk?: NextActionMandateComplianceRisk;
}): NextActionMandateComplianceRisk {
  const currentRisk = mandate.complianceRisk ?? "none";

  if (mandate.status === NextActionMandateStatus.IGNORED) {
    return complianceRiskAtLeast(currentRisk, "medium") ? currentRisk : "medium";
  }

  return currentRisk;
}

/**
 * Derives the initiative signal implied by the mandate status.
 * COUNTER_PROPOSED is treated as agent initiative, not passive non-compliance.
 */
export function deriveMandateInitiativeSignal(mandate: {
  status?: unknown;
  initiativeSignal?: NextActionMandateInitiativeSignal;
}): NextActionMandateInitiativeSignal {
  const currentSignal = mandate.initiativeSignal ?? "none";

  if (mandate.status === NextActionMandateStatus.COUNTER_PROPOSED) {
    return initiativeSignalAtLeast(currentSignal, "medium") ? currentSignal : "medium";
  }

  return currentSignal;
}

/**
 * Returns true when a mandate is explicitly marked for CEO approval or when
 * the contract rules imply that CEO approval is required.
 */
export function mandateRequiresCeoApproval(mandate: {
  status?: unknown;
  riskLevel?: unknown;
  recommendedAction?: unknown;
  counterProposal?: unknown;
  requiresCeoApproval?: unknown;
}): boolean {
  return mandate.requiresCeoApproval === true || hasCeoApprovalTrigger(mandate);
}

/**
 * Builds a local Next Action Mandate and enforces planning-safety defaults.
 *
 * ACCEPTED_FOR_NEXT_WORK is accepted as the next planning task only. The
 * returned mandate always keeps noExecutionAuthorized true.
 */
export function buildNextActionMandate(
  input: BuildNextActionMandateInput,
): NextActionMandate {
  const status = input.status ?? NextActionMandateStatus.PENDING;
  const riskLevel = input.riskLevel ?? "low";
  const complianceRisk = deriveMandateComplianceRisk({
    status,
    complianceRisk: input.complianceRisk ?? "none",
  });
  const initiativeSignal = deriveMandateInitiativeSignal({
    status,
    initiativeSignal: input.initiativeSignal ?? "none",
  });

  const mandate: NextActionMandate = {
    mandateId: input.mandateId,
    previousActionId: input.previousActionId,
    agentId: input.agentId,
    mandateType: input.mandateType,
    recommendedAction: input.recommendedAction,
    cashHypothesis: input.cashHypothesis,
    requiredEvidence: Array.isArray(input.requiredEvidence)
      ? [...input.requiredEvidence]
      : [],
    status,
    complianceRisk,
    initiativeSignal,
    riskLevel,
    requiresCeoApproval: mandateRequiresCeoApproval({
      status,
      riskLevel,
      recommendedAction: input.recommendedAction,
      counterProposal: input.counterProposal,
      requiresCeoApproval: input.requiresCeoApproval,
    }),
    createdAt: input.createdAt ?? new Date().toISOString(),
    humanOnTheLoop: true,
    noExecutionAuthorized: true,
  };

  if (input.workOrderId !== undefined) mandate.workOrderId = input.workOrderId;
  if (input.ventureId !== undefined) mandate.ventureId = input.ventureId;
  if (input.expectedCashImpactCents !== undefined) {
    mandate.expectedCashImpactCents = input.expectedCashImpactCents;
  }
  if (input.expectedCostCents !== undefined) {
    mandate.expectedCostCents = input.expectedCostCents;
  }
  if (input.expectedRoiMultiple !== undefined) {
    mandate.expectedRoiMultiple = input.expectedRoiMultiple;
  }
  if (input.refutationRationale !== undefined) {
    mandate.refutationRationale = input.refutationRationale;
  }
  if (input.counterProposal !== undefined) {
    mandate.counterProposal = copyCounterProposal(input.counterProposal);
  }

  return mandate;
}

/**
 * Validates a Next Action Mandate against structural and planning-safety rules.
 * This function is pure and performs no writes, dispatch, approval bypasses, or
 * external side effects.
 */
export function validateNextActionMandate(
  mandate: Record<string, unknown>,
): NextActionMandateValidation {
  const issues: NextActionMandateIssue[] = [];

  if (!isNonEmptyString(mandate.mandateId)) {
    issues.push(mandateIssue("missing_mandate_id", "Mandate is missing mandateId"));
  }

  if (!isNonEmptyString(mandate.previousActionId)) {
    issues.push(mandateIssue(
      "missing_previous_action_id",
      "Mandate is missing previousActionId",
    ));
  }

  if (mandate.workOrderId !== undefined && !isNonEmptyString(mandate.workOrderId)) {
    issues.push(mandateIssue(
      "invalid_work_order_id",
      "Mandate workOrderId must be non-empty when present",
      "error",
      "workOrderId",
    ));
  }

  if (mandate.ventureId !== undefined && !isNonEmptyString(mandate.ventureId)) {
    issues.push(mandateIssue(
      "invalid_venture_id",
      "Mandate ventureId must be non-empty when present",
      "error",
      "ventureId",
    ));
  }

  if (!isNonEmptyString(mandate.agentId)) {
    issues.push(mandateIssue("missing_agent_id", "Mandate is missing agentId"));
  }

  if (!isNonEmptyString(mandate.mandateType)) {
    issues.push(mandateIssue("missing_mandate_type", "Mandate is missing mandateType"));
  } else if (!VALID_MANDATE_TYPES.has(mandate.mandateType)) {
    issues.push(mandateIssue(
      "invalid_mandate_type",
      `Unknown mandate type: "${mandate.mandateType}"`,
      "error",
      "mandateType",
    ));
  }

  if (!isNonEmptyString(mandate.recommendedAction)) {
    issues.push(mandateIssue(
      "missing_recommended_action",
      "Mandate is missing recommendedAction",
    ));
  }

  if (!isNonEmptyString(mandate.cashHypothesis)) {
    issues.push(mandateIssue(
      "missing_cash_hypothesis",
      "Mandate is missing cashHypothesis",
    ));
  }

  if (!Array.isArray(mandate.requiredEvidence)) {
    issues.push(mandateIssue(
      "invalid_required_evidence",
      "Mandate requiredEvidence must be an array",
      "error",
      "requiredEvidence",
    ));
  } else if (mandate.requiredEvidence.length === 0) {
    issues.push(mandateIssue(
      "required_evidence_required",
      "Mandate requiredEvidence must include at least one evidence requirement",
      "error",
      "requiredEvidence",
    ));
  } else {
    for (let index = 0; index < mandate.requiredEvidence.length; index++) {
      if (!isNonEmptyString(mandate.requiredEvidence[index])) {
        issues.push(mandateIssue(
          "invalid_required_evidence",
          `Mandate requiredEvidence[${index}] must be a non-empty string`,
          "error",
          `requiredEvidence[${index}]`,
        ));
      }
    }
  }

  if (!isNonEmptyString(mandate.createdAt)) {
    issues.push(mandateIssue("missing_created_at", "Mandate is missing createdAt"));
  } else if (!isIsoDateString(mandate.createdAt)) {
    issues.push(mandateIssue(
      "invalid_created_at",
      "Mandate createdAt must be an ISO 8601 date string",
      "error",
      "createdAt",
    ));
  }

  if (!isNonEmptyString(mandate.status)) {
    issues.push(mandateIssue("missing_status", "Mandate is missing status"));
  } else if (!VALID_STATUSES.has(mandate.status)) {
    issues.push(mandateIssue(
      "invalid_status",
      `Unknown mandate status: "${mandate.status}"`,
      "error",
      "status",
    ));
  }

  if (!isNonEmptyString(mandate.complianceRisk)) {
    issues.push(mandateIssue(
      "missing_compliance_risk",
      "Mandate is missing complianceRisk",
    ));
  } else if (!VALID_COMPLIANCE_RISKS.has(mandate.complianceRisk)) {
    issues.push(mandateIssue(
      "invalid_compliance_risk",
      `Unknown compliance risk: "${mandate.complianceRisk}"`,
      "error",
      "complianceRisk",
    ));
  }

  if (!isNonEmptyString(mandate.initiativeSignal)) {
    issues.push(mandateIssue(
      "missing_initiative_signal",
      "Mandate is missing initiativeSignal",
    ));
  } else if (!VALID_INITIATIVE_SIGNALS.has(mandate.initiativeSignal)) {
    issues.push(mandateIssue(
      "invalid_initiative_signal",
      `Unknown initiative signal: "${mandate.initiativeSignal}"`,
      "error",
      "initiativeSignal",
    ));
  }

  if (!isNonEmptyString(mandate.riskLevel)) {
    issues.push(mandateIssue("missing_risk_level", "Mandate is missing riskLevel"));
  } else if (!VALID_RISK_LEVELS.has(mandate.riskLevel)) {
    issues.push(mandateIssue(
      "invalid_risk_level",
      `Unknown risk level: "${mandate.riskLevel}"`,
      "error",
      "riskLevel",
    ));
  }

  if (typeof mandate.requiresCeoApproval !== "boolean") {
    issues.push(mandateIssue(
      "invalid_requires_ceo_approval",
      "Mandate requiresCeoApproval must be a boolean",
      "error",
      "requiresCeoApproval",
    ));
  }

  if (mandate.humanOnTheLoop !== true) {
    issues.push(mandateIssue(
      "human_on_the_loop_required",
      "Mandate humanOnTheLoop must be true",
    ));
  }

  if (mandate.noExecutionAuthorized !== true) {
    issues.push(mandateIssue(
      "no_execution_authorized_required",
      "Mandate noExecutionAuthorized must be true",
    ));
  }

  if (
    mandate.status === NextActionMandateStatus.REFUTED &&
    !isNonEmptyString(mandate.refutationRationale)
  ) {
    issues.push(mandateIssue(
      "refutation_rationale_required",
      "REFUTED mandates require refutationRationale",
      "error",
      "refutationRationale",
    ));
  }

  issues.push(...validateCounterProposal(
    mandate.counterProposal,
    mandate.status === NextActionMandateStatus.COUNTER_PROPOSED,
  ));

  if (
    mandate.status === NextActionMandateStatus.IGNORED &&
    isValidComplianceRisk(mandate.complianceRisk) &&
    !complianceRiskAtLeast(mandate.complianceRisk, "medium")
  ) {
    issues.push(mandateIssue(
      "compliance_risk_too_low",
      "IGNORED mandates require complianceRisk of at least medium",
      "error",
      "complianceRisk",
    ));
  }

  if (
    mandate.status === NextActionMandateStatus.COUNTER_PROPOSED &&
    isValidInitiativeSignal(mandate.initiativeSignal) &&
    !initiativeSignalAtLeast(mandate.initiativeSignal, "medium")
  ) {
    issues.push(mandateIssue(
      "initiative_signal_too_low",
      "COUNTER_PROPOSED mandates require initiativeSignal of at least medium",
      "error",
      "initiativeSignal",
    ));
  }

  if (hasCeoApprovalTrigger(mandate) && mandate.requiresCeoApproval !== true) {
    issues.push(mandateIssue(
      "ceo_approval_required",
      "Mandate requires CEO approval for this status, risk, or action language",
      "error",
      "requiresCeoApproval",
    ));
  }

  if (
    mandate.expectedCostCents !== undefined &&
    !isNonNegativeNumber(mandate.expectedCostCents)
  ) {
    issues.push(mandateIssue(
      "invalid_expected_cost_cents",
      "expectedCostCents must be non-negative when present",
      "error",
      "expectedCostCents",
    ));
  }

  if (
    mandate.expectedCashImpactCents !== undefined &&
    !isNonNegativeNumber(mandate.expectedCashImpactCents)
  ) {
    issues.push(mandateIssue(
      "invalid_expected_cash_impact_cents",
      "expectedCashImpactCents must be non-negative when present",
      "error",
      "expectedCashImpactCents",
    ));
  }

  if (
    mandate.expectedRoiMultiple !== undefined &&
    !isNonNegativeNumber(mandate.expectedRoiMultiple)
  ) {
    issues.push(mandateIssue(
      "invalid_expected_roi_multiple",
      "expectedRoiMultiple must be non-negative when present",
      "error",
      "expectedRoiMultiple",
    ));
  }

  return {
    valid: issues.filter((issue) => issue.severity === "error").length === 0,
    issues,
  };
}
