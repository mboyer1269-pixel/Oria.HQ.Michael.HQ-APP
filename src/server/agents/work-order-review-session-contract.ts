// src/server/agents/work-order-review-session-contract.ts

/**
 * Pure TypeScript contracts and validation helpers for Work Order Review Sessions
 * within the Orya HQ Agentic Holding OS.
 *
 * A Work Order Review Session tracks the lifecycle state of a Work Order
 * as it moves through the human review loop. It captures whether the CEO
 * has previewed, approved, rejected, or requested changes to a Work Order.
 *
 * Important:
 * - Session state is purely for governance and planning.
 * - `approved_to_plan` MUST NOT be interpreted as runtime execution authorization.
 *
 * All helpers are pure: no I/O, no writes, no mutations, no side-effects.
 */

// ---------------------------------------------------------------------------
// Types & Enumerations
// ---------------------------------------------------------------------------

export type WorkOrderReviewSessionStatus =
  | "previewed"
  | "awaiting_review"
  | "approved_to_plan"
  | "changes_requested"
  | "rejected"
  | "more_info_requested"
  | "blocked_execution_request"
  | "expired"
  | "cancelled";

export interface WorkOrderReviewSessionEvent {
  id: string;
  type: string;
  timestamp: string;
  actorId: string;
  metadata?: Record<string, unknown>;
}

export interface WorkOrderReviewSession {
  /** Unique identifier for this session */
  id: string;
  /** The Work Order this session tracks */
  workOrderId: string;
  /** Current state of the human review loop */
  status: WorkOrderReviewSessionStatus;
  /** Identifier of the expected/active reviewer (e.g. userId) */
  reviewerId: string;
  /** Role of the reviewer (e.g. "ceo") */
  reviewerRole: string;
  /** ISO 8601 timestamp of when the session was created */
  createdAt: string;
  /** ISO 8601 timestamp of when the session was last updated */
  updatedAt: string;
  /**
   * Must always be true. Human-on-the-loop is enforced by contract.
   */
  humanOnTheLoop: true;
  /**
   * Must always be true. Sessions track planning states, not runtime dispatch.
   */
  noExecutionAuthorized: true;

  // -- Optional structured fields --

