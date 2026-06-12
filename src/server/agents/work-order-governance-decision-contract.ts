// src/server/agents/work-order-governance-decision-contract.ts

/**
 * Pure TypeScript contract and helpers for Work Order Governance Decision
 * Records within the Oria HQ Agentic Holding OS.
 *
 * A Governance Decision Record is the durable, auditable trace of a rendered
 * governance decision (the outcome of applying a CEO review to a Governance
 * Bundle). It is a PLANNING/AUDIT artifact only:
 *   - It records that a decision was made (approved_to_plan, rejected, …).
 *   - It NEVER authorizes execution. approve_to_plan is planning-only.
 *   - It is distinct from the action ledger, which records executed actions.
 *
 * All helpers are pure: no I/O, no writes, no mutations, no side-effects.
 * Persistence is handled separately by the governance-decision repository.
 */

import type { WorkOrderGovernanceBundle } from "./work-order-governance-bundle";
import { hasForbiddenGovernanceBundleFields } from "./work-order-governance-bundle";

// ---------------------------------------------------------------------------
// Outcome type
// ---------------------------------------------------------------------------

/**
 * The terminal governance outcomes that warrant a decision record. These mirror
 * the decided bundle statuses; "preview" and "awaiting_review" are not
 * decisions and never produce a record.
 */
export type WorkOrderGovernanceDecisionOutcome =
  | "approved_to_plan"
  | "changes_requested"
  | "rejected"
  | "more_info_requested"
  | "blocked_execution_request";

const VALID_DECISION_OUTCOMES: ReadonlySet<string> = new Set([
  "approved_to_plan",
  "changes_requested",
  "rejected",
  "more_info_requested",
  "blocked_execution_request",
]);

// ---------------------------------------------------------------------------
// Record contract
// ---------------------------------------------------------------------------

