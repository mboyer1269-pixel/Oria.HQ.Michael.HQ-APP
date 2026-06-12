// src/server/agents/work-order-contract.ts

/**
 * Pure TypeScript contracts and validation helpers for Work Orders within the
 * Oria HQ Agentic Holding OS.
 *
 * A Work Order is the operational object that converts ideas into scoped,
 * measurable, approval-aware work. Work Orders are planning objects only —
 * they must not execute anything.
 *
 * Two flavours exist:
 *   - MissionWorkOrder  — scoped work assigned to an agent.
 *   - VentureWorkOrder  — a business opportunity proposed or owned by an agent.
 *
 * All helpers are pure: no I/O, no writes, no mutations, no side-effects.
 */

import type { ApprovalGate, ProfitTarget, PromotionLevel } from "./agent-profile-contract";
import type { BoosterType } from "./booster-contract";

// ---------------------------------------------------------------------------
// Enumerations & Supporting Types
// ---------------------------------------------------------------------------

export type WorkOrderType = "mission" | "venture";

export type WorkOrderStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "blocked";

export type WorkOrderRiskLevel = "low" | "medium" | "high" | "critical";

/** Re-exports ApprovalGate from agent-profile-contract for convenience. */
export type WorkOrderApprovalGate = ApprovalGate;

export interface WorkOrderExpectedOutput {
  /** Human-readable description of what the work order should produce */
  description: string;
  /** Machine-readable output type (e.g. "report", "code", "analysis", "booking") */
  outputType: string;
}

export interface WorkOrderSuccessMetric {
  /** Human-readable description of how success is measured */
  description: string;
  /** Optional quantitative target */
  target?: number;
  /** Unit for the target (e.g. "percent", "EUR", "count") */
  unit?: string;
}

export interface WorkOrderNextAction {
  /** Human-readable description of the immediate next step */
  description: string;
  /** The agent or role expected to take this action */
  actor: string;
}

export interface WorkOrderBudget {
  /** Amount requested */
  amount: number;
  /** Currency or unit */
  currency: string;
  /** Brief justification */
  justification?: string;
}

export interface WorkOrderBoosterRequest {
  /** Specific booster ID if known */
  boosterId?: string;
  /** Or the type of booster requested */
  boosterType?: BoosterType;
  /** Why this booster is needed */
  reason: string;
  /** What the booster is expected to produce */
  expectedOutput: string;
  /** Model tier required (e.g. "economy", "standard", "premium") */
  modelTier: string;
  /** Cost tier (e.g. "free", "low", "medium", "high") */
  costTier: string;
}

export interface WorkOrderPromotionOpportunity {
  /** Target promotion level if the work order succeeds */
  targetLevel: PromotionLevel;
  /** Criteria that must be met for promotion */
  criteria: string;
  /** Whether this work order is eligible for 🏆 Original Orya status */
  originalOryaEligible: boolean;
}

export interface WorkOrderValidationTest {
  /** Human-readable description of the validation test */
  description: string;
  /** How the test will be evaluated */
  evaluationMethod: string;
}

// ---------------------------------------------------------------------------
// Provenance Types
// ---------------------------------------------------------------------------

export type WorkOrderCreatedByType = "human" | "joris" | "agent" | "system";

// ---------------------------------------------------------------------------
// Business Value Types
// ---------------------------------------------------------------------------

export type WorkOrderValueType =
  | "revenue"
  | "cost_saving"
  | "risk_reduction"
  | "activation"
  | "learning";

export type WorkOrderValueConfidence = "low" | "medium" | "high";

export interface WorkOrderBusinessValue {
  /** Type of business value this work order delivers */
  valueType: WorkOrderValueType;
  /** Optional expected monetary or quantitative value */
  expectedValue?: number;
  /** Currency or unit for expectedValue */
  currency?: string;
  /** Confidence level in the value estimate */
  confidence: WorkOrderValueConfidence;
}

// ---------------------------------------------------------------------------
// Validation Result Types
// ---------------------------------------------------------------------------

export type WorkOrderValidationSeverity = "error" | "warning";

export interface WorkOrderValidationIssue {
  code: string;
  message: string;
  path?: string;
  severity: WorkOrderValidationSeverity;
}

export interface WorkOrderValidationResult {
  valid: boolean;
  issues: WorkOrderValidationIssue[];
}

