// src/server/ledger/hash-chain-hmac-key.ts
//
// Resolves the LEDGER_HMAC_KEY for live hash-chain sealing. The key is never
// logged, committed, or returned to clients — only passed to pure seal/verify
// primitives inside the server process.

import { isLocalPersistenceFallbackAllowed } from "@/lib/server-env";

/** Dev-only fallback when local persistence is active. Never used in production. */
export const LOCAL_DEV_LEDGER_HMAC_FALLBACK =
  "oria-local-dev-ledger-hmac-NOT-FOR-PRODUCTION";

export class LedgerHmacKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LedgerHmacKeyError";
  }
}

/**
 * Resolve the HMAC key for sealing ledger entries.
 *
 * Production: LEDGER_HMAC_KEY must be provisioned in the hosting environment.
 * Local dev: a documented fallback is used when persistence fallback is allowed.
 */
export function resolveLedgerHmacKey(
  env: Record<string, string | undefined> = process.env,
): string {
  const fromEnv = env.LEDGER_HMAC_KEY;
  if (typeof fromEnv === "string" && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }

  if (isLocalPersistenceFallbackAllowed()) {
    return LOCAL_DEV_LEDGER_HMAC_FALLBACK;
  }

  throw new LedgerHmacKeyError(
    "LEDGER_HMAC_KEY is required when the hash-chain write path is enabled in production.",
  );
}