export interface WorkOrderGovernanceDecisionRecord {
  id: string;
  workspaceId: string;
  workOrderId: string;
  bundleId: string;
  /** The rendered governance outcome. */
  outcome: WorkOrderGovernanceDecisionOutcome;
  /** The review session status at decision time (mirrors outcome). */
  sessionStatus: string;
  /** The review id, when a formal review backed the decision (absent for blocks). */
  reviewId?: string;
  /** The review decision, when present (e.g. approve_to_plan, reject). */
  reviewDecision?: string;
  reviewerId: string;
  reviewerRole: string;
  /** Always true — the human rendered this decision on the loop. */
  humanOnTheLoop: true;
  /** Always true — a governance decision never authorizes live execution. */
  noExecutionAuthorized: true;
  /** ISO 8601 timestamp of when the decision was rendered. */
  decidedAt: string;
  /** ISO 8601 timestamp of when the record was created. */
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Validation result types
// ---------------------------------------------------------------------------

export type WorkOrderGovernanceDecisionIssueSeverity = "error" | "warning";

export interface WorkOrderGovernanceDecisionIssue {
  code: string;
  message: string;
  path?: string;
  severity: WorkOrderGovernanceDecisionIssueSeverity;
}

export interface WorkOrderGovernanceDecisionValidationResult {
  valid: boolean;
  issues: WorkOrderGovernanceDecisionIssue[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function decisionIssue(
  code: string,
  message: string,
  severity: WorkOrderGovernanceDecisionIssueSeverity = "error",
  path?: string,
): WorkOrderGovernanceDecisionIssue {
  const result: WorkOrderGovernanceDecisionIssue = { code, message, severity };
  if (path !== undefined) result.path = path;
  return result;
}

// ---------------------------------------------------------------------------
// Public: isGovernanceDecisionOutcome
// ---------------------------------------------------------------------------

/**
 * Returns true if the given bundle status is a decided outcome that warrants a
 * decision record. "preview" and "awaiting_review" return false.
 *
 * This function is pure — it does not mutate its input.
 */
export function isGovernanceDecisionOutcome(
  status: string,
): status is WorkOrderGovernanceDecisionOutcome {
  return VALID_DECISION_OUTCOMES.has(status);
}

// ---------------------------------------------------------------------------
// Public: buildGovernanceDecisionRecord
// ---------------------------------------------------------------------------

/**
 * Derives a Governance Decision Record from a decided Governance Bundle.
 *
 * The bundle's status becomes the outcome. For non-decided bundles
 * ("preview"/"awaiting_review"/"invalid") the produced record carries that
 * status as outcome and will be rejected by validateGovernanceDecisionRecord —
 * callers should only persist records that validate.
 *
 * This function is pure — it does not mutate its input.
 */
export function buildGovernanceDecisionRecord(input: {
  bundle: WorkOrderGovernanceBundle;
  workspaceId: string;
  reviewerId?: string;
  decidedAt?: string;
  now?: number;
}): WorkOrderGovernanceDecisionRecord {
  const { bundle } = input;
  const now = input.now ?? Date.now();
  const decidedAt = input.decidedAt ?? new Date(now).toISOString();
  const id = `govdec_${now}_${Math.random().toString(36).substring(2, 9)}`;

  const record: WorkOrderGovernanceDecisionRecord = {
    id,
    workspaceId: input.workspaceId,
    workOrderId: bundle.workOrder.id,
    bundleId: bundle.id,
    outcome: bundle.status as WorkOrderGovernanceDecisionOutcome,
    sessionStatus: bundle.reviewSession.status,
    reviewerId: input.reviewerId ?? bundle.reviewSession.reviewerId,
    reviewerRole: bundle.reviewSession.reviewerRole,
    humanOnTheLoop: true,
    noExecutionAuthorized: true,
    decidedAt,
    createdAt: new Date(now).toISOString(),
  };

  if (bundle.review !== undefined) {
    record.reviewId = bundle.review.id;
    record.reviewDecision = bundle.review.decision;
  }

  return record;
}

// ---------------------------------------------------------------------------
// Public: validateGovernanceDecisionRecord
// ---------------------------------------------------------------------------

/**
 * Validates a Governance Decision Record for structural correctness and safety
 * invariants. Enforces a decided outcome, the Human-on-the-Loop /
 * no-execution flags, required identifiers, and the absence of forbidden
 * live-execution fields.
 *
 * This function is pure — it does not mutate its input.
 */
export function validateGovernanceDecisionRecord(
  record: WorkOrderGovernanceDecisionRecord,
): WorkOrderGovernanceDecisionValidationResult {
  const issues: WorkOrderGovernanceDecisionIssue[] = [];

  if (!record.id) issues.push(decisionIssue("missing_id", "Decision record is missing id"));
  if (!record.workspaceId) {
    issues.push(decisionIssue("missing_workspace_id", "Decision record is missing workspaceId"));
  }
  if (!record.workOrderId) {
    issues.push(decisionIssue("missing_work_order_id", "Decision record is missing workOrderId"));
  }
  if (!record.bundleId) {
    issues.push(decisionIssue("missing_bundle_id", "Decision record is missing bundleId"));
  }
  if (!record.reviewerId) {
    issues.push(decisionIssue("missing_reviewer", "Decision record is missing reviewerId"));
  }
  if (!record.decidedAt) {
    issues.push(decisionIssue("missing_decided_at", "Decision record is missing decidedAt"));
  }

  if (!isGovernanceDecisionOutcome(record.outcome)) {
    issues.push(decisionIssue(
      "invalid_outcome",
      `"${record.outcome}" is not a decided governance outcome — only rendered decisions are recordable`,
      "error",
      "outcome",
    ));
  }

  if (record.humanOnTheLoop !== true) {
    issues.push(decisionIssue(
      "human_on_the_loop_required",
      "Decision record humanOnTheLoop must be true",
    ));
  }

  if (record.noExecutionAuthorized !== true) {
    issues.push(decisionIssue(
      "no_execution_authorized_required",
      "Decision record noExecutionAuthorized must be true — a governance decision never authorizes execution",
    ));
  }

  if (hasForbiddenGovernanceBundleFields(record)) {
    issues.push(decisionIssue(
      "forbidden_execution_field",
      "Decision record contains forbidden live-execution fields",
    ));
  }

  return {
    valid: issues.filter((i) => i.severity === "error").length === 0,
    issues,
  };
}
