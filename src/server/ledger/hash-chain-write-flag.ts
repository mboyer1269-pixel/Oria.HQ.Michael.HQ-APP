// src/server/ledger/hash-chain-write-flag.ts
//
// Feature flag for the live hash-chain write path. OFF by default.
//
// While this returns false (the default), action_ledger inserts skip sealing and
// write no chain columns. Flipping it ON (production GO) requires Phase 1
// columns applied and LEDGER_HMAC_KEY provisioned — see
// docs/security/action-ledger-hash-chain-migration-runbook.md.
//
// This module reads only a NON-SECRET toggle. It never reads the HMAC key — the
// key is passed explicitly to the seal path (see hash-chain-write-plan.ts),
// mirroring the verifier/sealer rule that secrets are arguments, not env reads.

/** Env toggle name. Set to one of the truthy values below to enable (future). */
export const HASH_CHAIN_WRITE_ENV = "LEDGER_HASH_CHAIN_WRITE";

const TRUTHY = new Set(["1", "true", "on", "yes"]);

/**
 * Whether the live hash-chain write path is enabled. Defaults to FALSE for any
 * absent, empty, or unrecognized value — fail-safe OFF.
 */
export function isHashChainWriteEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const raw = env[HASH_CHAIN_WRITE_ENV];
  if (typeof raw !== "string") return false;
  return TRUTHY.has(raw.trim().toLowerCase());
}
