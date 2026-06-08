// src/server/ledger/hash-chain-canonicalizer.ts
//
// Deterministic canonicalization for the future action_ledger hash chain.
//
// This is the FOUNDATION for hash-chain verification (see
// docs/security/action-ledger-hash-chain-plan.md). It is pure and side-effect
// free: no DB access, no env, no timestamps generated here, no randomness.
//
// entry_hash = sha256( canonical(entry) || "\n" || prev_hash )
// The hash binds the content fields AND the predecessor's hash. Derived/chain
// fields (prev_hash, entry_hash, hmac) are NOT part of the canonical content.

import { createHash } from "node:crypto";

/**
 * Version of the canonicalization rules. Bump only by introducing a NEW rule
 * set; never mutate v1's behaviour in place, or historical hashes break.
 */
export const CANONICAL_VERSION = 1 as const;

/** JSON value type, mirroring the ledger `payload` / `metadata` jsonb shape. */
export type CanonicalJson =
  | string
  | number
  | boolean
  | null
  | CanonicalJson[]
  | { [key: string]: CanonicalJson };

/**
 * The immutable, content-bearing fields of a ledger entry that are bound into
 * `entry_hash`. Field names mirror `public.action_ledger` (snake_case).
 * Chain/derived fields (prev_hash, entry_hash, hmac) are intentionally absent.
 */
export type CanonicalLedgerFields = {
  id: string;
  workspace_id: string | null;
  user_id: string;
  agent_id: string | null;
  skill_id: string | null;
  mission_id: string | null;
  action_type: string;
  event_type: string | null;
  summary: string;
  autonomy_level: number;
  requires_confirmation: boolean;
  payload: CanonicalJson;
  metadata: CanonicalJson;
  created_at: string;
};

/**
 * Frozen allowlist AND order of canonical content fields for canonical_version 1.
 * Anything not in this list is excluded from the hash (e.g. model_id, cost_mode,
 * and all chain/derived fields).
 */
const CANONICAL_FIELD_ORDER_V1 = [
  "id",
  "workspace_id",
  "user_id",
  "agent_id",
  "skill_id",
  "mission_id",
  "action_type",
  "event_type",
  "summary",
  "autonomy_level",
  "requires_confirmation",
  "payload",
  "metadata",
  "created_at",
] as const;

/**
 * Deterministically serialize any JSON value with recursively sorted object
 * keys. Arrays keep their order; objects are key-sorted so insertion order can
 * never change the output.
 */
export function stableStringify(value: CanonicalJson): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(stableStringify).join(",") + "]";
  }
  const keys = Object.keys(value).sort();
  const parts = keys.map((key) => JSON.stringify(key) + ":" + stableStringify(value[key]));
  return "{" + parts.join(",") + "}";
}

/**
 * Canonicalize the content fields of a ledger entry into a deterministic string.
 *
 * Rules (canonical_version 1):
 * - Fixed field allowlist and order (CANONICAL_FIELD_ORDER_V1), prefixed by `v`.
 * - jsonb fields (payload, metadata) serialized with recursively sorted keys.
 * - `undefined` is normalized to `null` (explicit, never omitted).
 * - No timestamps generated here; `created_at` is taken from the entry as-is.
 * - No randomness.
 */
export function canonicalizeEntry(
  fields: CanonicalLedgerFields,
  version: number = CANONICAL_VERSION,
): string {
  if (version !== CANONICAL_VERSION) {
    throw new Error(`Unsupported canonical_version: ${version}`);
  }

  const parts: string[] = [`"v":${version}`];
  for (const key of CANONICAL_FIELD_ORDER_V1) {
    const raw = (fields as Record<string, unknown>)[key];
    const normalized: CanonicalJson = raw === undefined ? null : (raw as CanonicalJson);
    parts.push(JSON.stringify(key) + ":" + stableStringify(normalized));
  }
  return "{" + parts.join(",") + "}";
}

/**
 * sha256 (hex) of the canonical content concatenated with the predecessor's
 * hash. Genesis rows pass `null` (treated as empty), so the genesis hash still
 * commits to its own content.
 */
export function computeEntryHash(
  fields: CanonicalLedgerFields,
  prevHash: string | null,
  version: number = CANONICAL_VERSION,
): string {
  const canonical = canonicalizeEntry(fields, version);
  return createHash("sha256")
    .update(canonical + "\n" + (prevHash ?? ""), "utf8")
    .digest("hex");
}
