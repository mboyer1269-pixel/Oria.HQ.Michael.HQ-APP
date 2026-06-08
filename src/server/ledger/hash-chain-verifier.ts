// src/server/ledger/hash-chain-verifier.ts
//
// Pure, in-memory verifier for the future action_ledger hash chain.
//
// It reads NOTHING from the database and writes NOTHING. It is the proof
// mechanism the plan (docs/security/action-ledger-hash-chain-plan.md) requires
// BEFORE any 🔴 migration: given a list of ledger-like entries, it confirms the
// chain is intact, or reports exactly where and why it breaks.
//
// FAIL-CLOSED: any missing field, hash mismatch, broken linkage, or bad hmac
// returns { ok: false, ... }. There is no path that silently passes.

import { createHmac, timingSafeEqual } from "node:crypto";
import {
  CANONICAL_VERSION,
  computeEntryHash,
  type CanonicalLedgerFields,
} from "./hash-chain-canonicalizer.ts";

/** A ledger entry plus the chain seal fields, as it would be persisted. */
export type LedgerChainEntry = CanonicalLedgerFields & {
  prev_hash: string | null;
  entry_hash: string;
  hmac?: string | null;
  canonical_version?: number;
};

export type VerifyChainOptions = {
  /**
   * When provided, every entry's `hmac` is checked against
   * hmac_sha256(key, entry_hash). This is a TEST/INJECTED key only — the
   * verifier never reads a key from the environment.
   */
  hmacKey?: string;
};

export type VerifyChainResult =
  | { ok: true; count: number }
  | { ok: false; brokenAt: number; reason: string; entryId?: string };

/** hmac_sha256(key, entryHash) as hex. Key is caller-provided, never from env. */
export function computeHmac(entryHash: string, key: string): string {
  return createHmac("sha256", key).update(entryHash, "utf8").digest("hex");
}

/** Constant-time hex comparison; length mismatch is an immediate non-match. */
function hexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

/**
 * Verify an in-memory ledger chain in order.
 *
 * Checks, per entry:
 *  1. required hash fields are present and well-typed;
 *  2. linkage — entry[0].prev_hash is null (genesis); entry[i].prev_hash equals
 *     entry[i-1].entry_hash;
 *  3. entry_hash recomputed from canonical content + prev_hash matches stored;
 *  4. (optional) hmac matches hmac_sha256(hmacKey, entry_hash).
 *
 * @returns { ok: true, count } or { ok: false, brokenAt, reason, entryId }.
 */
export function verifyChain(
  entries: readonly LedgerChainEntry[],
  options: VerifyChainOptions = {},
): VerifyChainResult {
  const { hmacKey } = options;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    // 1. Required hash fields present and well-typed.
    if (typeof entry.entry_hash !== "string" || entry.entry_hash.length === 0) {
      return { ok: false, brokenAt: i, reason: "missing entry_hash", entryId: entry.id };
    }
    if (!(entry.prev_hash === null || typeof entry.prev_hash === "string")) {
      return { ok: false, brokenAt: i, reason: "invalid prev_hash field", entryId: entry.id };
    }

    // 2. Linkage.
    if (i === 0) {
      if (entry.prev_hash !== null && entry.prev_hash !== "") {
        return {
          ok: false,
          brokenAt: 0,
          reason: "genesis entry must have null prev_hash",
          entryId: entry.id,
        };
      }
    } else if (entry.prev_hash !== entries[i - 1].entry_hash) {
      return {
        ok: false,
        brokenAt: i,
        reason: "prev_hash does not match previous entry_hash",
        entryId: entry.id,
      };
    }

    // 3. Recompute entry_hash from canonical content + prev_hash.
    const version = entry.canonical_version ?? CANONICAL_VERSION;
    let recomputed: string;
    try {
      recomputed = computeEntryHash(entry, entry.prev_hash ?? null, version);
    } catch (err) {
      return {
        ok: false,
        brokenAt: i,
        reason: `canonicalization failed: ${(err as Error).message}`,
        entryId: entry.id,
      };
    }
    if (!hexEqual(recomputed, entry.entry_hash)) {
      return {
        ok: false,
        brokenAt: i,
        reason: "entry_hash mismatch (tampered content or prev_hash)",
        entryId: entry.id,
      };
    }

    // 4. Optional hmac verification.
    if (hmacKey !== undefined) {
      if (typeof entry.hmac !== "string" || entry.hmac.length === 0) {
        return { ok: false, brokenAt: i, reason: "missing hmac (key provided)", entryId: entry.id };
      }
      if (!hexEqual(computeHmac(entry.entry_hash, hmacKey), entry.hmac)) {
        return { ok: false, brokenAt: i, reason: "hmac mismatch", entryId: entry.id };
      }
    }
  }

  return { ok: true, count: entries.length };
}
