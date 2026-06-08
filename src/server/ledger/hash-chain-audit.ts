// src/server/ledger/hash-chain-audit.ts
//
// Operator-facing audit-report layer over the pure hash-chain verifier.
//
// verifyChain() answers the boolean proof question ("is this chain intact, and
// if not, where does it first break?"). auditChain() turns that into a
// structured, log/operator-readable report: how many entries were proven intact,
// the genesis and tip ids, whether the hmac was checked, and a one-line summary.
//
// This is the reporting primitive the hash-chain plan
// (docs/security/action-ledger-hash-chain-plan.md) calls for when AUDITING a
// chain — e.g. an Operator Snapshot "Ledger Health" panel or an audit log line.
//
// Pure: reads NOTHING from the database or environment, writes NOTHING, and
// does not touch the live action_ledger path. It only inspects the entries and
// the VerifyChainResult it is given.

import {
  verifyChain,
  type LedgerChainEntry,
  type VerifyChainOptions,
} from "./hash-chain-verifier.ts";

// ─── Public types ────────────────────────────────────────────────────────────

export type ChainAuditReport = {
  /** True when the whole chain verified intact. */
  ok: boolean;
  /** Total entries examined. */
  count: number;
  /**
   * Entries proven intact. Equals `count` when ok; equals `brokenAt` when the
   * chain breaks (entries 0..brokenAt-1 verified before the first bad link).
   */
  verifiedCount: number;
  /** id of the genesis (first) entry, or null for an empty chain. */
  genesisId: string | null;
  /** id of the tip (last) entry, or null for an empty chain. */
  tipId: string | null;
  /** Whether the hmac was checked (an hmacKey was supplied). */
  hmacChecked: boolean;
  /** Index of the first broken entry, or null when intact. */
  brokenAt: number | null;
  /** Failure reason from the verifier, or null when intact. */
  reason: string | null;
  /** id of the first broken entry, or null when intact. */
  brokenEntryId: string | null;
  /** One-line operator/log summary. */
  summary: string;
};

// ─── auditChain ──────────────────────────────────────────────────────────────

/**
 * Produce a structured audit report for an in-memory ledger chain.
 *
 * Runs the same fail-closed verification as {@link verifyChain}, then enriches
 * the result with genesis/tip ids, a verified-entry count, and a one-line
 * summary suitable for an operator panel or an audit log.
 *
 * @example
 *   const report = auditChain(writer.getChain(), { hmacKey });
 *   logger.info(report.summary);
 *   // "ledger chain intact: 3 entries verified (hmac checked), genesis led_a → tip led_c"
 */
export function auditChain(
  entries: readonly LedgerChainEntry[],
  options: VerifyChainOptions = {},
): ChainAuditReport {
  const count = entries.length;
  const genesisId = count > 0 ? entries[0]!.id : null;
  const tipId = count > 0 ? entries[count - 1]!.id : null;
  const hmacChecked = options.hmacKey !== undefined;

  const result = verifyChain(entries, options);

  if (result.ok) {
    return {
      ok: true,
      count,
      verifiedCount: count,
      genesisId,
      tipId,
      hmacChecked,
      brokenAt: null,
      reason: null,
      brokenEntryId: null,
      summary:
        count === 0
          ? "ledger chain empty (0 entries)"
          : `ledger chain intact: ${count} ${entryWord(count)} verified` +
            `${hmacChecked ? " (hmac checked)" : ""}, ` +
            `genesis ${genesisId} → tip ${tipId}`,
    };
  }

  // Entries before the first broken index were proven intact.
  const verifiedCount = result.brokenAt;
  const brokenEntryId = result.entryId ?? null;

  return {
    ok: false,
    count,
    verifiedCount,
    genesisId,
    tipId,
    hmacChecked,
    brokenAt: result.brokenAt,
    reason: result.reason,
    brokenEntryId,
    summary:
      `ledger chain BROKEN at #${result.brokenAt}` +
      `${brokenEntryId ? ` (${brokenEntryId})` : ""}: ${result.reason} — ` +
      `${verifiedCount}/${count} ${entryWord(count)} verified before break`,
  };
}

function entryWord(n: number): string {
  return n === 1 ? "entry" : "entries";
}
