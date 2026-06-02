// ---------------------------------------------------------------------------
// Agent approval persistence read models.
//
// Pure TypeScript — no Supabase, no DB driver, no network, no filesystem.
// No Promise-based data access. No repository interface.
// No list/get/create/insert/update/delete/upsert/approve/execute/revoke methods.
//
// Sections:
//   A. DB Row Types (snake_case, matching SQL columns exactly)
//   B. Domain Read Models (camelCase)
//   C. Known enum values (as const arrays)
//   D. Validation result type and helpers
//   E. Mapping functions
//   F. Snapshot builder
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// SECTION A: DB Row Types
// Column names match 0010_agent_review_approval_events.sql and
// 0011_agent_review_approval_packets.sql exactly.
// ---------------------------------------------------------------------------

export type AgentReviewApprovalPacketRow = {
  id: string;
  user_id: string;
  packet_id: string;
  queue_item_id: string;
  agent_id: string;
  outcome_id: string;
  priority: string;
  status: string;
  requested_decision: string;
  source_decision: string;
  source_next_action: string;
  risk_summary: Record<string, unknown>;
  required_review: Record<string, unknown>;
  rationale: unknown[];
  executive_summary: string;
  guardrails: unknown[];
  approval_required: boolean;
  human_on_the_loop: boolean;
  no_execution_authorized: boolean;
  created_at: string;
  expires_at: string | null;
  metadata: Record<string, unknown>;
};

