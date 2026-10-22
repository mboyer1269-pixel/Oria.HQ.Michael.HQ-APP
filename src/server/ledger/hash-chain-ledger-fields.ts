// src/server/ledger/hash-chain-ledger-fields.ts
//
// Maps action_ledger rows/entries to CanonicalLedgerFields for sealing and audit.

import type { CanonicalJson, CanonicalLedgerFields } from "./hash-chain-canonicalizer.ts";
import type { LedgerChainEntry } from "./hash-chain-verifier.ts";

export type LedgerRowForChain = {
  id: string;
  user_id: string;
  workspace_id: string | null;
  agent_id: string | null;
  skill_id: string | null;
  mission_id: string | null;
  action_type: string;
  event_type: string | null;
  summary: string;
  autonomy_level: number;
  requires_confirmation: boolean;
  payload: CanonicalJson;
  metadata: CanonicalJson;
  created_at: string;
  prev_hash?: string | null;
  entry_hash?: string | null;
  hmac?: string | null;
  canonical_version?: number | null;
};

export function toCanonicalLedgerFields(row: LedgerRowForChain): CanonicalLedgerFields {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    user_id: row.user_id,
    agent_id: row.agent_id,
    skill_id: row.skill_id,
    mission_id: row.mission_id,
    action_type: row.action_type,
    event_type: row.event_type,
    summary: row.summary,
    autonomy_level: row.autonomy_level,
    requires_confirmation: row.requires_confirmation,
    payload: row.payload ?? {},
    metadata: row.metadata ?? {},
    created_at: row.created_at,
  };
}

export function toLedgerChainEntry(row: LedgerRowForChain): LedgerChainEntry | null {
  if (typeof row.entry_hash !== "string" || row.entry_hash.length === 0) {
    return null;
  }

  return {
    ...toCanonicalLedgerFields(row),
    created_at: restorePersistedLedgerTimestamp(row.created_at),
    prev_hash: row.prev_hash ?? null,
    entry_hash: row.entry_hash,
    hmac: row.hmac ?? null,
    canonical_version: row.canonical_version ?? undefined,
  };
}

/** Restore the millisecond ISO text sealed before a timestamptz round trip.
 * Keep nonzero submillisecond precision untouched: rounding could conceal a
 * changed timestamp. Canonical v1 itself remains byte-for-byte unchanged.
 */
export function restorePersistedLedgerTimestamp(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || /[1-9]/.test((match[2] ?? "").slice(3))) return value;
  const instant = new Date(value);
  return Number.isFinite(instant.getTime()) ? instant.toISOString() : value;
}

/** Chain scope key when workspace_id is absent (per-user chain). */
export function resolveLedgerChainScope(workspaceId: string | null | undefined, userId: string): string {
  return workspaceId ?? `user:${userId}`;
}
