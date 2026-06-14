// src/features/ventures/prepared-action.ts
//
// Pure model for a PREPARED ACTION — one unit of work Relay (the iterative
// prep agent) has prepared and queued for CEO review. It bundles, for a single
// cash move:
//   - the CashActionPacket (what to sell, to whom, the draft),
//   - a compact Council summary (the multi-role readiness verdict),
//   - the HermesOutreachPlan (the operator plan: channel, prospect, message…).
//
// It is the durable unit behind the "CEO review queue": the worker writes
// prepared actions, the screen reads them. A content hash enables dedup
// (refresh-in-place via supersedesId instead of duplicating), and a priority
// score lets the queue surface the best cash moves first.
//
// Hard boundary: a prepared action is a PROPOSAL ONLY. It never executes,
// sends, contacts, or dispatches. requiresCeoApproval, requiresManualSend and
// noExecutionAuthorized are locked to literal true.
//
// Dependency-free and pure: no Supabase, no database, no network, no UI, no
// AI/LLM, no runtime, no persistence. It reuses the pure CashActionPacket and
// HermesOutreachPlan models; the Council summary is a plain, composer-agnostic
// subset so this module never imports server/agents code. Validation follows
// the hand-rolled { valid, errors } style of the adjacent Ventures modules.

import type { CashActionPacket } from "./cash-action-packet";
import { validateCashActionPacket } from "./cash-action-packet";
import type { HermesOutreachPlan } from "./hermes-outreach-plan";
import { validateHermesOutreachPlan } from "./hermes-outreach-plan";

// ---------------------------------------------------------------------------
// SECTION A — Enums
// ---------------------------------------------------------------------------

// Council readiness, mirrored as a plain union so this pure model never depends
// on the server-side council composer.
export type PreparedActionReadiness =
  | "ready_for_ceo"
  | "needs_more_evidence"
  | "blocked_by_auditor"
  | "needs_refinement";

export const PREPARED_ACTION_READINESS_VALUES: readonly PreparedActionReadiness[] = [
  "ready_for_ceo",
  "needs_more_evidence",
  "blocked_by_auditor",
  "needs_refinement",
];

export type PreparedActionPriority = "critical" | "high" | "medium" | "low";

export const PREPARED_ACTION_PRIORITIES: readonly PreparedActionPriority[] = [
  "critical",
  "high",
  "medium",
  "low",
];

// Lifecycle, all human-gated. Transitions are append-only (a new superseding
// row), never an in-place mutation — there is no "sent" or "executing" state.
export type PreparedActionStatus =
  | "prepared"
  | "ready_for_ceo_review"
  | "approved_for_manual_send"
  | "rejected"
  | "superseded";

export const PREPARED_ACTION_STATUSES: readonly PreparedActionStatus[] = [
  "prepared",
  "ready_for_ceo_review",
  "approved_for_manual_send",
  "rejected",
  "superseded",
];

// ---------------------------------------------------------------------------
// SECTION B — Council summary (plain subset)
// ---------------------------------------------------------------------------

export type PreparedActionCouncilSummary = {
  readiness: PreparedActionReadiness;
  verdictDecision: string;
  recommendedManualAction: string;
  // Durable council run record (P4b). Optional for backward compatibility with
  // summaries persisted before these fields existed. `runStatus` is the raw
  // AgentCouncilRunStatus token (kept as a plain string so this pure model never
  // imports server/agents); the display derives a lifecycle phase from it via
  // run-lifecycle-phase (P2).
  runId?: string;
  runStatus?: string;
  turnCount?: number;
};

// ---------------------------------------------------------------------------
// SECTION C — The PreparedAction type
// ---------------------------------------------------------------------------

export type PreparedAction = {
  preparedActionId: string;
  ventureId: string;
  cashActionPacketId: string;

  // Dedup key + history chain. contentHash is derived (see builder); when this
  // action refreshes a previous one, supersedesId points back at it.
  contentHash: string;
  supersedesId?: string;

  // The bundled work.
  packet: CashActionPacket;
  council: PreparedActionCouncilSummary;
  hermesPlan: HermesOutreachPlan;

  // Queue ordering.
  priority: PreparedActionPriority;
  priorityScore: number;

  status: PreparedActionStatus;

  createdAt: string;

  // Governance locks — always literal true.
  requiresCeoApproval: true;
  requiresManualSend: true;
  noExecutionAuthorized: true;
};

// ---------------------------------------------------------------------------
// SECTION D — Content hash (deterministic dedup key)
// ---------------------------------------------------------------------------

// Deterministic FNV-1a (32-bit) hash over the dedup-defining fields. Pure: no
// crypto import, no clock, no randomness — same inputs always yield the same
// key, so the worker can detect an equivalent prepared action and refresh it
// in place instead of creating a duplicate.
export function computePreparedActionContentHash(
  ventureId: string,
  offer: string,
  targetBuyer: string,
  channel: string,
): string {
  const key = [ventureId, offer, targetBuyer, channel].join("");
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `pa_${(h >>> 0).toString(16).padStart(8, "0")}`;
}

// The dedup key for a packet + plan pair, derived from the same fields the
// builder uses. Two prepared actions with the same hash target the same move.
export function preparedActionContentHashFor(
  packet: CashActionPacket,
  plan: HermesOutreachPlan,
): string {
  return computePreparedActionContentHash(
    packet.ventureId,
    packet.offer,
    packet.targetBuyer,
    plan.channel,
  );
}

// ---------------------------------------------------------------------------
// SECTION E — Validation
// ---------------------------------------------------------------------------

