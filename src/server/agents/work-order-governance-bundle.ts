// src/server/agents/work-order-governance-bundle.ts

/**
 * Pure TypeScript contracts and validation helpers for Work Order Governance
 * Bundles within the Orya HQ Agentic Holding OS.
 *
 * A Governance Bundle is an integrity-checked container that assembles and
 * cross-validates a Work Order, its Autonomy Envelope, a Review Session, and
 * an optional Review into a single coherent governance object.
 *
 * Key invariants enforced here:
 *   - humanOnTheLoop is always true.
 *   - noExecutionAuthorized is always true.
 *   - approve_to_plan is planning only — it never authorizes execution.
 *   - All workOrderId references across artifacts must be consistent.
 *   - Session statuses that require a formal decision must have a matching review.
 *   - No live-execution fields are permitted anywhere in the bundle.
 *
 * Design decision — blocked_execution_request:
 *   "blocked_execution_request" is a ReviewSession safety state, set by the
 *   interpreter when it detects forbidden execution language in a review message.
 *   It is NOT a WorkOrderReviewDecision and it is NOT an execution authorization.
 *   A session in this state is valid without a WorkOrderReview object, because
 *   the interpreter blocked the request before a formal review could be created.
 *   The bundle enforces humanOnTheLoop: true and noExecutionAuthorized: true
 *   regardless of session status, and forbidden execution fields are always
 *   scanned recursively across the entire bundle.
 *
 * All helpers are pure: no I/O, no writes, no mutations, no side-effects.
 */

import type { WorkOrder, MissionWorkOrder } from "./work-order-contract";
import { validateWorkOrder } from "./work-order-contract";
import type { WorkOrderAutonomyEnvelope } from "./work-order-autonomy-envelope-contract";
import { validateWorkOrderAutonomyEnvelope } from "./work-order-autonomy-envelope-contract";
import type { WorkOrderReviewSession } from "./work-order-review-session-contract";
import { validateWorkOrderReviewSession } from "./work-order-review-session-contract";
import type { WorkOrderReview } from "./work-order-review-contract";
import { validateWorkOrderReview } from "./work-order-review-contract";

// ---------------------------------------------------------------------------
// Status type
// ---------------------------------------------------------------------------

/**
 * The governance state of the bundle, derived from the review session status.
 * "invalid" is used when the session status is terminal/expired or the bundle
 * cannot be given a valid governance state.
 */
export type WorkOrderGovernanceBundleStatus =
  | "preview"
  | "awaiting_review"
  | "approved_to_plan"
  | "changes_requested"
  | "rejected"
  | "more_info_requested"
  | "blocked_execution_request"
  | "invalid";

// ---------------------------------------------------------------------------
// Issue & Validation types
// ---------------------------------------------------------------------------

export type WorkOrderGovernanceBundleIssueSeverity = "error" | "warning";

export interface WorkOrderGovernanceBundleIssue {
  code: string;
  message: string;
  path?: string;
  severity: WorkOrderGovernanceBundleIssueSeverity;
}

export interface WorkOrderGovernanceBundleValidationResult {
  valid: boolean;
  issues: WorkOrderGovernanceBundleIssue[];
}

// ---------------------------------------------------------------------------
// Summary type
// ---------------------------------------------------------------------------

export interface WorkOrderGovernanceBundleSummary {
  workOrderId: string;
  workOrderTitle?: string;
  workOrderType?: string;
  agentId: string;
  autonomyLevel: string;
  sessionStatus: string;
  reviewDecision?: string;
  allowedAutonomousWork: string[];
  approvalRequiredActions: string[];
  blockedActions: string[];
  humanOnTheLoop: true;
  noExecutionAuthorized: true;
  planningOnlyNote: string;
  text: string;
}

// ---------------------------------------------------------------------------
// Input & Bundle types
// ---------------------------------------------------------------------------

export interface WorkOrderGovernanceBundleInput {
  workOrder: WorkOrder;
  autonomyEnvelope: WorkOrderAutonomyEnvelope;
  reviewSession: WorkOrderReviewSession;
  review?: WorkOrderReview;
}

export interface WorkOrderGovernanceBundle {
  id: string;
  workOrder: WorkOrder;
  autonomyEnvelope: WorkOrderAutonomyEnvelope;
  reviewSession: WorkOrderReviewSession;
  review?: WorkOrderReview;
  humanOnTheLoop: true;
  noExecutionAuthorized: true;
  createdAt: string;
  status: WorkOrderGovernanceBundleStatus;
}

