// src/server/ledger/hash-chain-write-flag.ts
//
// Feature flag for the live hash-chain write path. ON by default (CEO mandate
// 2026-08-08). Set LEDGER_HASH_CHAIN_WRITE to 0|false|off|no to opt out.
//
// When enabled, every action_ledger append is sealed via planChainWrite() and
// persisted with prev_hash / entry_hash / hmac. Requires LEDGER_HMAC_KEY in
// production (local dev may use the documented fallback when persistence
// fallback is allowed).
//
// This module reads only a NON-SECRET toggle. The HMAC key is resolved
// separately (see hash-chain-hmac-key.ts) and passed explicitly to the seal path.

/** Env toggle name. Explicit falsey values disable the live write path. */
export const HASH_CHAIN_WRITE_ENV = "LEDGER_HASH_CHAIN_WRITE";

const FALSY = new Set(["0", "false", "off", "no"]);

/**
 * Whether the live hash-chain write path is enabled. Defaults to TRUE unless
 * LEDGER_HASH_CHAIN_WRITE is set to a recognized falsey value.
 */
export function isHashChainWriteEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const raw = env[HASH_CHAIN_WRITE_ENV];
  if (typeof raw !== "string") return true;
  const normalized = raw.trim().toLowerCase();
  if (normalized.length === 0) return true;
  return !FALSY.has(normalized);
}