export type PreparedActionValidation = {
  valid: boolean;
  errors: string[];
};

function requireText(value: unknown, field: string, errors: string[]): void {
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`${field} must be non-empty`);
  }
}

export function validatePreparedAction(action: PreparedAction): PreparedActionValidation {
  const errors: string[] = [];

  // Identity.
  requireText(action.preparedActionId, "preparedActionId", errors);
  requireText(action.ventureId, "ventureId", errors);
  requireText(action.cashActionPacketId, "cashActionPacketId", errors);
  requireText(action.contentHash, "contentHash", errors);
  if (action.supersedesId !== undefined) {
    requireText(action.supersedesId, "supersedesId", errors);
  }

  // Bundled packet — must be present and itself valid.
  if (!action.packet || typeof action.packet !== "object") {
    errors.push("packet must be present");
  } else {
    const r = validateCashActionPacket(action.packet);
    for (const e of r.errors) errors.push(`packet: ${e}`);
    if (action.packet.packetId !== action.cashActionPacketId) {
      errors.push("packet.packetId must match cashActionPacketId");
    }
    if (action.packet.ventureId !== action.ventureId) {
      errors.push("packet.ventureId must match ventureId");
    }
  }

  // Bundled Relay plan — must be present and itself valid.
  if (!action.hermesPlan || typeof action.hermesPlan !== "object") {
    errors.push("hermesPlan must be present");
  } else {
    const r = validateHermesOutreachPlan(action.hermesPlan);
    for (const e of r.errors) errors.push(`hermesPlan: ${e}`);
    if (action.hermesPlan.cashActionPacketId !== action.cashActionPacketId) {
      errors.push("hermesPlan.cashActionPacketId must match cashActionPacketId");
    }
  }

  // Council summary.
  if (!action.council || typeof action.council !== "object") {
    errors.push("council must be present");
  } else {
    if (!PREPARED_ACTION_READINESS_VALUES.includes(action.council.readiness)) {
      errors.push("council.readiness must be a known readiness value");
    }
    requireText(action.council.verdictDecision, "council.verdictDecision", errors);
    requireText(action.council.recommendedManualAction, "council.recommendedManualAction", errors);
    // Durable run fields (P4b) — optional; validated only when present so rows
    // persisted before these existed stay valid.
    if (action.council.runId !== undefined) {
      requireText(action.council.runId, "council.runId", errors);
    }
    if (action.council.runStatus !== undefined) {
      requireText(action.council.runStatus, "council.runStatus", errors);
    }
    if (
      action.council.turnCount !== undefined &&
      (!Number.isInteger(action.council.turnCount) || action.council.turnCount < 0)
    ) {
      errors.push("council.turnCount must be a non-negative integer");
    }
  }

  // Queue ordering.
  if (!PREPARED_ACTION_PRIORITIES.includes(action.priority)) {
    errors.push("priority must be a known priority");
  }
  if (
    typeof action.priorityScore !== "number" ||
    !Number.isFinite(action.priorityScore) ||
    action.priorityScore < 0
  ) {
    errors.push("priorityScore must be a number >= 0");
  }

  // Status.
  if (!PREPARED_ACTION_STATUSES.includes(action.status)) {
    errors.push("status must be a known status");
  }

  // createdAt — valid ISO string.
  if (typeof action.createdAt !== "string" || isNaN(+new Date(action.createdAt))) {
    errors.push("createdAt must be a valid ISO date string");
  }

  // Governance locks — proposal only, never executes.
  if (action.requiresCeoApproval !== true) {
    errors.push("requiresCeoApproval must be true");
  }
  if (action.requiresManualSend !== true) {
    errors.push("requiresManualSend must be true");
  }
  if (action.noExecutionAuthorized !== true) {
    errors.push("noExecutionAuthorized must be true");
  }

  return { valid: errors.length === 0, errors };
}

// A prepared action is only ever a proposal: it must require approval, require
// manual send, and authorize no execution.
export function isPreparedActionProposalOnly(action: PreparedAction): boolean {
  return (
    action.requiresCeoApproval === true &&
    action.requiresManualSend === true &&
    action.noExecutionAuthorized === true
  );
}

// ---------------------------------------------------------------------------
// SECTION F — Builder
// ---------------------------------------------------------------------------

// The build boundary accepts everything except the governance locks and the
// derived content hash. The builder locks governance to true and derives the
// content hash deterministically, so a prepared action can never be constructed
// in an executable state or with a forged dedup key.
export type BuildPreparedActionInput = Omit<
  PreparedAction,
  "requiresCeoApproval" | "requiresManualSend" | "noExecutionAuthorized" | "contentHash"
>;

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function buildPreparedAction(input: BuildPreparedActionInput): PreparedAction {
  const action: PreparedAction = {
    preparedActionId: input.preparedActionId,
    ventureId: input.ventureId,
    cashActionPacketId: input.cashActionPacketId,
    contentHash: preparedActionContentHashFor(input.packet, input.hermesPlan),
    packet: clone(input.packet),
    council: clone(input.council),
    hermesPlan: clone(input.hermesPlan),
    priority: input.priority,
    priorityScore: input.priorityScore,
    status: input.status,
    createdAt: input.createdAt,
    requiresCeoApproval: true,
    requiresManualSend: true,
    noExecutionAuthorized: true,
  };
  // Only attach supersedesId when present, so the optional field stays absent
  // rather than becoming an explicit `undefined` (keeps output deterministic).
  if (input.supersedesId !== undefined) {
    action.supersedesId = input.supersedesId;
  }
  return action;
}
