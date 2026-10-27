// Canonical hash of an execution intent's payload (G2 approval binding).
//
// sha256 over the key-sorted JSON of the stored payload, using the same
// stableStringify as the ledger hash chain, so the hash is independent of key
// insertion order. The CEO's client echoes this value back on approve; the
// server recomputes it from the stored row and refuses any mismatch.

import { createHash } from "node:crypto";
import { stableStringify, type CanonicalJson } from "@/server/ledger/hash-chain-canonicalizer";

export function hashExecutionIntentPayload(payload: unknown): string {
  return createHash("sha256")
    .update(stableStringify(payload as CanonicalJson))
    .digest("hex");
}
