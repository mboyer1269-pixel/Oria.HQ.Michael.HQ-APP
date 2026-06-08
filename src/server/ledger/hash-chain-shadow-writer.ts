// src/server/ledger/hash-chain-shadow-writer.ts
//
// In-memory shadow writer for the action_ledger hash chain.
//
// Maintains a growing chain of sealed entries in memory, using the same
// primitives as the future DB-backed write path (appendSealedEntry from the
// sealer, verifyChain from the verifier). No DB access, no env reads, no
// runtime dispatch — completely pure.
//
// Intended uses:
//   - Integration tests that need a real sealed chain without a database.
//   - Local/dev mode when local-persistence fallback is active.
//   - Proving the full write → verify round-trip before any migration is needed.
//
// This module does NOT touch the existing action_ledger write path.

import {
  appendSealedEntry,
  type AppendSealedEntryOptions,
  type SealableEntry,
} from "./hash-chain-sealer.ts";
import {
  verifyChain,
  type LedgerChainEntry,
  type VerifyChainResult,
} from "./hash-chain-verifier.ts";

// ─── Public types ────────────────────────────────────────────────────────────

export type ShadowChainWriterOptions = {
  /** HMAC key — explicit argument only, never read from the environment. */
  hmacKey: string;
  /** Canonicalization version. Defaults to CANONICAL_VERSION (1). */
  canonicalVersion?: number;
  /**
   * When true, verifyChain is called after every append.
   * Off by default; enable in paranoid test scenarios.
   */
  verifyOnAppend?: boolean;
};

// ─── ShadowChainWriter ───────────────────────────────────────────────────────

/**
 * Stateful, in-memory ledger chain writer.
 *
 * Each call to `append()` seals the entry (computing prev_hash, entry_hash,
 * and hmac) and pushes it onto the internal chain. The chain grows monotonically
 * until `reset()` is called.
 *
 * @example
 *   const writer = new ShadowChainWriter({ hmacKey: "..." });
 *   const entry  = writer.append({ id: "...", ...contentFields });
 *   const result = writer.verify(); // { ok: true, count: 1 }
 */
export class ShadowChainWriter {
  private readonly hmacKey: string;
  private readonly canonicalVersion: number | undefined;
  private readonly verifyOnAppend: boolean;
  private chain: LedgerChainEntry[];

  constructor(options: ShadowChainWriterOptions) {
    if (typeof options.hmacKey !== "string" || options.hmacKey.length === 0) {
      throw new Error("ShadowChainWriter: hmacKey is required and must be a non-empty string.");
    }
    this.hmacKey = options.hmacKey;
    this.canonicalVersion = options.canonicalVersion;
    this.verifyOnAppend = options.verifyOnAppend ?? false;
    this.chain = [];
  }

  /**
   * Append a new sealed entry to the chain.
   *
   * Seals `entry` with the configured hmacKey, deriving prev_hash from the
   * current tail (null for the genesis entry). Returns the sealed entry.
   */
  append(entry: SealableEntry): LedgerChainEntry {
    const opts: AppendSealedEntryOptions = {
      hmacKey: this.hmacKey,
      ...(this.canonicalVersion !== undefined && { canonicalVersion: this.canonicalVersion }),
      ...(this.verifyOnAppend && { verify: true }),
    };
    this.chain = appendSealedEntry(this.chain, entry, opts);
    return this.chain[this.chain.length - 1]!;
  }

  /**
   * Return a frozen snapshot of the current chain.
   * The returned array is a shallow copy — mutations to it do not affect state.
   */
  getChain(): readonly LedgerChainEntry[] {
    return Object.freeze([...this.chain]);
  }

  /** Return the most recently appended entry, or null if the chain is empty. */
  getTail(): LedgerChainEntry | null {
    return this.chain.length > 0 ? this.chain[this.chain.length - 1]! : null;
  }

  /** Number of entries currently in the chain. */
  get length(): number {
    return this.chain.length;
  }

  /**
   * Verify the full in-memory chain using the configured hmacKey.
   * Returns VerifyChainResult ({ ok: true, count } or { ok: false, ... }).
   */
  verify(): VerifyChainResult {
    return verifyChain(this.chain, { hmacKey: this.hmacKey });
  }

  /**
   * Reset the chain to empty.
   * Useful for test teardown — discards all in-memory entries.
   */
  reset(): void {
    this.chain = [];
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create a fresh ShadowChainWriter instance.
 * Convenience wrapper over `new ShadowChainWriter(options)`.
 */
export function createShadowChainWriter(options: ShadowChainWriterOptions): ShadowChainWriter {
  return new ShadowChainWriter(options);
}
