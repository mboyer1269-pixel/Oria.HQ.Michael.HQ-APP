// src/server/ledger/hash-chain-workspace-audit.ts
//
// Read-only audit projection for the CEO cockpit panel. Converts sealed
// ActionLedgerEntry rows into LedgerChainEntry form, runs auditChain(), and
// returns a UI-safe report (no HMAC key material).

import type { ActionLedgerEntry } from "@/server/actions/action-ledger-repository";
import type { CanonicalJson } from "./hash-chain-canonicalizer.ts";
import { auditChain, type ChainAuditReport } from "./hash-chain-audit.ts";
import type { LedgerChainEntry } from "./hash-chain-verifier.ts";
import { getLedgerHmacKey } from "./hash-chain-live-write.ts";
import { isHashChainWriteEnabled } from "./hash-chain-write-flag.ts";

export type WorkspaceChainAudit = {
  writeEnabled: boolean;
  hmacConfigured: boolean;
  sealedCount: number;
  totalCount: number;
  report: ChainAuditReport | null;
  /** Newest→oldest tip preview for the panel (max 8). */
  tipPreview: Array<{
    id: string;
    createdAt: string;
    actionType: string;
    summary: string;
    entryHashShort: string;
    prevHashShort: string | null;
  }>;
};

function toChainEntry(entry: ActionLedgerEntry): LedgerChainEntry | null {
  if (typeof entry.entryHash !== "string" || entry.entryHash.length === 0) {
    return null;
  }

  return {
    id: entry.id,
    workspace_id: entry.workspaceId ?? null,
    user_id: entry.userId,
    agent_id: entry.agentId ?? null,
    skill_id: entry.skillId ?? null,
    mission_id: entry.missionId ?? null,
    action_type: entry.actionType,
    event_type: entry.eventType ?? null,
    summary: entry.summary,
    autonomy_level: entry.autonomyLevel,
    requires_confirmation: entry.requiresConfirmation,
    payload: entry.payload as CanonicalJson,
    metadata: entry.metadata as CanonicalJson,
    created_at: entry.createdAt,
    prev_hash: entry.prevHash ?? null,
    entry_hash: entry.entryHash,
    hmac: entry.hmac ?? null,
    canonical_version: entry.canonicalVersion,
  };
}

function shortHash(value: string | null | undefined): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  return `${value.slice(0, 10)}…${value.slice(-6)}`;
}

/**
 * Build a workspace chain audit for the cockpit. Entries may be newest-first
 * (activity read model); this sorts ascending before verification.
 */
export function auditWorkspaceLedgerChain(
  entries: readonly ActionLedgerEntry[],
  env: Record<string, string | undefined> = process.env,
): WorkspaceChainAudit {
  const writeEnabled = isHashChainWriteEnabled(env);
  const hmacKey = getLedgerHmacKey(env);
  const hmacConfigured = Boolean(hmacKey);

  const sealed = entries
    .map(toChainEntry)
    .filter((entry): entry is LedgerChainEntry => entry !== null)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  const report =
    sealed.length === 0
      ? null
      : auditChain(sealed, hmacKey ? { hmacKey } : {});

  const tipPreview = [...sealed]
    .reverse()
    .slice(0, 8)
    .map((entry) => ({
      id: entry.id,
      createdAt: entry.created_at,
      actionType: entry.action_type,
      summary: entry.summary,
      entryHashShort: shortHash(entry.entry_hash) ?? "—",
      prevHashShort: shortHash(entry.prev_hash),
    }));

  return {
    writeEnabled,
    hmacConfigured,
    sealedCount: sealed.length,
    totalCount: entries.length,
    report,
    tipPreview,
  };
}
