import type {
  AgentReviewApprovalPacket,
  AgentReviewApprovalPacketDecision,
  AgentReviewRiskSummaryLevel,
} from "./agent-review-approval-packet";

// ---------------------------------------------------------------------------
// Agent review approval event.
//
// Represents an EXPLICIT human decision made on an AgentReviewApprovalPacket.
//
// A packet prepares a decision. This event records that a human actually made
// one. It is still NOT an approval to execute: even an `approved` event with
// `humanApproved: true` keeps `ledgerRequiredBeforeExecution: true` and
// `noRuntimeExecutionAuthorized: true`. Authorization to run only ever comes
// from a future, separately-created, ledgered approved action — never from this
// event and never from the packet.
//
// Pure, deterministic, read-only. No DB, no Supabase, no network, no runtime,
// no Action Ledger writes. The builder never calls Date.now() — the caller
// supplies every timestamp.
// ---------------------------------------------------------------------------

export type AgentReviewApprovalEventDecision =
  | "approved"
  | "rejected"
  | "needs_more_evidence"
  | "expired"
  | "revoked";

export type AgentReviewApprovalEventStatus =
  | "draft"
  | "valid_human_decision"
  | "invalid"
  | "expired"
  | "revoked";

/**
 * A named constraint a reviewer attached to a decision. Conceptual only — it
 * describes a bound the reviewer intends, it does not enforce anything at
 * runtime.
 */
export interface AgentReviewApprovalEventConstraint {
  id: string;
  description: string;
}

/**
 * The scope of what a human approved, conceptually. This is NOT a runtime
 * authorization. It records the shape of what was approved so a future,
 * separately-ledgered action can be checked against it.
 */
export interface AgentReviewApprovedScope {
  requestedDecision: AgentReviewApprovalPacketDecision;
  sourceNextAction: string;
  allowedActionTypes: string[];
  deniedActionTypes: string[];
  maxRiskLevel: AgentReviewRiskSummaryLevel;
  expiresAt: string;
}

export interface AgentReviewApprovalEvent {
  approvalEventId: string;
  sourcePacketId: string;
  sourceQueueItemId: string;
  agentId: string;
  outcomeId: string;
  reviewerId: string;
  reviewerRole: string;
  decision: AgentReviewApprovalEventDecision;
  status: AgentReviewApprovalEventStatus;
  decisionRationale: string[];
  /** Present only when `decision === "approved"`. */
  approvedScope?: AgentReviewApprovedScope;
  constraints: AgentReviewApprovalEventConstraint[];
  /**
   * Explicit governance guardrails. Named constraints copied onto every event
   * regardless of decision — not flags.
   */
  guardrails: string[];
  createdAt: string;
  expiresAt?: string;
  /** True only when the decision is `approved`. */
  humanApproved: boolean;
  ledgerRequiredBeforeExecution: true;
  noRuntimeExecutionAuthorized: true;
  noAutoApproval: true;
  approvalEventOnly: true;
}

export interface AgentReviewApprovalEventValidation {
  valid: boolean;
  errors: string[];
}

export interface BuildAgentReviewApprovalEventInput {
  packet: AgentReviewApprovalPacket;
  reviewerId: string;
  reviewerRole: string;
  decision: AgentReviewApprovalEventDecision;
  /** ISO timestamp. Caller-provided — builder never calls Date.now(). */
  createdAt: string;
  decisionRationale?: string[];
  expiresAt?: string;
  constraints?: AgentReviewApprovalEventConstraint[];
}

// ---------------------------------------------------------------------------
// Guardrails — static, copied onto every event
// ---------------------------------------------------------------------------

const APPROVAL_EVENT_GUARDRAILS: readonly string[] = [
  "This approval event does not write to the Action Ledger.",
  "This approval event does not authorize runtime execution.",
  "This approval event does not mutate agent autonomy.",
  "This approval event performs no DB, Supabase, API, network, or runtime call.",
  "Future execution requires an approved Action Ledger entry created after this event.",
];

const VALID_DECISIONS: ReadonlySet<AgentReviewApprovalEventDecision> = new Set([
  "approved",
  "rejected",
  "needs_more_evidence",
  "expired",
  "revoked",
]);

/** Decisions that represent an active human judgement requiring reviewer + rationale. */
const HUMAN_JUDGEMENT_DECISIONS: ReadonlySet<AgentReviewApprovalEventDecision> = new Set([
  "approved",
  "rejected",
  "needs_more_evidence",
]);

// ---------------------------------------------------------------------------
// Status derivation
// ---------------------------------------------------------------------------

function deriveStatus(
  decision: AgentReviewApprovalEventDecision,
): AgentReviewApprovalEventStatus {
  if (decision === "expired") {
    return "expired";
  }
  if (decision === "revoked") {
    return "revoked";
  }
  return "valid_human_decision";
}

// ---------------------------------------------------------------------------
// Approved scope
// ---------------------------------------------------------------------------