  currentReviewId?: string;
  autonomyEnvelopeId?: string;
  lastDecision?: string;
  lastReason?: string;
  requestedChanges?: unknown[];
  events?: WorkOrderReviewSessionEvent[];
  expiresAt?: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Validation Result Types
// ---------------------------------------------------------------------------

export type WorkOrderReviewSessionValidationSeverity = "error" | "warning";

export interface WorkOrderReviewSessionIssue {
  code: string;
  message: string;
  path?: string;
  severity: WorkOrderReviewSessionValidationSeverity;
}

export interface WorkOrderReviewSessionValidationResult {
  valid: boolean;
  issues: WorkOrderReviewSessionIssue[];
}

// ---------------------------------------------------------------------------
// Static Data
// ---------------------------------------------------------------------------

const VALID_STATUSES: ReadonlySet<string> = new Set([
  "previewed",
  "awaiting_review",
  "approved_to_plan",
  "changes_requested",
  "rejected",
  "more_info_requested",
  "blocked_execution_request",
  "expired",
  "cancelled",
]);

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

function sessionIssue(
  code: string,
  message: string,
  severity: WorkOrderReviewSessionValidationSeverity = "error",
  path?: string
): WorkOrderReviewSessionIssue {
  const result: WorkOrderReviewSessionIssue = { code, message, severity };
  if (path !== undefined) result.path = path;
  return result;
}

// ---------------------------------------------------------------------------
// Public: forbidden field deep scan
// ---------------------------------------------------------------------------

/**
 * Returns true if the input contains any field that implies live/runtime
 * execution. Scans recursively through nested objects and arrays.
 *
 * This function is pure — it does not mutate the input.
 */
export function hasForbiddenReviewSessionFields(input: unknown): boolean {
  if (!input || typeof input !== "object") return false;

  if (Array.isArray(input)) {
    return input.some(hasForbiddenReviewSessionFields);
  }

  for (const [key, value] of Object.entries(input)) {
    if ((LIVE_EXECUTION_FIELDS as readonly string[]).includes(key)) {
      return true;
    }
    if (hasForbiddenReviewSessionFields(value)) {
      return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Public: Main validation
// ---------------------------------------------------------------------------

/**
 * Validates a Work Order Review Session.
 *
 * This function is pure — it does not mutate the input.
 */
export function validateWorkOrderReviewSession(
  session: Record<string, unknown>
): WorkOrderReviewSessionValidationResult {
  const issues: WorkOrderReviewSessionIssue[] = [];

  if (!session.id) issues.push(sessionIssue("missing_id", "Session is missing id"));
  if (!session.workOrderId) issues.push(sessionIssue("missing_work_order_id", "Session is missing workOrderId"));
  if (!session.reviewerId) issues.push(sessionIssue("missing_reviewer", "Session is missing reviewerId"));
  if (!session.reviewerRole) issues.push(sessionIssue("missing_reviewer", "Session is missing reviewerRole"));
  
  const status = session.status as string;
  if (!status) {
    issues.push(sessionIssue("missing_status", "Session is missing status"));
  } else if (!VALID_STATUSES.has(status)) {
    issues.push(sessionIssue("invalid_status", `Invalid status: ${status}`));
  }

  if (!session.createdAt) issues.push(sessionIssue("missing_created_at", "Session is missing createdAt"));
  if (!session.updatedAt) issues.push(sessionIssue("missing_updated_at", "Session is missing updatedAt"));

  if (session.humanOnTheLoop !== true) {
    issues.push(sessionIssue("human_on_the_loop_required", "humanOnTheLoop must be true"));
  }

  if (session.noExecutionAuthorized !== true) {
    issues.push(sessionIssue("no_execution_authorized_required", "noExecutionAuthorized must be true"));
  }

  if (hasForbiddenReviewSessionFields(session)) {
    issues.push(sessionIssue("forbidden_execution_field", "Session contains forbidden live execution fields"));
  }

  return {
    valid: issues.filter(i => i.severity === "error").length === 0,
    issues,
  };
}

// ---------------------------------------------------------------------------
// Public: Transition behavior
// ---------------------------------------------------------------------------

/**
 * Determines if a transition from one status to another is permitted.
 */
export function canTransitionWorkOrderReviewSession(
  fromStatus: WorkOrderReviewSessionStatus,
  toStatus: WorkOrderReviewSessionStatus
): boolean {
  if (fromStatus === "cancelled") return false;
  if (fromStatus === "expired" && toStatus !== "cancelled") return false;

  // The pseudo "live_execution" status must never be transitioned to, but
  // since it's not a valid status, it will fail type checks. 
  // We'll enforce this conceptually anyway.

  const transitions: Record<string, string[]> = {
    previewed: ["awaiting_review", "cancelled"],
    awaiting_review: [
      "approved_to_plan",
      "changes_requested",
      "rejected",
      "more_info_requested",
      "blocked_execution_request",
      "cancelled"
    ],
    changes_requested: ["awaiting_review"],
    more_info_requested: ["awaiting_review"],
    approved_to_plan: [],
    rejected: [],
    blocked_execution_request: [],
    expired: ["cancelled"],
    cancelled: []
  };

  const allowed = transitions[fromStatus];
  return Array.isArray(allowed) && allowed.includes(toStatus);
}

/**
 * Derives the new session status from a review decision.
 */
function deriveStatusFromDecision(decision: string): WorkOrderReviewSessionStatus {
  switch (decision) {
    case "approve_to_plan": return "approved_to_plan";
    case "request_changes": return "changes_requested";
    case "reject": return "rejected";
    case "ask_for_more_info": return "more_info_requested";
    case "blocked_execution_request": return "blocked_execution_request";
    default: return "awaiting_review"; // Fallback or invalid
  }
}

/**
 * Applies a review decision to transition the session.
 * 
 * This function is pure — it returns a new session object.
 */
export function transitionWorkOrderReviewSession(
  session: WorkOrderReviewSession,
  review: { id: string; decision: string; reason?: string; requestedChanges?: unknown[] }
): WorkOrderReviewSessionValidationResult & { nextSession?: WorkOrderReviewSession } {
  
  const toStatus = deriveStatusFromDecision(review.decision);
  
  if (!canTransitionWorkOrderReviewSession(session.status, toStatus)) {
    return {
      valid: false,
      issues: [sessionIssue("invalid_transition", `Cannot transition from ${session.status} to ${toStatus}`)]
    };
  }

  // Create new pure object
  const nextSession: WorkOrderReviewSession = {
    ...session,
    status: toStatus,
    currentReviewId: review.id,
    lastDecision: review.decision,
    lastReason: review.reason,
    updatedAt: new Date().toISOString(),
  };

  if (review.requestedChanges && Array.isArray(review.requestedChanges)) {
    nextSession.requestedChanges = [...review.requestedChanges];
  }

  // Double check the new object is valid
  const validation = validateWorkOrderReviewSession(nextSession as unknown as Record<string, unknown>);
  if (!validation.valid) {
    return { ...validation };
  }

  return {
    valid: true,
    issues: [],
    nextSession
  };
}

// ---------------------------------------------------------------------------
// Public: Summary Helper
// ---------------------------------------------------------------------------

/**
 * Generates a human-readable summary of the session state.
 */
export function createWorkOrderReviewSessionSummary(session: Record<string, unknown>): string {
  const statusLabels: Record<string, string> = {
    previewed: "👀 Previewed",
    awaiting_review: "⏳ Awaiting Review",
    approved_to_plan: "✅ Approved to Plan",
    changes_requested: "🔄 Changes Requested",
    rejected: "❌ Rejected",
    more_info_requested: "❓ More Info Requested",
    blocked_execution_request: "🛑 Blocked Execution Request",
    expired: "⏰ Expired",
    cancelled: "🚫 Cancelled",
  };

  const status = (session.status as string) || "unknown";
  const label = statusLabels[status] || `Unknown (${status})`;

  return [
    `### Work Order Review Session [${session.workOrderId || "unknown"}]`,
    `- Status: **${label}**`,
    `- Reviewer: \`${session.reviewerId || "unknown"}\` (${session.reviewerRole || "unknown"})`,
    `- Last Decision: ${session.lastDecision || "None"}`,
    "",
    "💡 *Note Human-on-the-Loop : This session tracks planning and review status only.*",
    "🛑 *No execution is authorized by any status in this session.*"
  ].join("\n");
}
