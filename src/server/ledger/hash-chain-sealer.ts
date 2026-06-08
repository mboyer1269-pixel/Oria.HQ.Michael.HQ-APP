// src/server/ledger/hash-chain-sealer.ts
//
// Pure, in-memory seal service for the future action_ledger hash chain.
//
// It turns content-only ledger entries into SEALED entries (prev_hash,
// entry_hash, hmac, canonical_version) using the canonicalizer/verifier
// primitives from #235. It is the proof-side companion to the verifier:
// together they show a chain can be produced and validated entirely in memory
// BEFORE any 🔴 migration wires sealing into the real write path.
//
// PURE: no DB read/write, no env, no HMAC key from environment (the key is an
// explicit argument), no timestamps generated, no randomness. This module does
// NOT touch the existing action_ledger write path.

import {
  CANONICAL_VERSION,
  computeEntryHash,
  type CanonicalLedgerFields,
} from "./hash-chain-canonicalizer.ts";
import {
  computeHmac,
  verifyChain,
  type LedgerChainEntry,
} from "./hash-chain-verifier.ts";

/**
 * Input to the sealer: the content fields, which MUST NOT already carry seal
 * fields (prev_hash/entry_hash/hmac) unless `overwrite` is set.
 */
export type SealableEntry = CanonicalLedgerFields & {
  prev_hash?: string | null;
  entry_hash?: string;
  hmac?: string | null;
  canonical_version?: number;
};

export type SealLedgerEntryOptions = {
  /** Predecessor's entry_hash, or null for the genesis entry. Empty string is rejected. */
  prevHash: string | null;
  /** HMAC key — explicit argument only, never read from the environment. */
  hmacKey: string;
  /** Canonicalization version. Defaults to the current CANONICAL_VERSION. */
  canonicalVersion?: number;
  /** Allow input that already carries seal fields to be re-sealed. */
  overwrite?: boolean;
};

function assertSealInputs(input: SealableEntry, options: SealLedgerEntryOptions): void {
  const { prevHash, hmacKey, canonicalVersion = CANONICAL_VERSION, overwrite = false } = options;

  if (typeof hmacKey !== "string" || hmacKey.length === 0) {
    throw new Error("sealLedgerEntry: hmacKey is required and must be a non-empty string.");
  }
  if (prevHash !== null && (typeof prevHash !== "string" || prevHash.length === 0)) {
    throw new Error("sealLedgerEntry: prevHash must be null (genesis) or a non-empty string.");
  }
  if (canonicalVersion !== CANONICAL_VERSION) {
    throw new Error(`sealLedgerEntry: unsupported canonical_version: ${canonicalVersion}`);
  }
  if (!overwrite && (input.prev_hash !== undefined || input.entry_hash !== undefined || input.hmac !== undefined)) {
    throw new Error(
      "sealLedgerEntry: input already carries seal fields (prev_hash/entry_hash/hmac); pass overwrite:true to re-seal.",
    );
  }
}

/**
 * Seal a single content entry into a chained, HMAC'd ledger entry.
 *
 * entry_hash is computed only from canonical content + prevHash; any stale seal
 * fields on the input are recomputed (and overwritten in the output), so a
 * re-seal always reflects the current content.
 */
export function sealLedgerEntry(
  input: SealableEntry,
  options: SealLedgerEntryOptions,
): LedgerChainEntry {
  assertSealInputs(input, options);

  const { prevHash, hmacKey, canonicalVersion = CANONICAL_VERSION } = options;

  const entryHash = computeEntryHash(input, prevHash, canonicalVersion);
  const hmac = computeHmac(entryHash, hmacKey);

  return {
    ...input,
    prev_hash: prevHash,
    entry_hash: entryHash,
    hmac,
    canonical_version: canonicalVersion,
  };
}

export type AppendSealedEntryOptions = {
  /** HMAC key — explicit argument only, never read from the environment. */
  hmacKey: string;
  canonicalVersion?: number;
  overwrite?: boolean;
  /** When true, verify the resulting chain and throw if it does not verify. */
  verify?: boolean;
};

/**
 * Append a sealed entry to an in-memory chain. Pure: returns a NEW array and
 * never mutates the input chain. prev_hash is derived from the last entry's
 * entry_hash (null for an empty chain / genesis).
 */
export function appendSealedEntry(
  chain: readonly LedgerChainEntry[],
  entry: SealableEntry,
  options: AppendSealedEntryOptions,
): LedgerChainEntry[] {
  const prevHash = chain.length === 0 ? null : chain[chain.length - 1].entry_hash;

  const sealed = sealLedgerEntry(entry, {
    prevHash,
    hmacKey: options.hmacKey,
    canonicalVersion: options.canonicalVersion,
    overwrite: options.overwrite,
  });

  const next = [...chain, sealed];

  if (options.verify) {
    const result = verifyChain(next, { hmacKey: options.hmacKey });
    if (!result.ok) {
      throw new Error(
        `appendSealedEntry: resulting chain failed verification at index ${result.brokenAt}: ${result.reason}`,
      );
    }
  }

  return next;
}
