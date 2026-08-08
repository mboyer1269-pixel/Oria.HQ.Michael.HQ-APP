// src/server/ledger/hash-chain-write-plan.ts
//
// Write-contract for the live hash-chain seal-on-append path.
//
// Wired into action-ledger-repository.ts via sealNewLedgerRow(). When the
// feature flag is ON (default), every new ledger row is sealed with prev_hash,
// entry_hash, and hmac before persistence.
//
// PURE: no DB, no env read for secrets. The HMAC key is an explicit argument the
// caller will source from the environment at GO; it is never read here.

import { CANONICAL_VERSION, type CanonicalLedgerFields } from "./hash-chain-canonicalizer.ts";
import { sealLedgerEntry } from "./hash-chain-sealer.ts";
import type { LedgerChainEntry } from "./hash-chain-verifier.ts";
import { isHashChainWriteEnabled } from "./hash-chain-write-flag.ts";

/** The chain columns persisted alongside a ledger row once sealing is live. */
export type ChainWriteColumns = {
  prev_hash: string | null;
  entry_hash: string;
  hmac: string | null;
  canonical_version: number;
};

export type PlanChainWriteInput = {
  /** Canonical content fields of the row being appended. */
  fields: CanonicalLedgerFields;
  /** Current chain tip for this workspace, or null for the genesis row. */
  tail: LedgerChainEntry | null;
  /** HMAC key — supplied by the caller (from env at GO); required when enabled. */
  hmacKey?: string;
  /** Overrides the flag for testing; defaults to isHashChainWriteEnabled(). */
  enabled?: boolean;
};

/**
 * Plan the chain columns for a new ledger row.
 *
 * Returns `null` when the feature is OFF (current behavior: no chain columns).
 * When ON, seals the row against the tail's entry_hash and returns the columns.
 * Throws when ON without an hmacKey — fail-closed, never write a half-sealed row.
 */
export function planChainWrite(input: PlanChainWriteInput): ChainWriteColumns | null {
  const enabled = input.enabled ?? isHashChainWriteEnabled();
  if (!enabled) return null;

  if (typeof input.hmacKey !== "string" || input.hmacKey.length === 0) {
    throw new Error(
      "planChainWrite: hmacKey is required when the hash-chain write path is enabled.",
    );
  }

  const sealed: LedgerChainEntry = sealLedgerEntry(input.fields, {
    prevHash: input.tail?.entry_hash ?? null,
    hmacKey: input.hmacKey,
  });

  return {
    prev_hash: sealed.prev_hash,
    entry_hash: sealed.entry_hash,
    hmac: sealed.hmac ?? null,
    canonical_version: sealed.canonical_version ?? CANONICAL_VERSION,
  };
}
