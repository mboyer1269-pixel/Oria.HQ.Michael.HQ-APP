// src/server/ledger/hash-chain-local-registry.ts
//
// Per-workspace in-memory hash chains for local persistence mode. Mirrors the
// DB-backed chain tail that Supabase reads at write time.

import { ShadowChainWriter } from "./hash-chain-shadow-writer.ts";
import type { LedgerChainEntry } from "./hash-chain-verifier.ts";

const writers = new Map<string, ShadowChainWriter>();

export function getOrCreateLocalChainWriter(
  chainScope: string,
  hmacKey: string,
): ShadowChainWriter {
  let writer = writers.get(chainScope);
  if (!writer) {
    writer = new ShadowChainWriter({ hmacKey });
    writers.set(chainScope, writer);
  }
  return writer;
}

export function getLocalChainTail(chainScope: string): LedgerChainEntry | null {
  return writers.get(chainScope)?.getTail() ?? null;
}

export function getLocalChainEntries(chainScope: string): readonly LedgerChainEntry[] {
  return writers.get(chainScope)?.getChain() ?? [];
}

/** Test/smoke teardown — clears all in-memory chains. */
export function resetLocalChainRegistry(): void {
  for (const writer of writers.values()) {
    writer.reset();
  }
  writers.clear();
}