// ---------------------------------------------------------------------------
// Core Work Order Contracts
// ---------------------------------------------------------------------------

export interface MissionWorkOrder {
  id: string;
  type: "mission";
  title: string;
  /** Agent accountable for the outcome */
  ownerAgentId: string;
  /** Agent responsible for execution (may differ from owner) */
  assignedAgentId: string;
  objective: string;
  expectedOutput: WorkOrderExpectedOutput;
  boostersRequested: WorkOrderBoosterRequest[];
  riskLevel: WorkOrderRiskLevel;
  approvalGates: WorkOrderApprovalGate[];
  successMetric: WorkOrderSuccessMetric;
  nextAction: WorkOrderNextAction;
  /** Structured business value this work order is expected to deliver */
  businessValue: WorkOrderBusinessValue;
  status: WorkOrderStatus;
  // -- Provenance --
  createdByType: WorkOrderCreatedByType;
  createdById: string;
  requestedById?: string;
  createdAt: string;
}

export interface VentureWorkOrder {
  id: string;
  type: "venture";
  title: string;
  /** Agent accountable for the venture outcome */
  ownerAgentId: string;
  businessIdea: string;
  revenueModel: string;
  profitTarget: ProfitTarget;
  validationTest: WorkOrderValidationTest;
  expectedOutput: WorkOrderExpectedOutput;
  boostersRequested: WorkOrderBoosterRequest[];
  budgetRequested: WorkOrderBudget;
  approvalGates: WorkOrderApprovalGate[];
  promotionOpportunity: WorkOrderPromotionOpportunity;
  successMetric: WorkOrderSuccessMetric;
  nextAction: WorkOrderNextAction;
  /** Structured business value this venture is expected to deliver */
  businessValue: WorkOrderBusinessValue;
  status: WorkOrderStatus;
  // -- Provenance --
  createdByType: WorkOrderCreatedByType;
  createdById: string;
  requestedById?: string;
  createdAt: string;
}

export type WorkOrder = MissionWorkOrder | VentureWorkOrder;

// ---------------------------------------------------------------------------
// Forbidden live-execution field names
// ---------------------------------------------------------------------------

const LIVE_EXECUTION_FIELDS = [
  "executeNow",
  "liveMode",
  "runtimeDispatch",
  "externalWrite",
  "publishNow",
  "sendNow",
  "deployNow",
] as const;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function issue(
  code: string,
  message: string,
  severity: WorkOrderValidationSeverity = "error",
  path?: string,
): WorkOrderValidationIssue {
  const result: WorkOrderValidationIssue = { code, message, severity };
  if (path !== undefined) result.path = path;
  return result;
}

// ---------------------------------------------------------------------------
// Public: live-execution guard
// ---------------------------------------------------------------------------

/**
 * Returns true if the object contains any field that implies live/runtime
 * execution. Work orders are planning objects — these fields are forbidden.
 */
export function hasLiveExecutionFields(
  workOrder: Record<string, unknown>,
): boolean {
  return LIVE_EXECUTION_FIELDS.some((field) => field in workOrder);
}

// ---------------------------------------------------------------------------
// Public: booster request validation
// ---------------------------------------------------------------------------

