// src/server/ventures/cash-signal-intake-row-mapping.ts
//
// Pure row <-> CashSignalIntake mapping for the cash-signal persistence layer.
//
// Side-effect free. Owns the light validation between the DB row shape
// (snake_case, jsonb evidence_ref) and the TypeScript CashSignalIntake
// contract. It never silently accepts a malformed row: an invalid row throws
// CashSignalIntakeMappingError rather than producing a half-populated intake.

import type { CashSignalType } from "@/features/ventures/cash-action-packet";
import { CASH_SIGNAL_TYPES } from "@/features/ventures/cash-action-packet";
import type { CashSignalIntake } from "@/features/ventures/cash-signal-intake";
import type { EvidenceRef } from "@/features/ventures/evidence-ref";
import type { CashSignalIntakeInsert, CashSignalIntakeRow, Json } from "@/server/db/types";

const SIGNAL_TYPE_SET: ReadonlySet<string> = new Set(CASH_SIGNAL_TYPES);

export class CashSignalIntakeMappingError extends Error {
  constructor(message: string) {
    super(`Cash signal intake mapping failed: ${message}`);
    this.name = "CashSignalIntakeMappingError";
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new CashSignalIntakeMappingError(`missing or empty required field "${field}"`);
  }
  return value;
}

function requireSignalType(value: unknown): CashSignalType {
  if (typeof value !== "string" || !SIGNAL_TYPE_SET.has(value)) {
    throw new CashSignalIntakeMappingError(`invalid signal_type "${String(value)}"`);
  }
  return value as CashSignalType;
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new CashSignalIntakeMappingError(`field "${field}" must be a boolean`);
  }
  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The same accounting invariant the DB enforces, applied in the mapping so the
// local-fallback path is held to the identical standard as Supabase: a positive
// amount is only valid for a verified financial signal.
function assertCashInvariant(
  amountCents: number | null,
  signalType: CashSignalType,
  isVerified: boolean,
): void {
  if (amountCents === null || amountCents === 0) return;
  if (amountCents < 0) {
    throw new CashSignalIntakeMappingError("amount_cents must be >= 0");
  }
  const isVerifiedFinancial =
    isVerified === true && (signalType === "stripe_charge" || signalType === "signed_loi");
  if (!isVerifiedFinancial) {
    throw new CashSignalIntakeMappingError(
      "a positive amount requires a verified financial signal (verified stripe_charge or signed_loi)",
    );
  }
}

/**
 * Builds a DB insert from a CashSignalIntake. Pure: the DB assigns id and
 * created_at, so they are omitted here. workspaceId and userId are the
 * persistence scope.
 */
export function mapIntakeToInsert(
  workspaceId: string,
  userId: string,
  intake: CashSignalIntake,
): CashSignalIntakeInsert {
  const ws = requireString(workspaceId, "workspaceId");
  const uid = requireString(userId, "userId");
  const signalType = requireSignalType(intake.signalType);
  const amountCents =
    intake.amountCents === undefined || intake.amountCents === null ? null : intake.amountCents;

  assertCashInvariant(amountCents, signalType, intake.isVerified);

  return {
    workspace_id: ws,
    captured_by_user_id: uid,
    signal_id: requireString(intake.signalId, "signalId"),
    packet_id: requireString(intake.packetId, "packetId"),
    venture_id: requireString(intake.ventureId, "ventureId"),
    source_agent_id: requireString(intake.sourceAgentId, "sourceAgentId"),
    signal_type: signalType,
    reference_id: requireString(intake.referenceId, "referenceId"),
    is_verified: requireBoolean(intake.isVerified, "isVerified"),
    amount_cents: amountCents,
    summary: requireString(intake.summary, "summary"),
    captured_at: requireString(intake.capturedAt, "capturedAt"),
    evidence_ref: intake.evidenceRef as unknown as Json,
  };
}

/**
 * Builds a CashSignalIntake from a DB row, validating required fields, the
 * signal_type whitelist, and the accounting invariant. The optional amountCents
 * is omitted when the column is null.
 */
export function mapRowToIntake(row: CashSignalIntakeRow): CashSignalIntake {
  const evidenceRef = row.evidence_ref;
  if (!isObject(evidenceRef)) {
    throw new CashSignalIntakeMappingError("evidence_ref must be an object");
  }

  const signalType = requireSignalType(row.signal_type);
  const isVerified = requireBoolean(row.is_verified, "is_verified");
  const amountCents =
    row.amount_cents === null || row.amount_cents === undefined ? null : row.amount_cents;

  assertCashInvariant(amountCents, signalType, isVerified);

  const intake: CashSignalIntake = {
    signalId: requireString(row.signal_id, "signal_id"),
    packetId: requireString(row.packet_id, "packet_id"),
    ventureId: requireString(row.venture_id, "venture_id"),
    sourceAgentId: requireString(row.source_agent_id, "source_agent_id"),
    signalType,
    referenceId: requireString(row.reference_id, "reference_id"),
    isVerified,
    summary: requireString(row.summary, "summary"),
    capturedAt: requireString(row.captured_at, "captured_at"),
    evidenceRef: evidenceRef as unknown as EvidenceRef,
  };

  if (amountCents !== null) {
    intake.amountCents = amountCents;
  }

  return intake;
}