export type AgentReviewApprovalEventRow = {
  id: string;
  user_id: string;
  source_packet_id: string;
  source_queue_item_id: string;
  agent_id: string;
  outcome_id: string;
  reviewer_id: string;
  reviewer_role: string;
  decision: string;
  decision_rationale: string;
  approved_scope: Record<string, unknown>;
  constraints: unknown[];
  guardrails: unknown[];
  human_approved: boolean;
  ledger_required_before_execution: boolean;
  no_runtime_execution_authorized: boolean;
  no_auto_approval: boolean;
  approval_event_only: boolean;
  status: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  revocation_reason: string | null;
  future_ledger_entry_id: string | null;
  metadata: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// SECTION B: Domain Read Models (camelCase)
// ---------------------------------------------------------------------------

export type PersistedAgentReviewApprovalPacket = {
  id: string;
  userId: string;
  packetId: string;
  queueItemId: string;
  agentId: string;
  outcomeId: string;
  priority: string;
  status: string;
  requestedDecision: string;
  sourceDecision: string;
  sourceNextAction: string;
  riskSummary: Record<string, unknown>;
  requiredReview: Record<string, unknown>;
  rationale: unknown[];
  executiveSummary: string;
  guardrails: unknown[];
  approvalRequired: boolean;
  humanOnTheLoop: boolean;
  noExecutionAuthorized: boolean;
  createdAt: string;
  expiresAt: string | null;
  metadata: Record<string, unknown>;
};

export type PersistedAgentReviewApprovalEvent = {
  id: string;
  userId: string;
  sourcePacketId: string;
  sourceQueueItemId: string;
  agentId: string;
  outcomeId: string;
  reviewerId: string;
  reviewerRole: string;
  decision: string;
  decisionRationale: string;
  approvedScope: Record<string, unknown>;
  constraints: unknown[];
  guardrails: unknown[];
  humanApproved: boolean;
  ledgerRequiredBeforeExecution: boolean;
  noRuntimeExecutionAuthorized: boolean;
  noAutoApproval: boolean;
  approvalEventOnly: boolean;
  status: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  revocationReason: string | null;
  futureLedgerEntryId: string | null;
  metadata: Record<string, unknown>;
};

export type LinkedApprovalPair = {
  packet: PersistedAgentReviewApprovalPacket;
  events: PersistedAgentReviewApprovalEvent[];
};

export type AgentApprovalPersistenceSnapshot = {
  packets: PersistedAgentReviewApprovalPacket[];
  events: PersistedAgentReviewApprovalEvent[];
  packetCount: number;
  eventCount: number;
  linkedPairs: LinkedApprovalPair[];
  unmatchedPackets: PersistedAgentReviewApprovalPacket[];
  unmatchedEvents: PersistedAgentReviewApprovalEvent[];
};

// ---------------------------------------------------------------------------
// SECTION C: Known enum values
// Extracted from agent-review-approval-packet.ts and
// agent-review-approval-event.ts source contracts.
// ---------------------------------------------------------------------------

/** AgentReviewApprovalPacketStatus values */
export const KNOWN_PACKET_STATUSES = [
  "draft_for_human_review",
  "ready_for_human_review",
  "blocked_pending_more_evidence",
] as const;

/** AgentReviewApprovalPacketDecision values — what the human is asked to decide */
export const KNOWN_REQUESTED_DECISIONS = [
  "approve_controlled_expansion_review",
  "approve_continue_monitoring",
  "approve_knowledge_pack_improvement_review",
  "approve_more_observation_collection",
  "reject_or_reduce_autonomy",
  "block_autonomy_increase",
] as const;

/** AgentOutcomeReviewDecision values — the source recommendation */
export const KNOWN_SOURCE_DECISIONS = [
  "eligible_for_controlled_expansion",
  "continue_monitoring",
  "improve_knowledge_pack",
  "require_more_observations",
  "reduce_autonomy_recommendation",
  "block_autonomy_increase",
] as const;

/** AgentReviewApprovalEventDecision values */
export const KNOWN_EVENT_DECISIONS = [
  "approved",
  "rejected",
  "needs_more_evidence",
  "expired",
  "revoked",
] as const;

/** AgentReviewApprovalEventStatus values */
export const KNOWN_EVENT_STATUSES = [
  "draft",
  "valid_human_decision",
  "invalid",
  "expired",
  "revoked",
] as const;

// ---------------------------------------------------------------------------
// SECTION D: Validation result type and helpers
// ---------------------------------------------------------------------------

export type ApprovalRowValidationResult = {
  valid: boolean;
  errors: string[];
};

function isNonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

const KNOWN_PACKET_STATUSES_SET: ReadonlySet<string> = new Set(KNOWN_PACKET_STATUSES);
const KNOWN_REQUESTED_DECISIONS_SET: ReadonlySet<string> = new Set(KNOWN_REQUESTED_DECISIONS);
const KNOWN_SOURCE_DECISIONS_SET: ReadonlySet<string> = new Set(KNOWN_SOURCE_DECISIONS);
const KNOWN_EVENT_DECISIONS_SET: ReadonlySet<string> = new Set(KNOWN_EVENT_DECISIONS);
const KNOWN_EVENT_STATUSES_SET: ReadonlySet<string> = new Set(KNOWN_EVENT_STATUSES);

/**
 * Validates an AgentReviewApprovalPacketRow against governance invariants.
 * Never throws. Returns { valid, errors[] }.
 */
export function validateApprovalPacketRow(
  row: AgentReviewApprovalPacketRow,
): ApprovalRowValidationResult {
  const errors: string[] = [];

  if (!isNonEmptyString(row.id)) {
    errors.push("id is required.");
  }
  if (!isNonEmptyString(row.user_id)) {
    errors.push("user_id is required.");
  }
  if (!isNonEmptyString(row.packet_id)) {
    errors.push("packet_id is required.");
  }
  if (!isNonEmptyString(row.queue_item_id)) {
    errors.push("queue_item_id is required.");
  }
  if (!isNonEmptyString(row.agent_id)) {
    errors.push("agent_id is required.");
  }
  if (!isNonEmptyString(row.outcome_id)) {
    errors.push("outcome_id is required.");
  }

  if (!KNOWN_PACKET_STATUSES_SET.has(row.status)) {
    errors.push(`status is invalid: ${String(row.status)}.`);
  }
  if (!KNOWN_REQUESTED_DECISIONS_SET.has(row.requested_decision)) {
    errors.push(`requested_decision is invalid: ${String(row.requested_decision)}.`);
  }
  if (!KNOWN_SOURCE_DECISIONS_SET.has(row.source_decision)) {
    errors.push(`source_decision is invalid: ${String(row.source_decision)}.`);
  }

  if (row.approval_required !== true) {
    errors.push("approval_required must be true.");
  }
  if (row.human_on_the_loop !== true) {
    errors.push("human_on_the_loop must be true.");
  }
  if (row.no_execution_authorized !== true) {
    errors.push("no_execution_authorized must be true.");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates an AgentReviewApprovalEventRow against governance invariants.
 * Never throws. Returns { valid, errors[] }.
 *
 * Invariants:
 * - humanApproved must be true iff decision === 'approved'
 * - approved decision requires expires_at
 * - all four safety booleans must be true
 */
export function validateApprovalEventRow(
  row: AgentReviewApprovalEventRow,
): ApprovalRowValidationResult {
  const errors: string[] = [];

  if (!isNonEmptyString(row.id)) {
    errors.push("id is required.");
  }
  if (!isNonEmptyString(row.user_id)) {
    errors.push("user_id is required.");
  }
  if (!isNonEmptyString(row.source_packet_id)) {
    errors.push("source_packet_id is required.");
  }
  if (!isNonEmptyString(row.source_queue_item_id)) {
    errors.push("source_queue_item_id is required.");
  }
  if (!isNonEmptyString(row.agent_id)) {
    errors.push("agent_id is required.");
  }
  if (!isNonEmptyString(row.outcome_id)) {
    errors.push("outcome_id is required.");
  }

  if (!KNOWN_EVENT_DECISIONS_SET.has(row.decision)) {
    errors.push(`decision is invalid: ${String(row.decision)}.`);
  }
  if (!KNOWN_EVENT_STATUSES_SET.has(row.status)) {
    errors.push(`status is invalid: ${String(row.status)}.`);
  }

  if (row.decision === "approved") {
    if (row.human_approved !== true) {
      errors.push("human_approved must be true when decision is approved.");
    }
    if (!isNonEmptyString(row.expires_at)) {
      errors.push("expires_at is required when decision is approved.");
    }
  } else {
    if (row.human_approved !== false) {
      errors.push(`human_approved must be false when decision is "${String(row.decision)}".`);
    }
  }

  if (row.ledger_required_before_execution !== true) {
    errors.push("ledger_required_before_execution must be true.");
  }
  if (row.no_runtime_execution_authorized !== true) {
    errors.push("no_runtime_execution_authorized must be true.");
  }
  if (row.no_auto_approval !== true) {
    errors.push("no_auto_approval must be true.");
  }
  if (row.approval_event_only !== true) {
    errors.push("approval_event_only must be true.");
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// SECTION E: Mapping functions
// ---------------------------------------------------------------------------

/**
 * Maps an AgentReviewApprovalPacketRow to a PersistedAgentReviewApprovalPacket.
 * Deterministic. Copies arrays/objects (no references). Preserves all safety
 * booleans. Does not mutate input.
 */
export function mapApprovalPacketRow(
  row: AgentReviewApprovalPacketRow,
): PersistedAgentReviewApprovalPacket {
  return {
    id: row.id,
    userId: row.user_id,
    packetId: row.packet_id,
    queueItemId: row.queue_item_id,
    agentId: row.agent_id,
    outcomeId: row.outcome_id,
    priority: row.priority,
    status: row.status,
    requestedDecision: row.requested_decision,
    sourceDecision: row.source_decision,
    sourceNextAction: row.source_next_action,
    riskSummary: { ...row.risk_summary },
    requiredReview: { ...row.required_review },
    rationale: [...row.rationale],
    executiveSummary: row.executive_summary,
    guardrails: [...row.guardrails],
    approvalRequired: row.approval_required,
    humanOnTheLoop: row.human_on_the_loop,
    noExecutionAuthorized: row.no_execution_authorized,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    metadata: { ...row.metadata },
  };
}

/**
 * Maps an AgentReviewApprovalEventRow to a PersistedAgentReviewApprovalEvent.
 * Deterministic. Copies arrays/objects (no references). Preserves all safety
 * booleans. Does not mutate input.
 */
export function mapApprovalEventRow(
  row: AgentReviewApprovalEventRow,
): PersistedAgentReviewApprovalEvent {
  return {
    id: row.id,
    userId: row.user_id,
    sourcePacketId: row.source_packet_id,
    sourceQueueItemId: row.source_queue_item_id,
    agentId: row.agent_id,
    outcomeId: row.outcome_id,
    reviewerId: row.reviewer_id,
    reviewerRole: row.reviewer_role,
    decision: row.decision,
    decisionRationale: row.decision_rationale,
    approvedScope: { ...row.approved_scope },
    constraints: [...row.constraints],
    guardrails: [...row.guardrails],
    humanApproved: row.human_approved,
    ledgerRequiredBeforeExecution: row.ledger_required_before_execution,
    noRuntimeExecutionAuthorized: row.no_runtime_execution_authorized,
    noAutoApproval: row.no_auto_approval,
    approvalEventOnly: row.approval_event_only,
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    revocationReason: row.revocation_reason,
    futureLedgerEntryId: row.future_ledger_entry_id,
    metadata: { ...row.metadata },
  };
}

// ---------------------------------------------------------------------------
// SECTION F: Snapshot builder
// ---------------------------------------------------------------------------

/**
 * Builds an AgentApprovalPersistenceSnapshot from pre-mapped domain objects.
 *
 * Links events to packets by event.sourcePacketId === packet.packetId.
 * Does not mutate inputs. Does not derive runtime authorization.
 * Does not infer execution permission.
 */
export function buildAgentApprovalPersistenceSnapshot(input: {
  packets: PersistedAgentReviewApprovalPacket[];
  events: PersistedAgentReviewApprovalEvent[];
}): AgentApprovalPersistenceSnapshot {
  const packets = [...input.packets];
  const events = [...input.events];

  // Index events by sourcePacketId
  const eventsByPacketId = new Map<string, PersistedAgentReviewApprovalEvent[]>();
  for (const event of events) {
    const existing = eventsByPacketId.get(event.sourcePacketId);
    if (existing !== undefined) {
      existing.push(event);
    } else {
      eventsByPacketId.set(event.sourcePacketId, [event]);
    }
  }

  // Build linked pairs and identify unmatched packets
  const linkedPairs: LinkedApprovalPair[] = [];
  const unmatchedPackets: PersistedAgentReviewApprovalPacket[] = [];

  for (const packet of packets) {
    const matchedEvents = eventsByPacketId.get(packet.packetId);
    if (matchedEvents !== undefined && matchedEvents.length > 0) {
      linkedPairs.push({ packet, events: [...matchedEvents] });
    } else {
      unmatchedPackets.push(packet);
    }
  }

  // Identify unmatched events: events whose sourcePacketId has no matching packet
  const packetIdSet = new Set(packets.map((p) => p.packetId));
  const unmatchedEvents = events.filter((e) => !packetIdSet.has(e.sourcePacketId));

  return {
    packets,
    events,
    packetCount: packets.length,
    eventCount: events.length,
    linkedPairs,
    unmatchedPackets,
    unmatchedEvents,
  };
}
