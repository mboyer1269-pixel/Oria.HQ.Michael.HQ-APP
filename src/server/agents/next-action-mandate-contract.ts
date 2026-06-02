// src/server/agents/next-action-mandate-contract.ts

/**
 * Pure local contract for agent next-action mandates.
 *
 * A Next Action Mandate is a planning/control-loop object. It can recommend
 * what should be considered next, but it never authorizes live or external
 * execution.
 */

// ---------------------------------------------------------------------------
// Enumerations & supporting types
// ---------------------------------------------------------------------------

export const NextActionMandateStatus = {
  PENDING: "PENDING",
  ACCEPTED_FOR_NEXT_WORK: "ACCEPTED_FOR_NEXT_WORK",
  REFUTED: "REFUTED",
  IGNORED: "IGNORED",
  NEEDS_CEO_DECISION: "NEEDS_CEO_DECISION",
} as const;

export type NextActionMandateStatus =
  (typeof NextActionMandateStatus)[keyof typeof NextActionMandateStatus];

export type NextActionMandateComplianceRisk = "none" | "low" | "medium" | "high";
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

export interface NextActionMandate {
  mandateId: string;
  previousActionId: string;
  ventureId?: string;
  agentId: string;
  recommendedAction: string;
  requiredEvidence: string[];
  expectedCashImpactCents?: number;
  expectedCostCents?: number;
  expectedRoiMultiple?: number;
  status: NextActionMandateStatus;
  refutationRationale?: string;
  complianceRisk: NextActionMandateComplianceRisk;
  requiresCeoApproval: boolean;
  riskLevel: NextActionMandateRiskLevel;
  createdAt: string;
  humanOnTheLoop: true;
  noExecutionAuthorized: true;
}

export interface BuildNextActionMandateInput {
  mandateId: string;
  previousActionId: string;
  ventureId?: string;
  agentId: string;
  recommendedAction: string;
  requiredEvidence: string[];
  expectedCashImpactCents?: number;
  expectedCostCents?: number;
  expectedRoiMultiple?: number;
  status?: NextActionMandateStatus;
  refutationRationale?: string;
  complianceRisk?: NextActionMandateComplianceRisk;
  requiresCeoApproval?: boolean;
  riskLevel?: NextActionMandateRiskLevel;
  createdAt?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_STATUSES: ReadonlySet<string> = new Set(Object.values(NextActionMandateStatus));

const VALID_COMPLIANCE_RISKS: ReadonlySet<string> = new Set([
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

function hasCeoApprovalTrigger(mandate: {
  status?: unknown;
  riskLevel?: unknown;
  recommendedAction?: unknown;
}): boolean {
  return (
    mandate.status === NextActionMandateStatus.NEEDS_CEO_DECISION ||
    mandate.riskLevel === "critical" ||
    hasSensitiveActionLanguage(mandate.recommendedAction)
  );
}

function complianceRiskAtLeast(
  risk: NextActionMandateComplianceRisk,
  minimum: NextActionMandateComplianceRisk,
): boolean {
  return COMPLIANCE_RISK_RANK[risk] >= COMPLIANCE_RISK_RANK[minimum];
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
 * Returns true when a mandate is explicitly marked for CEO approval or when
 * the contract rules imply that CEO approval is required.
 */
export function mandateRequiresCeoApproval(mandate: {
  status?: unknown;
  riskLevel?: unknown;
  recommendedAction?: unknown;
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

  const mandate: NextActionMandate = {
    mandateId: input.mandateId,
    previousActionId: input.previousActionId,
    agentId: input.agentId,
    recommendedAction: input.recommendedAction,
    requiredEvidence: Array.isArray(input.requiredEvidence)
      ? [...input.requiredEvidence]
      : [],
    status,
    complianceRisk,
    requiresCeoApproval: mandateRequiresCeoApproval({
      status,
      riskLevel,
      recommendedAction: input.recommendedAction,
      requiresCeoApproval: input.requiresCeoApproval,
    }),
    riskLevel,
    createdAt: input.createdAt ?? new Date().toISOString(),
    humanOnTheLoop: true,
    noExecutionAuthorized: true,
  };

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

  if (!isNonEmptyString(mandate.agentId)) {
    issues.push(mandateIssue("missing_agent_id", "Mandate is missing agentId"));
  }

  if (!isNonEmptyString(mandate.recommendedAction)) {
    issues.push(mandateIssue(
      "missing_recommended_action",
      "Mandate is missing recommendedAction",
    ));
  }

  if (!Array.isArray(mandate.requiredEvidence)) {
    issues.push(mandateIssue(
      "invalid_required_evidence",
      "Mandate requiredEvidence must be an array",
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
