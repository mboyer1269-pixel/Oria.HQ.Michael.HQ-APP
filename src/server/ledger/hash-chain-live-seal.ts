// src/server/ledger/hash-chain-live-seal.ts
//
// Live seal-on-append bridge: plans chain columns for a new ledger row using
// planChainWrite() and the workspace chain tail.

import { isHashChainWriteEnabled } from "./hash-chain-write-flag.ts";
import { resolveLedgerHmacKey } from "./hash-chain-hmac-key.ts";
import {
  toCanonicalLedgerFields,
  type LedgerRowForChain,
} from "./hash-chain-ledger-fields.ts";
import { planChainWrite, type ChainWriteColumns } from "./hash-chain-write-plan.ts";
import type { LedgerChainEntry } from "./hash-chain-verifier.ts";

export type SealNewLedgerRowInput = {
  row: LedgerRowForChain;
  tail: LedgerChainEntry | null;
  enabled?: boolean;
  hmacKey?: string;
};

/**
 * Seal a new ledger row for persistence. Returns null when the write path is
 * disabled; otherwise returns the chain columns to persist alongside the row.
 */
export function sealNewLedgerRow(input: SealNewLedgerRowInput): ChainWriteColumns | null {
  const enabled = input.enabled ?? isHashChainWriteEnabled();
  if (!enabled) return null;

  const hmacKey = input.hmacKey ?? resolveLedgerHmacKey();

  return planChainWrite({
    fields: toCanonicalLedgerFields(input.row),
    tail: input.tail,
    hmacKey,
    enabled: true,
  });
}