// ---------------------------------------------------------------------------
// Constants
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

/**
 * Session statuses that require a WorkOrderReview object to be present.
 * These are statuses produced by a formal review decision (WorkOrderReviewDecision).
 *
 * "blocked_execution_request" is intentionally excluded: it is set by the
 * interpreter when it detects forbidden execution language before a formal
 * review is created. It is a safety state, not a review outcome, and the
 * WorkOrderReview contract does not define "blocked_execution_request" as a
 * valid WorkOrderReviewDecision. A bundle with this session status is valid
 * without a review — as long as humanOnTheLoop and noExecutionAuthorized hold
 * and no forbidden execution fields are present.
 */
const SESSION_STATUSES_REQUIRING_REVIEW = new Set([
  "approved_to_plan",
  "changes_requested",
  "rejected",
  "more_info_requested",
]);

/** Maps review session status strings to bundle status values. */
const SESSION_TO_BUNDLE_STATUS: Record<string, WorkOrderGovernanceBundleStatus> = {
  previewed: "preview",
  awaiting_review: "awaiting_review",
  approved_to_plan: "approved_to_plan",
  changes_requested: "changes_requested",
  rejected: "rejected",
  more_info_requested: "more_info_requested",
  blocked_execution_request: "blocked_execution_request",
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function bundleIssue(
  code: string,
  message: string,
  severity: WorkOrderGovernanceBundleIssueSeverity = "error",
  path?: string,
): WorkOrderGovernanceBundleIssue {
  const result: WorkOrderGovernanceBundleIssue = { code, message, severity };
  if (path !== undefined) result.path = path;
  return result;
}

// ---------------------------------------------------------------------------
// Public: hasForbiddenGovernanceBundleFields
// ---------------------------------------------------------------------------

/**
 * Returns true if the input (or any nested value) contains a field name that
 * implies live/runtime execution. Scans recursively through nested objects
 * and arrays.
 *
 * This function is pure — it does not mutate the input.
 */
export function hasForbiddenGovernanceBundleFields(input: unknown): boolean {
  if (!input || typeof input !== "object") return false;
  if (Array.isArray(input)) return input.some(hasForbiddenGovernanceBundleFields);

  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if ((LIVE_EXECUTION_FIELDS as readonly string[]).includes(key)) return true;
    if (hasForbiddenGovernanceBundleFields(value)) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Public: mapReviewDecisionToSessionStatus
// ---------------------------------------------------------------------------

/**
 * Maps a WorkOrderReviewDecision string to the expected review session status.
 * Returns null if the decision string is not a recognized WorkOrderReviewDecision.
 *
 * Only the four formal WorkOrderReviewDecision values are mapped:
 *   approve_to_plan    → approved_to_plan
 *   request_changes    → changes_requested
 *   reject             → rejected
 *   ask_for_more_info  → more_info_requested
 *
 * "blocked_execution_request" is intentionally NOT mapped here because it is
 * not a WorkOrderReviewDecision — it is a session-level safety state set by
 * the interpreter. Passing "blocked_execution_request" returns null.
 *
 * This function is pure — it does not mutate the input.
 */
export function mapReviewDecisionToSessionStatus(decision: string): string | null {
  const DECISION_TO_STATUS: Record<string, string> = {
    approve_to_plan: "approved_to_plan",
    request_changes: "changes_requested",
    reject: "rejected",
    ask_for_more_info: "more_info_requested",
  };
  return DECISION_TO_STATUS[decision] ?? null;
}

// ---------------------------------------------------------------------------
// Public: isReviewConsistentWithSession
// ---------------------------------------------------------------------------

/**
 * Returns true if the review's decision maps to the session's current status.
 *
 * This is the key cross-artifact consistency check between the review object
 * and the review session. A review with decision "approve_to_plan" must only
 * appear in a session with status "approved_to_plan".
 *
 * This function is pure — it does not mutate the input.
 */
export function isReviewConsistentWithSession(
  review: WorkOrderReview,
  session: WorkOrderReviewSession,
): boolean {
  const expectedStatus = mapReviewDecisionToSessionStatus(review.decision);
  return expectedStatus === session.status;
}

// ---------------------------------------------------------------------------
// Public: isEnvelopeConsistentWithWorkOrder
// ---------------------------------------------------------------------------

/**
 * Returns true if the autonomy envelope's agentId matches the work order's
 * ownerAgentId (all work order types) or assignedAgentId (mission work orders
 * only, where the executing agent may differ from the owner).
 *
 * This function is pure — it does not mutate the input.
 */
export function isEnvelopeConsistentWithWorkOrder(
  envelope: WorkOrderAutonomyEnvelope,
  workOrder: WorkOrder,
): boolean {
  if (envelope.agentId === workOrder.ownerAgentId) return true;
  if (workOrder.type === "mission") {
    return envelope.agentId === (workOrder as MissionWorkOrder).assignedAgentId;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Public: assertPlanningOnlyStatusSemantics
// ---------------------------------------------------------------------------

/**
 * Validates that the bundle does not carry execution-authorization semantics.
 * Enforces:
 *   - humanOnTheLoop: true
 *   - noExecutionAuthorized: true
 *   - No "approveToExecute" or "executionAuthorized" fields present
 *
 * approve_to_plan advances planning only — it must never be treated as
 * authorize-to-execute.
 *
 * This function is pure — it does not mutate the input.
 */
export function assertPlanningOnlyStatusSemantics(
  bundle: WorkOrderGovernanceBundle,
): WorkOrderGovernanceBundleIssue[] {
  const issues: WorkOrderGovernanceBundleIssue[] = [];

  if (bundle.humanOnTheLoop !== true) {
    issues.push(bundleIssue(
      "planning_only_semantics_violated",
      "Bundle humanOnTheLoop must be true — Human-on-the-Loop is non-negotiable",
    ));
  }

  if (bundle.noExecutionAuthorized !== true) {
    issues.push(bundleIssue(
      "planning_only_semantics_violated",
      "Bundle noExecutionAuthorized must be true — approve_to_plan is planning only, not execution",
    ));
  }

  const bundleRecord = bundle as unknown as Record<string, unknown>;
  if ("approveToExecute" in bundleRecord) {
    issues.push(bundleIssue(
      "forbidden_execution_authorization",
      "Bundle must not contain approveToExecute — this field does not exist in the governance model",
    ));
  }
  if ("executionAuthorized" in bundleRecord) {
    issues.push(bundleIssue(
      "forbidden_execution_authorization",
      "Bundle must not contain executionAuthorized — no execution is ever authorized by a governance bundle",
    ));
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Public: buildWorkOrderGovernanceBundle
// ---------------------------------------------------------------------------

/**
 * Assembles a Work Order Governance Bundle from the provided input artifacts.
 *
 * The builder does not validate cross-artifact consistency. Call
 * validateWorkOrderGovernanceBundle after building to run full integrity
 * checks.
 *
 * The bundle status is derived from the review session status. Expired and
 * cancelled session statuses produce "invalid" as the bundle status.
 *
 * This function is pure — it does not mutate the input.
 */
export function buildWorkOrderGovernanceBundle(
  input: WorkOrderGovernanceBundleInput,
): WorkOrderGovernanceBundle {
  const bundleId = `bundle_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const bundleStatus: WorkOrderGovernanceBundleStatus =
    SESSION_TO_BUNDLE_STATUS[input.reviewSession.status] ?? "invalid";

  const bundle: WorkOrderGovernanceBundle = {
    id: bundleId,
    workOrder: input.workOrder,
    autonomyEnvelope: input.autonomyEnvelope,
    reviewSession: input.reviewSession,
    humanOnTheLoop: true,
    noExecutionAuthorized: true,
    createdAt: new Date().toISOString(),
    status: bundleStatus,
  };

  if (input.review !== undefined) {
    bundle.review = input.review;
  }

  return bundle;
}

// ---------------------------------------------------------------------------
// Public: validateWorkOrderGovernanceBundle
// ---------------------------------------------------------------------------

/**
 * Validates a Work Order Governance Bundle for structural correctness,
 * cross-artifact consistency, and safety invariants.
 *
 * Validation order:
 *   1. Per-artifact validation using each artifact's own validator.
 *   2. Cross-artifact workOrderId consistency.
 *   3. reviewSession.autonomyEnvelopeId consistency.
 *   4. reviewSession.currentReviewId consistency (including: set but no review present).
 *   5. Session statuses that require a formal review must have one.
 *      Note: "blocked_execution_request" is a safety state, not a review outcome;
 *      it does not require a WorkOrderReview. See module comment for rationale.
 *   6. Review decision maps correctly to session status.
 *   7. Envelope agentId matches work order owner or assigned agent.
 *   8. No forbidden live-execution fields anywhere in the bundle.
 *   9. Bundle humanOnTheLoop enforcement.
 *  10. Bundle noExecutionAuthorized enforcement.
 *  11. Planning-only semantics via assertPlanningOnlyStatusSemantics.
 *
 * This function is pure — it does not mutate the input.
 */
export function validateWorkOrderGovernanceBundle(
  bundle: WorkOrderGovernanceBundle,
): WorkOrderGovernanceBundleValidationResult {
  const issues: WorkOrderGovernanceBundleIssue[] = [];

  // ---- 1. Per-artifact validation ----

  const workOrderResult = validateWorkOrder(
    bundle.workOrder as unknown as Record<string, unknown>,
  );
  for (const i of workOrderResult.issues) {
    if (i.severity === "error") {
      issues.push(bundleIssue(
        `workOrder.${i.code}`,
        `WorkOrder: ${i.message}`,
        "error",
        `workOrder${i.path ? `.${i.path}` : ""}`,
      ));
    }
  }

  const envelopeResult = validateWorkOrderAutonomyEnvelope(
    bundle.autonomyEnvelope as unknown as Record<string, unknown>,
  );
  for (const i of envelopeResult.issues) {
    if (i.severity === "error") {
      issues.push(bundleIssue(
        `envelope.${i.code}`,
        `Envelope: ${i.message}`,
        "error",
        `autonomyEnvelope${i.path ? `.${i.path}` : ""}`,
      ));
    }
  }

  const sessionResult = validateWorkOrderReviewSession(
    bundle.reviewSession as unknown as Record<string, unknown>,
  );
  for (const i of sessionResult.issues) {
    if (i.severity === "error") {
      issues.push(bundleIssue(
        `session.${i.code}`,
        `Session: ${i.message}`,
        "error",
        `reviewSession${i.path ? `.${i.path}` : ""}`,
      ));
    }
  }

  if (bundle.review !== undefined) {
    const reviewResult = validateWorkOrderReview(
      bundle.review as unknown as Record<string, unknown>,
    );
    for (const i of reviewResult.issues) {
      if (i.severity === "error") {
        issues.push(bundleIssue(
          `review.${i.code}`,
          `Review: ${i.message}`,
          "error",
          `review${i.path ? `.${i.path}` : ""}`,
        ));
      }
    }
  }

  // ---- 2. Cross-artifact: workOrderId consistency ----

  const workOrderId = bundle.workOrder.id;

  if (bundle.autonomyEnvelope.workOrderId !== workOrderId) {
    issues.push(bundleIssue(
      "workorder_id_mismatch_envelope",
      `autonomyEnvelope.workOrderId "${bundle.autonomyEnvelope.workOrderId}" does not match workOrder.id "${workOrderId}"`,
      "error",
      "autonomyEnvelope.workOrderId",
    ));
  }

  if (bundle.reviewSession.workOrderId !== workOrderId) {
    issues.push(bundleIssue(
      "workorder_id_mismatch_session",
      `reviewSession.workOrderId "${bundle.reviewSession.workOrderId}" does not match workOrder.id "${workOrderId}"`,
      "error",
      "reviewSession.workOrderId",
    ));
  }

  if (bundle.review !== undefined && bundle.review.workOrderId !== workOrderId) {
    issues.push(bundleIssue(
      "workorder_id_mismatch_review",
      `review.workOrderId "${bundle.review.workOrderId}" does not match workOrder.id "${workOrderId}"`,
      "error",
      "review.workOrderId",
    ));
  }

  // ---- 3. reviewSession.autonomyEnvelopeId must match autonomyEnvelope.id when set ----

  if (
    bundle.reviewSession.autonomyEnvelopeId !== undefined &&
    bundle.reviewSession.autonomyEnvelopeId !== bundle.autonomyEnvelope.id
  ) {
    issues.push(bundleIssue(
      "autonomy_envelope_id_mismatch",
      `reviewSession.autonomyEnvelopeId "${bundle.reviewSession.autonomyEnvelopeId}" does not match autonomyEnvelope.id "${bundle.autonomyEnvelope.id}"`,
      "error",
      "reviewSession.autonomyEnvelopeId",
    ));
  }

  // ---- 4. reviewSession.currentReviewId consistency ----
  //
  // Rule A: if currentReviewId is set, a review object must be present.
  //         A dangling reference (set pointer, no review) is always invalid.
  // Rule B: if a review is present, currentReviewId must equal review.id.

  if (bundle.reviewSession.currentReviewId !== undefined && bundle.review === undefined) {
    issues.push(bundleIssue(
      "current_review_id_without_review",
      `reviewSession.currentReviewId is set to "${bundle.reviewSession.currentReviewId}" but no review object is present in the bundle`,
      "error",
      "reviewSession.currentReviewId",
    ));
  }

  if (bundle.review !== undefined) {
    if (bundle.reviewSession.currentReviewId !== bundle.review.id) {
      issues.push(bundleIssue(
        "current_review_id_mismatch",
        `reviewSession.currentReviewId "${bundle.reviewSession.currentReviewId ?? "(not set)"}" does not match review.id "${bundle.review.id}"`,
        "error",
        "reviewSession.currentReviewId",
      ));
    }
  }

  // ---- 5. Terminal session statuses require a review ----

  const sessionStatus = bundle.reviewSession.status;
  if (SESSION_STATUSES_REQUIRING_REVIEW.has(sessionStatus) && bundle.review === undefined) {
    issues.push(bundleIssue(
      "review_required_for_terminal_session",
      `Session status "${sessionStatus}" requires a review object to be present in the bundle`,
      "error",
      "review",
    ));
  }

  // ---- 6. review.decision must map correctly to session.status ----

  if (bundle.review !== undefined) {
    const expectedSessionStatus = mapReviewDecisionToSessionStatus(bundle.review.decision);
    if (expectedSessionStatus !== null && expectedSessionStatus !== sessionStatus) {
      issues.push(bundleIssue(
        "review_decision_session_status_mismatch",
        `review.decision "${bundle.review.decision}" maps to session status "${expectedSessionStatus}" but reviewSession.status is "${sessionStatus}"`,
        "error",
        "review.decision",
      ));
    }
  }

  // ---- 7. envelope.agentId must match workOrder owner or assigned agent ----

  if (!isEnvelopeConsistentWithWorkOrder(bundle.autonomyEnvelope, bundle.workOrder)) {
    const ownerAgentId = bundle.workOrder.ownerAgentId;
    const assignedAgentId =
      bundle.workOrder.type === "mission"
        ? (bundle.workOrder as MissionWorkOrder).assignedAgentId
        : undefined;
    issues.push(bundleIssue(
      "envelope_agent_id_mismatch",
      `autonomyEnvelope.agentId "${bundle.autonomyEnvelope.agentId}" does not match workOrder.ownerAgentId "${ownerAgentId}" or assignedAgentId "${assignedAgentId ?? "N/A"}"`,
      "error",
      "autonomyEnvelope.agentId",
    ));
  }

  // ---- 8. Forbidden live-execution fields anywhere in the bundle ----

  if (hasForbiddenGovernanceBundleFields(bundle)) {
    issues.push(bundleIssue(
      "forbidden_execution_field",
      "Bundle contains forbidden live-execution fields — governance bundles are planning objects, not runtime commands",
      "error",
    ));
  }

  // ---- 9. Bundle-level humanOnTheLoop enforcement ----

  if (bundle.humanOnTheLoop !== true) {
    issues.push(bundleIssue(
      "human_on_the_loop_required",
      "Bundle humanOnTheLoop must be true",
      "error",
    ));
  }

  // ---- 10. Bundle-level noExecutionAuthorized enforcement ----

  if (bundle.noExecutionAuthorized !== true) {
    issues.push(bundleIssue(
      "no_execution_authorized_required",
      "Bundle noExecutionAuthorized must be true — approve_to_plan is planning only, not execution",
      "error",
    ));
  }

  // ---- 11. Planning-only semantics ----

  const planningIssues = assertPlanningOnlyStatusSemantics(bundle);
  issues.push(...planningIssues);

  return {
    valid: issues.filter((i) => i.severity === "error").length === 0,
    issues,
  };
}

// ---------------------------------------------------------------------------
// Public: createWorkOrderGovernanceBundleSummary
// ---------------------------------------------------------------------------

/**
 * Creates a structured, human-readable summary of the governance bundle.
 *
 * The summary explicitly states:
 *   - Work Order identity, title, and type.
 *   - Agent identity and autonomy level.
 *   - Review session status and review decision.
 *   - Allowed autonomous internal work (green zone).
 *   - Actions requiring human approval (yellow zone).
 *   - Blocked actions (red zone).
 *   - Human-on-the-Loop reminder.
 *   - "Aucune action exécutée" no-execution statement.
 *   - "approve_to_plan is planning only, not execution" note.
 *
 * This function is pure — it does not mutate the input.
 */
export function createWorkOrderGovernanceBundleSummary(
  bundle: WorkOrderGovernanceBundle,
): WorkOrderGovernanceBundleSummary {
  const workOrderId = bundle.workOrder.id;
  const workOrderTitle = (bundle.workOrder as unknown as Record<string, unknown>).title as string | undefined;
  const workOrderType = bundle.workOrder.type;
  const agentId = bundle.autonomyEnvelope.agentId;
  const autonomyLevel = bundle.autonomyEnvelope.autonomyLevel;
  const sessionStatus = bundle.reviewSession.status;
  const reviewDecision = bundle.review?.decision;

  const allowedAutonomousWork = [...(bundle.autonomyEnvelope.allowedAutonomousActions ?? [])];
  const approvalRequiredActions = [...(bundle.autonomyEnvelope.approvalRequiredActions ?? [])];
  const blockedActions = [...(bundle.autonomyEnvelope.blockedActions ?? [])];

  const planningOnlyNote =
    "approve_to_plan is planning only, not execution. No live execution, no runtime dispatch, no external write is authorized.";

  const statusLabels: Record<string, string> = {
    preview: "👀 Previewed",
    awaiting_review: "⏳ Awaiting Review",
    approved_to_plan: "✅ Approved to Plan (planning only — not execution)",
    changes_requested: "🔄 Changes Requested",
    rejected: "❌ Rejected",
    more_info_requested: "❓ More Info Requested",
    blocked_execution_request: "🛑 Blocked Execution Request",
    invalid: "⚠️ Invalid",
  };

  const isBlockedExecution = bundle.status === "blocked_execution_request";

  const lines: string[] = [
    `### 📦 Governance Bundle — Work Order`,
    ...(isBlockedExecution
      ? [
          ``,
          `> ⛔ **Execution request was blocked.** The session reached \`blocked_execution_request\` status.`,
          `> This is a safety state, not a review outcome. No execution was authorized. No action was taken.`,
        ]
      : []
    ),
    ``,
    `#### 📋 Work Order`,
    `- **ID** : \`${workOrderId}\``,
    ...(workOrderTitle ? [`- **Title** : ${workOrderTitle}`] : []),
    ...(workOrderType ? [`- **Type** : ${workOrderType}`] : []),
    ``,
    `#### 🤖 Agent`,
    `- **Agent** : \`${agentId}\``,
    `- **Autonomy Level** : ${autonomyLevel}`,
    ``,
    `#### 📊 Review Session`,
    `- **Bundle Status** : ${statusLabels[bundle.status] ?? bundle.status}`,
    `- **Session Status** : ${sessionStatus}`,
    ...(reviewDecision
      ? [`- **Review Decision** : ${reviewDecision}`]
      : [`- **Review Decision** : (none)`]
    ),
    ``,
    `#### ✅ Allowed Autonomous Internal Work`,
    ...(allowedAutonomousWork.length > 0
      ? allowedAutonomousWork.map((a) => `- 🟢 ${a}`)
      : [`- (none)`]
    ),
    ``,
    `#### 🟡 Actions Requiring Approval`,
    ...(approvalRequiredActions.length > 0
      ? approvalRequiredActions.map((a) => `- 🟡 ${a}`)
      : [`- (none)`]
    ),
    ``,
    `#### 🔴 Blocked Actions`,
    ...(blockedActions.length > 0
      ? blockedActions.map((a) => `- 🔴 ${a}`)
      : [`- (none)`]
    ),
    ``,
    `---`,
    `💡 **Human-on-the-Loop** : This bundle is a governance and planning object only. The human remains on the loop for all decisions.`,
    `🛑 **Aucune action exécutée** — no live execution, no runtime dispatch, no external write has been performed.`,
    `📌 **${planningOnlyNote}**`,
  ];

  return {
    workOrderId,
    workOrderTitle,
    workOrderType,
    agentId,
    autonomyLevel,
    sessionStatus,
    reviewDecision,
    allowedAutonomousWork,
    approvalRequiredActions,
    blockedActions,
    humanOnTheLoop: true,
    noExecutionAuthorized: true,
    planningOnlyNote,
    text: lines.join("\n"),
  };
}
