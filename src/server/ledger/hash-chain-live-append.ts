// src/server/ledger/hash-chain-live-append.ts
//
// Live seal-on-append adapter for action_ledger inserts.
//
// When LEDGER_HASH_CHAIN_WRITE is OFF (default), resolveChainColumns() returns
// null and the write path persists rows exactly as before — no chain columns.
// When ON, every insert must seal against the workspace tip (fail-closed if the
// HMAC key is missing).

import type { CanonicalJson, CanonicalLedgerFields } from "./hash-chain-canonicalizer.ts";
import { getLedgerHmacKey } from "./hash-chain-hmac-key.ts";
import { isHashChainWriteEnabled } from "./hash-chain-write-flag.ts";
import { planChainWrite, type ChainWriteColumns } from "./hash-chain-write-plan.ts";

export type LiveAppendContent = {
  id: string;
  workspaceId?: string;
  userId: string;
  agentId?: string;
  skillId?: string;
  missionId?: string;
  actionType: string;
  eventType?: string;
  summary: string;
  autonomyLevel: number;
  requiresConfirmation: boolean;
  payload: CanonicalJson;
  metadata: CanonicalJson;
  createdAt: string;
};

export type ChainTip = { entry_hash: string } | null;

/**
 * Plan chain columns for a live append. Returns null when the write flag is OFF.
 * Throws when the flag is ON but sealing cannot complete (missing HMAC key).
 */
export function resolveChainColumns(
  content: LiveAppendContent,
  tip: ChainTip,
  options: {
    enabled?: boolean;
    hmacKey?: string;
    env?: Record<string, string | undefined>;
  } = {},
): ChainWriteColumns | null {
  const env = options.env ?? process.env;
  const enabled = options.enabled ?? isHashChainWriteEnabled(env);
  if (!enabled) return null;

  const hmacKey = options.hmacKey ?? getLedgerHmacKey(env);
  const fields: CanonicalLedgerFields = {
    id: content.id,
    workspace_id: content.workspaceId ?? null,
    user_id: content.userId,
    agent_id: content.agentId ?? null,
    skill_id: content.skillId ?? null,
    mission_id: content.missionId ?? null,
    action_type: content.actionType,
    event_type: content.eventType ?? null,
    summary: content.summary,
    autonomy_level: content.autonomyLevel,
    requires_confirmation: content.requiresConfirmation,
    payload: content.payload,
    metadata: content.metadata,
    created_at: content.createdAt,
  };

  return planChainWrite({
    fields,
    tail: tip,
    hmacKey,
    enabled: true,
  });
}