export function validateWorkOrderBoosterRequests(
  boostersRequested: unknown[],
): WorkOrderValidationIssue[] {
  const issues: WorkOrderValidationIssue[] = [];

  for (let i = 0; i < boostersRequested.length; i++) {
    const b = boostersRequested[i] as Record<string, unknown> | null;
    const prefix = `boostersRequested[${i}]`;

    if (!b || typeof b !== "object") {
      issues.push(issue("invalid_booster_request", `Booster request at index ${i} is not an object`, "error", prefix));
      continue;
    }

    if (!b.boosterId && !b.boosterType) {
      issues.push(issue("invalid_booster_request", `Booster request at index ${i} must specify boosterId or boosterType`, "error", prefix));
    }
    if (!b.reason) {
      issues.push(issue("invalid_booster_request", `Booster request at index ${i} is missing reason`, "error", prefix));
    }
    if (!b.expectedOutput) {
      issues.push(issue("invalid_booster_request", `Booster request at index ${i} is missing expectedOutput`, "error", prefix));
    }
    if (!b.modelTier) {
      issues.push(issue("invalid_booster_request", `Booster request at index ${i} is missing modelTier`, "error", prefix));
    }
    if (!b.costTier) {
      issues.push(issue("invalid_booster_request", `Booster request at index ${i} is missing costTier`, "error", prefix));
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Public: mission work order validation
// ---------------------------------------------------------------------------

export function validateMissionWorkOrder(
  workOrder: Record<string, unknown>,
): WorkOrderValidationResult {
  const issues: WorkOrderValidationIssue[] = [];

  // Live-execution guard
  if (hasLiveExecutionFields(workOrder)) {
    issues.push(issue("live_execution_field_forbidden", "Work orders must not contain live-execution fields"));
  }

  // Required scalars
  if (!workOrder.id) issues.push(issue("missing_id", "Mission work order is missing id"));
  if (!workOrder.title) issues.push(issue("missing_title", "Mission work order is missing title"));
  if (!workOrder.ownerAgentId) issues.push(issue("missing_owner_agent", "Mission work order is missing ownerAgentId"));
  if (!workOrder.assignedAgentId) issues.push(issue("missing_agent", "Mission work order is missing assignedAgentId"));
  if (!workOrder.objective) issues.push(issue("missing_objective", "Mission work order is missing objective"));

  // Provenance
  if (!workOrder.createdByType) issues.push(issue("missing_created_by_type", "Work order is missing createdByType"));
  if (!workOrder.createdById) issues.push(issue("missing_created_by_id", "Work order is missing createdById"));

  // Expected output
  const eo = workOrder.expectedOutput as Record<string, unknown> | undefined;
  if (!eo || !eo.description || !eo.outputType) {
    issues.push(issue("missing_expected_output", "Mission work order must have a concrete expectedOutput with description and outputType"));
  }

  // Next action
  const na = workOrder.nextAction as Record<string, unknown> | undefined;
  if (!na || !na.description || !na.actor) {
    issues.push(issue("missing_next_action", "Mission work order must have a nextAction with description and actor"));
  }

  // Success metric
  const sm = workOrder.successMetric as Record<string, unknown> | undefined;
  if (!sm || !sm.description) {
    issues.push(issue("missing_success_metric", "Mission work order must have a successMetric with a description"));
  }

  // Business value must be structured
  const bv = workOrder.businessValue;
  if (!bv || typeof bv !== "object" || typeof (bv as Record<string, unknown>).valueType !== "string") {
    issues.push(issue("invalid_business_value", "businessValue must be a structured object with at least a valueType"));
  }

  // Risk-level approval gate rule
  const riskLevel = workOrder.riskLevel as string | undefined;
  const gates = workOrder.approvalGates as unknown[] | undefined;
  if ((riskLevel === "high" || riskLevel === "critical") && (!gates || gates.length === 0)) {
    issues.push(issue("risky_work_order_requires_approval", `Risk level "${riskLevel}" requires at least one approval gate`));
  }

  // Booster requests
  const boosters = workOrder.boostersRequested as unknown[] | undefined;
  if (Array.isArray(boosters) && boosters.length > 0) {
    issues.push(...validateWorkOrderBoosterRequests(boosters));
  }

  return { valid: issues.filter((i) => i.severity === "error").length === 0, issues };
}

// ---------------------------------------------------------------------------
// Public: venture work order validation
// ---------------------------------------------------------------------------

export function validateVentureWorkOrder(
  workOrder: Record<string, unknown>,
): WorkOrderValidationResult {
  const issues: WorkOrderValidationIssue[] = [];

  // Live-execution guard
  if (hasLiveExecutionFields(workOrder)) {
    issues.push(issue("live_execution_field_forbidden", "Work orders must not contain live-execution fields"));
  }

  // Required scalars
  if (!workOrder.id) issues.push(issue("missing_id", "Venture work order is missing id"));
  if (!workOrder.title) issues.push(issue("missing_title", "Venture work order is missing title"));
  if (!workOrder.ownerAgentId) issues.push(issue("missing_owner_agent", "Venture work order is missing ownerAgentId"));

  // Provenance
  if (!workOrder.createdByType) issues.push(issue("missing_created_by_type", "Work order is missing createdByType"));
  if (!workOrder.createdById) issues.push(issue("missing_created_by_id", "Work order is missing createdById"));

  // Venture-specific required fields
  if (!workOrder.businessIdea) {
    issues.push(issue("missing_objective", "Venture work order is missing businessIdea"));
  }
  if (!workOrder.revenueModel) {
    issues.push(issue("missing_revenue_model", "Venture work order is missing revenueModel"));
  }
  if (workOrder.profitTarget === undefined || workOrder.profitTarget === null) {
    issues.push(issue("missing_profit_target", "Venture work order is missing profitTarget"));
  }

  // Validation test — a venture must never be valid with only an idea and no test
  const vt = workOrder.validationTest as Record<string, unknown> | undefined;
  if (!vt || !vt.description || !vt.evaluationMethod) {
    issues.push(issue("missing_validation_test", "Venture work order must include a validationTest with description and evaluationMethod"));
  }

  // Revenue-type venture must have profitTarget and validationTest
  const bv = workOrder.businessValue as Record<string, unknown> | undefined;
  if (bv && bv.valueType === "revenue") {
    if (workOrder.profitTarget === undefined || workOrder.profitTarget === null) {
      // Already caught above, but re-check for revenue-specific rule
      if (!issues.some((i) => i.code === "missing_profit_target")) {
        issues.push(issue("missing_profit_target", "Revenue-type venture must include profitTarget"));
      }
    }
    if (!vt || !vt.description || !vt.evaluationMethod) {
      if (!issues.some((i) => i.code === "missing_validation_test")) {
        issues.push(issue("missing_validation_test", "Revenue-type venture must include validationTest"));
      }
    }
  }

  // Business value must be structured
  if (!bv || typeof bv !== "object" || typeof bv.valueType !== "string") {
    issues.push(issue("invalid_business_value", "businessValue must be a structured object with at least a valueType"));
  }

  // Expected output
  const eo = workOrder.expectedOutput as Record<string, unknown> | undefined;
  if (!eo || !eo.description || !eo.outputType) {
    issues.push(issue("missing_expected_output", "Venture work order must have a concrete expectedOutput with description and outputType"));
  }

  // Next action
  const na = workOrder.nextAction as Record<string, unknown> | undefined;
  if (!na || !na.description || !na.actor) {
    issues.push(issue("missing_next_action", "Venture work order must have a nextAction with description and actor"));
  }

  // Success metric
  const sm = workOrder.successMetric as Record<string, unknown> | undefined;
  if (!sm || !sm.description) {
    issues.push(issue("missing_success_metric", "Venture work order must have a successMetric with a description"));
  }

  // Promotion opportunity validation
  const po = workOrder.promotionOpportunity as Record<string, unknown> | undefined;
  if (po) {
    if (!po.criteria || typeof po.criteria !== "string" || (po.criteria as string).length === 0) {
      issues.push(issue("invalid_promotion_opportunity", "Promotion opportunity must include criteria describing what must be achieved"));
    }
    if (po.targetLevel === undefined || po.targetLevel === null) {
      issues.push(issue("invalid_promotion_opportunity", "Promotion opportunity must include a targetLevel"));
    }
  }

  // Risk-level approval gate rule
  const riskLevel = workOrder.riskLevel as string | undefined;
  const gates = workOrder.approvalGates as unknown[] | undefined;
  if ((riskLevel === "high" || riskLevel === "critical") && (!gates || gates.length === 0)) {
    issues.push(issue("risky_work_order_requires_approval", `Risk level "${riskLevel}" requires at least one approval gate`));
  }

  // Booster requests
  const boosters = workOrder.boostersRequested as unknown[] | undefined;
  if (Array.isArray(boosters) && boosters.length > 0) {
    issues.push(...validateWorkOrderBoosterRequests(boosters));
  }

  return { valid: issues.filter((i) => i.severity === "error").length === 0, issues };
}

// ---------------------------------------------------------------------------
// Public: unified dispatcher
// ---------------------------------------------------------------------------

/**
 * Validates a work order by dispatching to the correct type-specific validator.
 * Returns an error if the type is unknown.
 */
export function validateWorkOrder(
  workOrder: Record<string, unknown>,
): WorkOrderValidationResult {
  const type = workOrder.type as string | undefined;

  if (type === "mission") return validateMissionWorkOrder(workOrder);
  if (type === "venture") return validateVentureWorkOrder(workOrder);

  return {
    valid: false,
    issues: [issue("invalid_type", `Unknown work order type: "${type ?? "(missing)"}"`)],
  };
}
