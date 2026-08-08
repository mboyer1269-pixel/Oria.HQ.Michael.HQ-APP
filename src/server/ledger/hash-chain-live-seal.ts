// src/server/ledger/hash-chain-live-seal.ts
//
// Live seal-on-append helpers for the action_ledger write path.
//
// When LEDGER_HASH_CHAIN_WRITE is OFF (default), every helper is a no-op and the
// write path behaves exactly as before. When ON, callers must supply an HMAC key
// (from LEDGER_HMAC_KEY in the environment) and seal each new row against the
// workspace chain tip before insert.
//
// Secrets: this module may read LEDGER_HMAC_KEY from env for the live path, but
// never logs, returns, or serializes the key value.

import type { CanonicalJson, CanonicalLedgerFields } from "./hash-chain-canonicalizer.ts";
import type { LedgerChainEntry } from "./hash-chain-verifier.ts";
import {
  planChainWrite,
  type ChainWriteColumns,
} from "./hash-chain-write-plan.ts";
import { isHashChainWriteEnabled } from "./hash-chain-write-flag.ts";

/** Env name for the HMAC seal key. Never commit real values. */
export const LEDGER_HMAC_KEY_ENV = "LEDGER_HMAC_KEY";

export type LiveSealContext = {
  id: string;
  userId: string;
  workspaceId?: string;
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

/**
 * Read LEDGER_HMAC_KEY from env. Returns undefined when absent/empty.
 * Never logs the value.
 */
export function getLedgerHmacKey(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const raw = env[LEDGER_HMAC_KEY_ENV];
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Map a write-path record into canonical ledger fields for sealing. */
export function toCanonicalLedgerFields(input: LiveSealContext): CanonicalLedgerFields {
  return {
    id: input.id,
    workspace_id: input.workspaceId ?? null,
    user_id: input.userId,
    agent_id: input.agentId ?? null,
    skill_id: input.skillId ?? null,
    mission_id: input.missionId ?? null,
    action_type: input.actionType,
    event_type: input.eventType ?? null,
    summary: input.summary,
    autonomy_level: input.autonomyLevel,
    requires_confirmation: input.requiresConfirmation,
    payload: input.payload,
    metadata: input.metadata,
    created_at: input.createdAt,
  };
}

/**
 * Plan chain columns for a new ledger row.
 *
 * Returns null when the write flag is OFF. When ON, seals against `tail` and
 * throws if the HMAC key is missing — fail-closed, never persist a half-sealed
 * row.
 */
export function sealLiveLedgerEntry(input: {
  fields: LiveSealContext;
  tail: LedgerChainEntry | null;
  enabled?: boolean;
  hmacKey?: string;
  env?: Record<string, string | undefined>;
}): ChainWriteColumns | null {
  const env = input.env ?? process.env;
  const enabled = input.enabled ?? isHashChainWriteEnabled(env);
  if (!enabled) return null;

  const hmacKey = input.hmacKey ?? getLedgerHmacKey(env);
  return planChainWrite({
    fields: toCanonicalLedgerFields(input.fields),
    tail: input.tail,
    enabled: true,
    hmacKey,
  });
}

/**
 * Build a minimal tip entry from stored chain columns for the next seal.
 * Returns null when the tip has no entry_hash (unsealed / pre-backfill).
 */
export function tipFromStoredChain(input: {
  id: string;
  entryHash: string | null | undefined;
  prevHash?: string | null;
  hmac?: string | null;
  canonicalVersion?: number | null;
  /** Canonical content fields when available; tip linkage only needs entry_hash. */
  content?: Partial<CanonicalLedgerFields>;
}): LedgerChainEntry | null {
  if (typeof input.entryHash !== "string" || input.entryHash.length === 0) {
    return null;
  }

  const content = input.content ?? {};
  return {
    id: input.id,
    workspace_id: content.workspace_id ?? null,
    user_id: content.user_id ?? "",
    agent_id: content.agent_id ?? null,
    skill_id: content.skill_id ?? null,
    mission_id: content.mission_id ?? null,
    action_type: content.action_type ?? "",
    event_type: content.event_type ?? null,
    summary: content.summary ?? "",
    autonomy_level: content.autonomy_level ?? 0,
    requires_confirmation: content.requires_confirmation ?? false,
    payload: content.payload ?? {},
    metadata: content.metadata ?? {},
    created_at: content.created_at ?? "",
    prev_hash: input.prevHash ?? null,
    entry_hash: input.entryHash,
    hmac: input.hmac ?? null,
    canonical_version: input.canonicalVersion ?? undefined,
  };
}
