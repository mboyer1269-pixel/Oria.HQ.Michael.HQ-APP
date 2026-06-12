// src/server/agents/work-order-review-contract.ts

/**
 * Pure TypeScript contracts and validation helpers for Work Order human
 * reviews within the Oria HQ Agentic Holding OS.
 *
 * A Work Order Review is the decision object that captures the Workflow
 * Owner's (CEO / Human-on-the-Loop) response to a proposed Work Order.
 * Reviews are planning objects only — they must not execute anything.
 *
 * Four decision types exist:
 *   - approve_to_plan  — advance the Work Order to planning (NOT execution).
 *   - request_changes  — ask for modifications before proceeding.
 *   - reject           — decline the Work Order entirely.
 *   - ask_for_more_info — request additional context before deciding.
 *
 * All helpers are pure: no I/O, no writes, no mutations, no side-effects.
 */

import { ApprovalGate } from "./agent-profile-contract";

// ---------------------------------------------------------------------------
// Enumerations & Supporting Types
// ---------------------------------------------------------------------------

export type WorkOrderReviewDecision =
  | "approve_to_plan"
  | "request_changes"
  | "reject"
  | "ask_for_more_info";

export type WorkOrderReviewStatus =
  | "pending"
  | "submitted"
  | "acknowledged";

export type WorkOrderReviewActorRole =
  | "ceo"
  | "workflow_owner"
  | "delegate"
  | "auditor";

// ---------------------------------------------------------------------------
// Structured sub-objects
// ---------------------------------------------------------------------------

export interface WorkOrderRequestedChange {
  /** Which field or aspect of the Work Order requires modification */
  field: string;
  /** Human-readable description of the requested change */
  description: string;
  /** Severity of the requested change */
  severity: "required" | "suggested";
}

export interface WorkOrderApprovalGateAcknowledgement {
  /** The approval gate being acknowledged */
  gate: ApprovalGate;
  /** Whether the reviewer explicitly acknowledges this gate */
  acknowledged: boolean;
  /** Optional note explaining the acknowledgement or refusal */
  note?: string;
}

export interface WorkOrderReviewMetadata {
  /** Source channel (e.g. "chat", "ui", "api") */
  channel?: string;
  /** Session or conversation identifier */
  sessionId?: string;
  /** Workspace identifier */
  workspaceId?: string;
  /** Any additional context as key-value pairs */
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Validation Result Types (mirrors work-order-contract pattern)
// ---------------------------------------------------------------------------

export type WorkOrderReviewValidationSeverity = "error" | "warning";

export interface WorkOrderReviewIssue {
  code: string;
  message: string;
  path?: string;
  severity: WorkOrderReviewValidationSeverity;
}

export interface WorkOrderReviewResult {
  valid: boolean;
  issues: WorkOrderReviewIssue[];
}

// ---------------------------------------------------------------------------
// Core Review Contract
// ---------------------------------------------------------------------------

export interface WorkOrderReview {
  /** Unique identifier for this review */
  id: string;
  /** The Work Order being reviewed */
  workOrderId: string;
  /** The decision rendered by the reviewer */
  decision: WorkOrderReviewDecision;
  /** Identifier of the reviewer (e.g. userId) */
  reviewerId: string;
  /** Role of the reviewer in the workflow */
  reviewerRole: WorkOrderReviewActorRole;
  /** ISO 8601 timestamp of when the review was created */
  createdAt: string;
  /**
   * Must always be true. Reviews are only valid when the human is on the loop.
   * This is not optional — it is a contract enforcement field.
   */
  humanOnTheLoop: true;
  /**
   * Must always be true. A review decision never authorizes live execution.
   * approve_to_plan advances planning, not runtime dispatch.
   */
  noExecutionAuthorized: true;

  // -- Optional structured fields --

