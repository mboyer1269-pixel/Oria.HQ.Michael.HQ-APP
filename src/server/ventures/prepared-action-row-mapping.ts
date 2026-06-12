// src/server/ventures/prepared-action-row-mapping.ts
//
// Pure row <-> PreparedAction mapping for the prepared-actions persistence
// layer (the Relay CEO review queue).
//
// Side-effect free. Owns the light validation between the DB row shape
// (snake_case, jsonb packet/council/hermes_plan) and the TypeScript
// PreparedAction contract. It never silently accepts a malformed row: an
// invalid row throws PreparedActionMappingError rather than producing a
// half-populated action. The governance invariants are re-asserted here so the
// local-fallback path is held to the identical standard as the DB CHECKs.

import type {
  PreparedAction,
  PreparedActionCouncilSummary,
  PreparedActionPriority,
  PreparedActionStatus,
} from "@/features/ventures/prepared-action";
import {
  PREPARED_ACTION_PRIORITIES,
  PREPARED_ACTION_STATUSES,
} from "@/features/ventures/prepared-action";
import type { CashActionPacket } from "@/features/ventures/cash-action-packet";
import type { HermesOutreachPlan } from "@/features/ventures/hermes-outreach-plan";
import type { PreparedActionInsert, PreparedActionRow } from "@/server/db/types";

const PRIORITY_SET: ReadonlySet<string> = new Set(PREPARED_ACTION_PRIORITIES);
const STATUS_SET: ReadonlySet<string> = new Set(PREPARED_ACTION_STATUSES);

export class PreparedActionMappingError extends Error {
  constructor(message: string) {
    super(`Prepared action mapping failed: ${message}`);
    this.name = "PreparedActionMappingError";
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new PreparedActionMappingError(`missing or empty required field "${field}"`);
  }
  return value;
}

function requirePriority(value: unknown): PreparedActionPriority {
  if (typeof value !== "string" || !PRIORITY_SET.has(value)) {
    throw new PreparedActionMappingError(`invalid priority "${String(value)}"`);
  }
  return value as PreparedActionPriority;
}

function requireStatus(value: unknown): PreparedActionStatus {
  if (typeof value !== "string" || !STATUS_SET.has(value)) {
    throw new PreparedActionMappingError(`invalid status "${String(value)}"`);
  }
  return value as PreparedActionStatus;
}

function requireScore(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new PreparedActionMappingError("priority_score must be a number >= 0");
  }
  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The same invariants the DB CHECKs enforce, applied here so the local-fallback
// path matches Supabase exactly: a prepared action can never authorize
// execution or auto-send.
function assertGovernanceInvariants(
  requiresCeoApproval: unknown,
  requiresManualSend: unknown,
  noExecutionAuthorized: unknown,
): void {
  if (requiresCeoApproval !== true) {
    throw new PreparedActionMappingError("requires_ceo_approval must be true");
  }
  if (requiresManualSend !== true) {
    throw new PreparedActionMappingError("requires_manual_send must be true");
  }
  if (noExecutionAuthorized !== true) {
    throw new PreparedActionMappingError("no_execution_authorized must be true");
  }
}

/**
 * Builds a DB insert from a PreparedAction. Pure: the DB assigns id and
 * created_at, so they are omitted here. workspaceId and userId are the
 * persistence scope. The governance invariants are forced to literal true.
 */
export function mapPreparedActionToInsert(
  workspaceId: string,
  userId: string,
  action: PreparedAction,
): PreparedActionInsert {
  const ws = requireString(workspaceId, "workspaceId");
  const uid = requireString(userId, "userId");

  assertGovernanceInvariants(
    action.requiresCeoApproval,
    action.requiresManualSend,
    action.noExecutionAuthorized,
  );

  if (!isObject(action.packet)) {
    throw new PreparedActionMappingError("packet must be an object");
  }
  if (!isObject(action.council)) {
    throw new PreparedActionMappingError("council must be an object");
  }
  if (!isObject(action.hermesPlan)) {
    throw new PreparedActionMappingError("hermesPlan must be an object");
  }

  const insert: PreparedActionInsert = {
    workspace_id: ws,
    created_by_user_id: uid,
    prepared_action_id: requireString(action.preparedActionId, "preparedActionId"),
    venture_id: requireString(action.ventureId, "ventureId"),
    cash_action_packet_id: requireString(action.cashActionPacketId, "cashActionPacketId"),
    content_hash: requireString(action.contentHash, "contentHash"),
    supersedes_id: action.supersedesId ?? null,
    packet: action.packet as unknown as PreparedActionInsert["packet"],
    council: action.council as unknown as PreparedActionInsert["council"],
    hermes_plan: action.hermesPlan as unknown as PreparedActionInsert["hermes_plan"],
    priority: requirePriority(action.priority),
    priority_score: requireScore(action.priorityScore),
    status: requireStatus(action.status),
    requires_ceo_approval: true,
    requires_manual_send: true,
    no_execution_authorized: true,
  };

  return insert;
}

/**
 * Builds a PreparedAction from a DB row, validating required fields, the
 * priority/status whitelists, and the governance invariants. The optional
 * supersedesId is omitted when the column is null.
 */
export function mapRowToPreparedAction(row: PreparedActionRow): PreparedAction {
  if (!isObject(row.packet)) {
    throw new PreparedActionMappingError("packet must be an object");
  }
  if (!isObject(row.council)) {
    throw new PreparedActionMappingError("council must be an object");
  }
  if (!isObject(row.hermes_plan)) {
    throw new PreparedActionMappingError("hermes_plan must be an object");
  }

  assertGovernanceInvariants(
    row.requires_ceo_approval,
    row.requires_manual_send,
    row.no_execution_authorized,
  );

  const action: PreparedAction = {
    preparedActionId: requireString(row.prepared_action_id, "prepared_action_id"),
    ventureId: requireString(row.venture_id, "venture_id"),
    cashActionPacketId: requireString(row.cash_action_packet_id, "cash_action_packet_id"),
    contentHash: requireString(row.content_hash, "content_hash"),
    packet: row.packet as unknown as CashActionPacket,
    council: row.council as unknown as PreparedActionCouncilSummary,
    hermesPlan: row.hermes_plan as unknown as HermesOutreachPlan,
    priority: requirePriority(row.priority),
    priorityScore: requireScore(row.priority_score),
    status: requireStatus(row.status),
    createdAt: requireString(row.created_at, "created_at"),
    requiresCeoApproval: true,
    requiresManualSend: true,
    noExecutionAuthorized: true,
  };

  if (row.supersedes_id !== null && row.supersedes_id !== undefined) {
    action.supersedesId = requireString(row.supersedes_id, "supersedes_id");
  }

  return action;
}
