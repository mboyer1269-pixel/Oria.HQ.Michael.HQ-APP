// src/server/ledger/hash-chain-live-write.ts
//
// Live write-path helpers for seal-on-append when LEDGER_HASH_CHAIN_WRITE is ON.
//
// Flag OFF (default): callers skip this module entirely and persist rows exactly
// as before. Flag ON: callers must supply an HMAC key, resolve the workspace
// chain tip, and persist the returned chain columns alongside the row.
//
// Secrets: LEDGER_HMAC_KEY is read only here (the write-path boundary). Pure
// seal/verify modules still take the key as an explicit argument.

import { randomUUID } from "node:crypto";
import type { CanonicalJson, CanonicalLedgerFields } from "./hash-chain-canonicalizer.ts";
import type { LedgerChainEntry } from "./hash-chain-verifier.ts";
import { isHashChainWriteEnabled } from "./hash-chain-write-flag.ts";
import { planChainWrite, type ChainWriteColumns } from "./hash-chain-write-plan.ts";

/** Env secret name — never logged, never committed. */
export const LEDGER_HMAC_KEY_ENV = "LEDGER_HMAC_KEY";

export type LiveSealIdentity = {
  id: string;
  createdAt: string;
};

export type LiveSealInput = {
  identity: LiveSealIdentity;
  workspaceId?: string;
  userId: string;
  agentId?: string;
  skillId?: string;
  missionId?: string;
  actionType: string;
  eventType?: string | null;
  summary: string;
  autonomyLevel: number;
  requiresConfirmation: boolean;
  payload: CanonicalJson;
  metadata: CanonicalJson;
  /** Current workspace tip, or null for genesis / empty chain. */
  tail: LedgerChainEntry | null;
  hmacKey: string;
};

/**
 * Read the HMAC key from env. Returns undefined when absent/empty so callers
 * can fail closed before writing a half-sealed row.
 */
export function getLedgerHmacKey(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const raw = env[LEDGER_HMAC_KEY_ENV];
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Pre-allocate id + created_at so the seal binds the same values that persist. */
export function allocateLedgerSealIdentity(
  now: Date = new Date(),
): LiveSealIdentity {
  return {
    id: randomUUID(),
    createdAt: now.toISOString(),
  };
}

export function toCanonicalLedgerFields(input: {
  identity: LiveSealIdentity;
  workspaceId?: string;
  userId: string;
  agentId?: string;
  skillId?: string;
  missionId?: string;
  actionType: string;
  eventType?: string | null;
  summary: string;
  autonomyLevel: number;
  requiresConfirmation: boolean;
  payload: CanonicalJson;
  metadata: CanonicalJson;
}): CanonicalLedgerFields {
  return {
    id: input.identity.id,
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
    created_at: input.identity.createdAt,
  };
}

/**
 * Seal a new ledger row for persistence. Requires the write flag ON and a
 * non-empty hmacKey. Throws when enabled without a key (fail-closed).
 */
export function sealLiveLedgerAppend(input: LiveSealInput): ChainWriteColumns {
  const columns = planChainWrite({
    fields: toCanonicalLedgerFields(input),
    tail: input.tail,
    hmacKey: input.hmacKey,
    enabled: true,
  });

  if (!columns) {
    throw new Error(
      "sealLiveLedgerAppend: planChainWrite returned null while seal was requested.",
    );
  }

  return columns;
}

/**
 * Resolve whether the live seal path should run for this process.
 * Returns the hmac key when sealing is required; null when the flag is OFF.
 * Throws when the flag is ON but the key is missing.
 */
export function requireLiveSealHmacKey(
  env: Record<string, string | undefined> = process.env,
): string | null {
  if (!isHashChainWriteEnabled(env)) return null;

  const key = getLedgerHmacKey(env);
  if (!key) {
    throw new Error(
      `LEDGER_HASH_CHAIN_WRITE is enabled but ${LEDGER_HMAC_KEY_ENV} is missing or empty.`,
    );
  }

  return key;
}

/** Pick the tip from sealed local entries (oldest→newest; tip = last with entry_hash). */
export function resolveLocalChainTail(
  entries: ReadonlyArray<{
    workspaceId?: string;
    entryHash?: string;
    prevHash?: string | null;
    hmac?: string | null;
    canonicalVersion?: number;
    id: string;
    userId: string;
    agentId?: string;
    skillId?: string;
    missionId?: string;
    actionType: string;
    eventType?: string | null;
    summary: string;
    autonomyLevel: number;
    requiresConfirmation: boolean;
    payload: unknown;
    metadata: unknown;
    createdAt: string;
  }>,
  workspaceId: string | undefined,
): LedgerChainEntry | null {
  const sealed = entries
    .filter((entry): entry is typeof entry & { entryHash: string } => {
      if (typeof entry.entryHash !== "string" || entry.entryHash.length === 0) return false;
      if (workspaceId === undefined) return entry.workspaceId === undefined;
      return entry.workspaceId === workspaceId;
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const tip = sealed[sealed.length - 1];
  if (!tip) return null;

  return {
    id: tip.id,
    workspace_id: tip.workspaceId ?? null,
    user_id: tip.userId,
    agent_id: tip.agentId ?? null,
    skill_id: tip.skillId ?? null,
    mission_id: tip.missionId ?? null,
    action_type: tip.actionType,
    event_type: tip.eventType ?? null,
    summary: tip.summary,
    autonomy_level: tip.autonomyLevel,
    requires_confirmation: tip.requiresConfirmation,
    payload: tip.payload as CanonicalJson,
    metadata: tip.metadata as CanonicalJson,
    created_at: tip.createdAt,
    prev_hash: tip.prevHash ?? null,
    entry_hash: tip.entryHash,
    hmac: tip.hmac ?? null,
    canonical_version: tip.canonicalVersion,
  };
}