function buildApprovedScope(
  packet: AgentReviewApprovalPacket,
  expiresAt: string | undefined,
): AgentReviewApprovedScope {
  return {
    requestedDecision: packet.requestedDecision,
    sourceNextAction: packet.sourceNextAction,
    // Empty by design: an approval event authorizes nothing at runtime.
    // A future ledgered action is what gets checked against this scope.
    allowedActionTypes: [],
    deniedActionTypes: [],
    maxRiskLevel: packet.riskSummary.level,
    expiresAt: expiresAt ?? "",
  };
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * Builds an AgentReviewApprovalEvent from a packet and a human decision.
 *
 * Mechanical and deterministic: it shapes the event, it does not judge whether
 * the decision is well-formed — that is `validateAgentReviewApprovalEvent`'s
 * job. Pure, no I/O. Caller must supply `createdAt`; the builder never calls
 * Date.now(). Even when `decision === "approved"`, the returned event keeps
 * `ledgerRequiredBeforeExecution: true` and `noRuntimeExecutionAuthorized: true`.
 */
export function buildAgentReviewApprovalEvent(
  input: BuildAgentReviewApprovalEventInput,
): AgentReviewApprovalEvent {
  const {
    packet,
    reviewerId,
    reviewerRole,
    decision,
    createdAt,
    decisionRationale,
    expiresAt,
    constraints,
  } = input;

  const humanApproved = decision === "approved";

  const event: AgentReviewApprovalEvent = {
    approvalEventId: `approval-event-${packet.packetId}`,
    sourcePacketId: packet.packetId,
    sourceQueueItemId: packet.queueItemId,
    agentId: packet.agentId,
    outcomeId: packet.outcomeId,
    reviewerId,
    reviewerRole,
    decision,
    status: deriveStatus(decision),
    decisionRationale: decisionRationale ? [...decisionRationale] : [],
    constraints: constraints ? constraints.map((c) => ({ ...c })) : [],
    guardrails: [...APPROVAL_EVENT_GUARDRAILS],
    createdAt,
    humanApproved,
    ledgerRequiredBeforeExecution: true,
    noRuntimeExecutionAuthorized: true,
    noAutoApproval: true,
    approvalEventOnly: true,
  };

  if (humanApproved) {
    event.approvedScope = buildApprovedScope(packet, expiresAt);
  }

  if (expiresAt !== undefined) {
    event.expiresAt = expiresAt;
  }

  return event;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isNonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Validates an AgentReviewApprovalEvent. Report-style: never throws, returns
 * `{ valid, errors[] }`. Pure and deterministic.
 *
 * The hard governance invariants (`ledgerRequiredBeforeExecution`,
 * `noRuntimeExecutionAuthorized`, `noAutoApproval`, `approvalEventOnly`) must
 * all remain literally `true` — including for an `approved` event.
 */
export function validateAgentReviewApprovalEvent(
  event: AgentReviewApprovalEvent,
): AgentReviewApprovalEventValidation {
  const errors: string[] = [];

  if (!isNonEmptyString(event.approvalEventId)) {
    errors.push("approvalEventId is required.");
  }
  if (!isNonEmptyString(event.sourcePacketId)) {
    errors.push("sourcePacketId is required.");
  }
  if (!VALID_DECISIONS.has(event.decision)) {
    errors.push(`decision is invalid: ${String(event.decision)}.`);
  }
  if (!isNonEmptyString(event.createdAt) || Number.isNaN(Date.parse(event.createdAt))) {
    errors.push("createdAt is required and must be a parseable ISO timestamp.");
  }

  const isHumanJudgement = HUMAN_JUDGEMENT_DECISIONS.has(event.decision);

  if (isHumanJudgement) {
    if (!isNonEmptyString(event.reviewerId)) {
      errors.push(`reviewerId is required for decision "${event.decision}".`);
    }
    if (!isNonEmptyString(event.reviewerRole)) {
      errors.push(`reviewerRole is required for decision "${event.decision}".`);
    }
    if (!Array.isArray(event.decisionRationale) || event.decisionRationale.length === 0) {
      errors.push(`decisionRationale is required for decision "${event.decision}".`);
    }
  }

  if (event.decision === "approved") {
    if (!isNonEmptyString(event.expiresAt)) {
      errors.push("expiresAt is required when decision is approved.");
    }
    if (!event.approvedScope) {
      errors.push("approvedScope is required when decision is approved.");
    }
    if (event.humanApproved !== true) {
      errors.push("humanApproved must be true when decision is approved.");
    }
  } else {
    if (event.humanApproved !== false) {
      errors.push(`humanApproved must be false when decision is "${event.decision}".`);
    }
  }

  if (event.ledgerRequiredBeforeExecution !== true) {
    errors.push("ledgerRequiredBeforeExecution must be true.");
  }
  if (event.noRuntimeExecutionAuthorized !== true) {
    errors.push("noRuntimeExecutionAuthorized must be true.");
  }
  if (event.noAutoApproval !== true) {
    errors.push("noAutoApproval must be true.");
  }
  if (event.approvalEventOnly !== true) {
    errors.push("approvalEventOnly must be true.");
  }

  return { valid: errors.length === 0, errors };
}
