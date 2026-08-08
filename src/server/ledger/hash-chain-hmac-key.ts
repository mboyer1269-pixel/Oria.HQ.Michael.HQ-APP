// src/server/ledger/hash-chain-hmac-key.ts
//
// Reads the ledger HMAC key from the environment for the live seal-on-append
// path. The key is never logged, never returned to clients, and never written
// into the repository.

export const LEDGER_HMAC_KEY_ENV = "LEDGER_HMAC_KEY";

/**
 * Return the provisioned HMAC key, or `undefined` when absent/empty.
 * Callers must fail closed when sealing is enabled and this returns undefined.
 */
export function getLedgerHmacKey(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const raw = env[LEDGER_HMAC_KEY_ENV];
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