  /** Human-readable reason or justification for the decision */
  reason?: string;
  /** Structured list of changes requested (required for request_changes) */
  requestedChanges?: WorkOrderRequestedChange[];
  /** Explicit acknowledgement of approval gates (required for approve_to_plan when gates exist) */
  approvalGateAcknowledgements?: WorkOrderApprovalGateAcknowledgement[];
  /** Confidence level in the decision */
  confidence?: "low" | "medium" | "high";
  /** Optional expiry for the review validity */
  expiresAt?: string;
  /** Additional metadata */
  metadata?: WorkOrderReviewMetadata;
}

// ---------------------------------------------------------------------------
// Forbidden live-execution field names (shared with work-order-contract)
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
// Valid decision values
// ---------------------------------------------------------------------------

const VALID_DECISIONS: ReadonlySet<string> = new Set([
  "approve_to_plan",
  "request_changes",
  "reject",
  "ask_for_more_info",
]);

const VALID_REVIEWER_ROLES: ReadonlySet<string> = new Set([
  "ceo",
  "workflow_owner",
  "delegate",
  "auditor",
]);

const VALID_APPROVAL_GATES: ReadonlySet<string> = new Set(Object.values(ApprovalGate));

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function issue(
  code: string,
  message: string,
  severity: WorkOrderReviewValidationSeverity = "error",
  path?: string,
): WorkOrderReviewIssue {
  const result: WorkOrderReviewIssue = { code, message, severity };
  if (path !== undefined) result.path = path;
  return result;
}

// ---------------------------------------------------------------------------
// Public: live-execution guard
// ---------------------------------------------------------------------------

/**
 * Returns true if the review object contains any field that implies
 * live/runtime execution. Reviews are decision objects — these fields
 * are forbidden.
 */
export function hasForbiddenExecutionFields(
  review: unknown,
): boolean {
  if (!review || typeof review !== "object") return false;

  if (Array.isArray(review)) {
    return review.some(hasForbiddenExecutionFields);
  }

  for (const [key, value] of Object.entries(review)) {
    if ((LIVE_EXECUTION_FIELDS as readonly string[]).includes(key)) {
      return true;
    }
    if (hasForbiddenExecutionFields(value)) {
      return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Public: approval gate acknowledgement validation
// ---------------------------------------------------------------------------

/**
 * Validates that approval gate acknowledgements, when present, are
 * properly structured objects with required fields.
 */
export function validateApprovalGateAcknowledgements(
  review: Record<string, unknown>,
): WorkOrderReviewIssue[] {
  const issues: WorkOrderReviewIssue[] = [];
  const acks = review.approvalGateAcknowledgements as unknown[] | undefined;

  if (!Array.isArray(acks)) return issues;

  for (let i = 0; i < acks.length; i++) {
    const ack = acks[i] as Record<string, unknown> | null;
    const prefix = `approvalGateAcknowledgements[${i}]`;

    if (!ack || typeof ack !== "object") {
      issues.push(issue(
        "invalid_approval_gate_acknowledgement",
        `Acknowledgement at index ${i} is not a structured object`,
        "error",
        prefix,
      ));
      continue;
    }

    if (!ack.gate || typeof ack.gate !== "string" || !VALID_APPROVAL_GATES.has(ack.gate)) {
      issues.push(issue(
        "invalid_approval_gate_acknowledgement",
        `Acknowledgement at index ${i} is missing a valid gate identifier`,
        "error",
        prefix,
      ));
    }

    if (typeof ack.acknowledged !== "boolean") {
      issues.push(issue(
        "invalid_approval_gate_acknowledgement",
        `Acknowledgement at index ${i} is missing the acknowledged boolean`,
        "error",
        prefix,
      ));
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Public: main review validation
// ---------------------------------------------------------------------------

/**
 * Validates a Work Order Review against the full contract rules.
 * Returns a structured validation result with issue codes.
 *
 * This function is pure — it does not mutate the input.
 */
export function validateWorkOrderReview(
  review: Record<string, unknown>,
): WorkOrderReviewResult {
  const issues: WorkOrderReviewIssue[] = [];

  // ---- Required identity fields ----

  if (!review.id) {
    issues.push(issue("missing_id", "Review is missing id"));
  }

  if (!review.workOrderId) {
    issues.push(issue("missing_work_order_id", "Review is missing workOrderId"));
  }

  if (!review.reviewerId) {
    issues.push(issue("missing_reviewer", "Review is missing reviewerId"));
  }

  if (!review.reviewerRole) {
    issues.push(issue("missing_reviewer", "Review is missing reviewerRole"));
  } else if (typeof review.reviewerRole === "string" && !VALID_REVIEWER_ROLES.has(review.reviewerRole)) {
    issues.push(issue("invalid_reviewer_role", `Unknown reviewer role: "${review.reviewerRole}"`));
  }

  if (!review.createdAt || typeof review.createdAt !== "string" || review.createdAt.trim() === "") {
    issues.push(issue("missing_created_at", "Review is missing createdAt"));
  }

  // ---- Decision validation ----

  const decision = review.decision as string | undefined;

  if (!decision) {
    issues.push(issue("missing_decision", "Review is missing decision"));
  } else if (!VALID_DECISIONS.has(decision)) {
    issues.push(issue(
      "invalid_decision",
      `Unknown decision type: "${decision}". Valid values: ${[...VALID_DECISIONS].join(", ")}`,
    ));
  }

  // ---- Human-on-the-Loop enforcement ----

  if (review.humanOnTheLoop !== true) {
    issues.push(issue(
      "human_on_the_loop_required",
      "humanOnTheLoop must be true — reviews require human presence",
    ));
  }

  if (review.noExecutionAuthorized !== true) {
    issues.push(issue(
      "no_execution_authorized_required",
      "noExecutionAuthorized must be true — reviews never authorize live execution",
    ));
  }

  // ---- Decision-specific rules ----

  if (decision === "request_changes") {
    const changes = review.requestedChanges as unknown[] | undefined;
    if (!Array.isArray(changes) || changes.length === 0) {
      issues.push(issue(
        "requested_changes_required",
        "request_changes decision must include at least one requestedChange",
        "error",
        "requestedChanges",
      ));
    } else {
      for (let i = 0; i < changes.length; i++) {
        const change = changes[i] as Record<string, unknown> | null;
        const prefix = `requestedChanges[${i}]`;
        if (!change || typeof change !== "object") {
          issues.push(issue("invalid_requested_change", "Requested change is not a structured object", "error", prefix));
          continue;
        }
        if (!change.field || typeof change.field !== "string" || change.field.trim() === "") {
          issues.push(issue("invalid_requested_change", "Requested change missing field", "error", prefix));
        }
        if (!change.description || typeof change.description !== "string" || change.description.trim() === "") {
          issues.push(issue("invalid_requested_change", "Requested change missing description", "error", prefix));
        }
        if (change.severity !== "required" && change.severity !== "suggested") {
          issues.push(issue("invalid_requested_change", "Requested change invalid severity", "error", prefix));
        }
      }
    }
  }

  if (decision === "reject") {
    if (!review.reason || typeof review.reason !== "string" || (review.reason as string).trim().length === 0) {
      issues.push(issue(
        "rejection_reason_required",
        "reject decision must include a reason",
        "error",
        "reason",
      ));
    }
  }

  if (decision === "ask_for_more_info") {
    if (!review.reason || typeof review.reason !== "string" || (review.reason as string).trim().length === 0) {
      issues.push(issue(
        "more_info_reason_required",
        "ask_for_more_info decision must include a reason or question",
        "error",
        "reason",
      ));
    }
  }

  // ---- Approval gate acknowledgement validation ----

  if (decision === "approve_to_plan") {
    const acks = review.approvalGateAcknowledgements as unknown[] | undefined;
    if (Array.isArray(acks) && acks.length > 0) {
      issues.push(...validateApprovalGateAcknowledgements(review));
    }
  }

  // ---- Forbidden execution fields ----

  if (hasForbiddenExecutionFields(review)) {
    issues.push(issue(
      "forbidden_execution_field",
      "Review contains forbidden live-execution fields — reviews are decision objects, not runtime commands",
    ));
  }

  return {
    valid: issues.filter((i) => i.severity === "error").length === 0,
    issues,
  };
}

// ---------------------------------------------------------------------------
// Public: review summary helper
// ---------------------------------------------------------------------------

/**
 * Creates a pure, human-readable summary of a Work Order Review.
 * Emphasises the Human-on-the-Loop principle and the non-execution nature
 * of the review decision.
 *
 * This function is pure — it does not mutate the input.
 */
export function createWorkOrderReviewSummary(
  review: Record<string, unknown>,
): string {
  const decision = review.decision as string || "(aucune décision)";
  const workOrderId = review.workOrderId as string || "(inconnu)";
  const reviewerId = review.reviewerId as string || "(inconnu)";
  const reviewerRole = review.reviewerRole as string || "(inconnu)";
  const reason = review.reason as string | undefined;

  const decisionLabels: Record<string, string> = {
    approve_to_plan: "✅ Approuvé pour planification",
    request_changes: "🔄 Modifications demandées",
    reject: "❌ Rejeté",
    ask_for_more_info: "❓ Informations supplémentaires requises",
  };

  const label = decisionLabels[decision] || `⚠️ Décision inconnue: ${decision}`;

  const lines = [
    `### 📋 Résumé de la Revue de Work Order`,
    `- **Work Order** : \`${workOrderId}\``,
    `- **Décision** : ${label}`,
    `- **Réviseur** : \`${reviewerId}\` (${reviewerRole})`,
  ];

  if (reason) {
    lines.push(`- **Raison** : ${reason}`);
  }

  const changes = review.requestedChanges as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(changes) && changes.length > 0) {
    lines.push(``, `#### 🔄 Modifications demandées`);
    for (const change of changes) {
      const severity = change.severity === "required" ? "🔴" : "🟡";
      lines.push(`- ${severity} **${change.field || "(champ non spécifié)"}** : ${change.description || "(sans description)"}`);
    }
  }

  const acks = review.approvalGateAcknowledgements as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(acks) && acks.length > 0) {
    lines.push(``, `#### 🛡️ Portes d'approbation`);
    for (const ack of acks) {
      const status = ack.acknowledged ? "✅" : "❌";
      const note = ack.note ? ` — ${ack.note}` : "";
      lines.push(`- ${status} **${String(ack.gate || "(inconnu)").toUpperCase()}**${note}`);
    }
  }

  lines.push(
    ``,
    `---`,
    `💡 *Note Human-on-the-Loop : Cette revue est une décision de planification uniquement. Aucune exécution, aucun transfert de fonds, aucun déploiement, aucune publication ou action externe n'a été autorisé(e).*`,
  );

  return lines.join("\n");
}
