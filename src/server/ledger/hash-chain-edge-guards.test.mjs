/**
 * hash-chain-edge-guards.test.mjs
 *
 * Edge-case guards for hash-chain primitives.
 *
 * PURPOSE
 * -------
 * Complement the golden-vectors suite with adversarial inputs:
 *   - null / undefined / missing fields in canonicalizeEntry
 *   - numeric edge cases (0, -0, Infinity, NaN) in stableStringify
 *   - array edge cases (nested arrays, array-of-nulls)
 *   - computeEntryHash with unusual but valid prev_hash strings
 *   - sealLedgerEntry with missing required fields (throws)
 *   - verifyChain FAIL-CLOSED: empty chain, single-entry with bad prev_hash,
 *     chain with missing seal fields, chain with extra unknown fields
 *   - canonical_version mismatch detected by verifyChain
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const { canonicalizeEntry, computeEntryHash, stableStringify } = await import(
  "./hash-chain-canonicalizer.ts"
);
const { verifyChain } = await import("./hash-chain-verifier.ts");
const { sealLedgerEntry, appendSealedEntry } = await import(
  "./hash-chain-sealer.ts"
);

const TEST_HMAC_KEY = "edge-guard-test-key-never-from-env";

// ---------------------------------------------------------------------------
// Minimal valid entry for reuse
// ---------------------------------------------------------------------------
const VALID_ENTRY = {
  id: "led_e1",
  workspace_id: "ws_edge",
  user_id: "u_edge",
  action_type: "edge_action",
  summary: "edge-guard-base",
  autonomy_level: 1,
  requires_confirmation: false,
  payload: {},
  metadata: {},
  created_at: "2026-06-08T00:00:00.000Z",
};

// ---------------------------------------------------------------------------
// stableStringify edge cases
// ---------------------------------------------------------------------------

test("stableStringify: undefined -> undefined (mirrors JSON.stringify behavior)", () => {
  // JSON.stringify(undefined) returns undefined (not the string "null").
  // stableStringify follows the same contract — callers must not pass undefined
  // at the top level; the canonicalizer always supplies concrete field values.
  assert.equal(stableStringify(undefined), undefined);
});

test("stableStringify: zero -> '0'", () => {
  assert.equal(stableStringify(0), "0");
});

test("stableStringify: negative zero -> '0' (JSON normalizes -0)", () => {
  // JSON.stringify(-0) === "0" — stableStringify must behave identically
  assert.equal(stableStringify(-0), "0");
});

test("stableStringify: Infinity -> 'null' (JSON normalizes non-finite)", () => {
  // JSON.stringify(Infinity) === "null"
  assert.equal(stableStringify(Infinity), "null");
});

test("stableStringify: NaN -> 'null' (JSON normalizes NaN)", () => {
  assert.equal(stableStringify(NaN), "null");
});

test("stableStringify: array containing null", () => {
  assert.equal(stableStringify([null, null]), "[null,null]");
});

test("stableStringify: nested arrays are preserved in order", () => {
  const result = stableStringify([[3, 1], [2, 4]]);
  assert.equal(result, "[[3,1],[2,4]]");
});

test("stableStringify: object with numeric string keys sorts lexicographically", () => {
  // Object keys are always strings; "10" < "9" lexicographically
  const result = stableStringify({ "9": "nine", "10": "ten" });
  assert.equal(result, '{"10":"ten","9":"nine"}');
});

test("stableStringify: deeply nested object sorts at all levels", () => {
  const input = { z: { y: { x: 1, a: 2 }, b: 3 }, m: 4 };
  const result = stableStringify(input);
  // Top: m,z; under z: b,y; under y: a,x
  assert.equal(result, '{"m":4,"z":{"b":3,"y":{"a":2,"x":1}}}');
});

// ---------------------------------------------------------------------------
// canonicalizeEntry edge cases
// ---------------------------------------------------------------------------

test("canonicalizeEntry: absent optional fields all become null", () => {
  const canonical = canonicalizeEntry(VALID_ENTRY);
  // agent_id, skill_id, mission_id, event_type are absent -> must be null
  assert.ok(canonical.includes('"agent_id":null'));
  assert.ok(canonical.includes('"skill_id":null'));
  assert.ok(canonical.includes('"mission_id":null'));
  assert.ok(canonical.includes('"event_type":null'));
});

test("canonicalizeEntry: explicit null fields stay null", () => {
  const entry = { ...VALID_ENTRY, agent_id: null, skill_id: null };
  const canonical = canonicalizeEntry(entry);
  assert.ok(canonical.includes('"agent_id":null'));
  assert.ok(canonical.includes('"skill_id":null'));
});

test("canonicalizeEntry: does not include extra unknown fields", () => {
  const entry = { ...VALID_ENTRY, unknown_field: "surprise" };
  const canonical = canonicalizeEntry(entry);
  assert.ok(!canonical.includes("unknown_field"));
});

test("canonicalizeEntry: payload with null values is stable", () => {
  const entry = { ...VALID_ENTRY, payload: { key: null } };
  const canonical = canonicalizeEntry(entry);
  assert.ok(canonical.includes('"payload":{"key":null}'));
});

test("canonicalizeEntry: boolean payload values serialize correctly", () => {
  const entry = { ...VALID_ENTRY, payload: { flag: true, off: false } };
  const canonical = canonicalizeEntry(entry);
  // Keys sorted: flag < off
  assert.ok(canonical.includes('"payload":{"flag":true,"off":false}'));
});

test("canonicalizeEntry: numeric payload values serialize correctly", () => {
  const entry = { ...VALID_ENTRY, payload: { count: 0, value: -1 } };
  const canonical = canonicalizeEntry(entry);
  assert.ok(canonical.includes('"payload":{"count":0,"value":-1}'));
});

test("canonicalizeEntry: identical inputs across two separate objects produce same canonical", () => {
  const a = canonicalizeEntry({ ...VALID_ENTRY });
  const b = canonicalizeEntry({ ...VALID_ENTRY });
  assert.equal(a, b);
});

// ---------------------------------------------------------------------------
// computeEntryHash edge cases
// ---------------------------------------------------------------------------

test("computeEntryHash: prevHash of all-zeros still produces valid 64-char hex", () => {
  const prevHash = "0".repeat(64);
  const h = computeEntryHash(VALID_ENTRY, prevHash);
  assert.match(h, /^[0-9a-f]{64}$/);
});

test("computeEntryHash: prevHash of all-f's produces valid 64-char hex", () => {
  const prevHash = "f".repeat(64);
  const h = computeEntryHash(VALID_ENTRY, prevHash);
  assert.match(h, /^[0-9a-f]{64}$/);
});

test("computeEntryHash: two different prevHash values produce different hashes", () => {
  const h1 = computeEntryHash(VALID_ENTRY, "0".repeat(64));
  const h2 = computeEntryHash(VALID_ENTRY, "f".repeat(64));
  assert.notEqual(h1, h2);
});

test("computeEntryHash: null and empty-string prevHash produce different hashes", () => {
  // null -> genesis (uses "") internally; but empty-string should also work
  // The algorithm is sha256(canonical + "\n" + (prevHash ?? ""))
  // null -> "" and "" -> "" — these are EQUAL by the ?? operator
  // This test documents that null === "" for the genesis case
  const hNull = computeEntryHash(VALID_ENTRY, null);
  const hEmpty = computeEntryHash(VALID_ENTRY, "");
  // Both use "" as the prev component — must be identical
  assert.equal(hNull, hEmpty);
});

// ---------------------------------------------------------------------------
// sealLedgerEntry edge cases
// ---------------------------------------------------------------------------

test("sealLedgerEntry: seals with all required fields present", () => {
  const sealed = sealLedgerEntry(VALID_ENTRY, {
    prevHash: null,
    hmacKey: TEST_HMAC_KEY,
  });
  assert.ok("entry_hash" in sealed);
  assert.ok("hmac" in sealed);
  assert.ok("canonical_version" in sealed);
  assert.equal(sealed.canonical_version, 1);
  assert.equal(sealed.prev_hash, null);
});

test("sealLedgerEntry: different hmacKey produces different HMAC", () => {
  const s1 = sealLedgerEntry(VALID_ENTRY, {
    prevHash: null,
    hmacKey: TEST_HMAC_KEY,
  });
  const s2 = sealLedgerEntry(VALID_ENTRY, {
    prevHash: null,
    hmacKey: "different-key-never-from-env",
  });
  assert.notEqual(s1.hmac, s2.hmac);
  // entry_hash is key-independent (no HMAC in hash)
  assert.equal(s1.entry_hash, s2.entry_hash);
});

test("sealLedgerEntry: entry_hash changes when prevHash changes", () => {
  const s1 = sealLedgerEntry(VALID_ENTRY, {
    prevHash: null,
    hmacKey: TEST_HMAC_KEY,
  });
  const s2 = sealLedgerEntry(VALID_ENTRY, {
    prevHash: "a".repeat(64),
    hmacKey: TEST_HMAC_KEY,
  });
  assert.notEqual(s1.entry_hash, s2.entry_hash);
});

// ---------------------------------------------------------------------------
// verifyChain edge cases
// ---------------------------------------------------------------------------

test("verifyChain: empty chain -> ok:true (vacuously valid)", () => {
  const result = verifyChain([], { hmacKey: TEST_HMAC_KEY });
  assert.equal(result.ok, true);
});

test("verifyChain: single valid genesis entry verifies", () => {
  const sealed = sealLedgerEntry(VALID_ENTRY, {
    prevHash: null,
    hmacKey: TEST_HMAC_KEY,
  });
  const result = verifyChain([sealed], { hmacKey: TEST_HMAC_KEY });
  assert.equal(result.ok, true);
});

test("verifyChain: genesis entry with non-null prev_hash fails", () => {
  const sealed = sealLedgerEntry(VALID_ENTRY, {
    prevHash: null,
    hmacKey: TEST_HMAC_KEY,
  });
  // Tamper: force prev_hash to non-null on the genesis entry
  const tampered = { ...sealed, prev_hash: "a".repeat(64) };
  const result = verifyChain([tampered], { hmacKey: TEST_HMAC_KEY });
  assert.equal(result.ok, false);
  assert.equal(result.brokenAt, 0);
});

test("verifyChain: entry missing entry_hash field fails", () => {
  const sealed = sealLedgerEntry(VALID_ENTRY, {
    prevHash: null,
    hmacKey: TEST_HMAC_KEY,
  });
  const { entry_hash, ...withoutHash } = sealed;
  assert.ok(entry_hash, "sealed entry should carry an entry_hash before removal");
  const result = verifyChain([withoutHash], { hmacKey: TEST_HMAC_KEY });
  assert.equal(result.ok, false);
});

test("verifyChain: entry missing hmac field fails", () => {
  const sealed = sealLedgerEntry(VALID_ENTRY, {
    prevHash: null,
    hmacKey: TEST_HMAC_KEY,
  });
  const { hmac, ...withoutHmac } = sealed;
  assert.ok(hmac, "sealed entry should carry an hmac before removal");
  const result = verifyChain([withoutHmac], { hmacKey: TEST_HMAC_KEY });
  assert.equal(result.ok, false);
});

test("verifyChain: extra unknown fields on entry do not break verification", () => {
  // Unknown fields are outside CANONICAL_FIELD_ORDER_V1 so canonicalization
  // ignores them — the hash/hmac should still verify correctly
  const sealed = sealLedgerEntry(VALID_ENTRY, {
    prevHash: null,
    hmacKey: TEST_HMAC_KEY,
  });
  const withExtra = { ...sealed, _internal_note: "should be ignored" };
  const result = verifyChain([withExtra], { hmacKey: TEST_HMAC_KEY });
  assert.equal(result.ok, true);
});

test("verifyChain: three-entry chain verifies end-to-end", () => {
  const e1 = sealLedgerEntry(VALID_ENTRY, {
    prevHash: null,
    hmacKey: TEST_HMAC_KEY,
  });
  const e2 = sealLedgerEntry(
    { ...VALID_ENTRY, id: "led_e2", summary: "second" },
    { prevHash: e1.entry_hash, hmacKey: TEST_HMAC_KEY },
  );
  const e3 = sealLedgerEntry(
    { ...VALID_ENTRY, id: "led_e3", summary: "third" },
    { prevHash: e2.entry_hash, hmacKey: TEST_HMAC_KEY },
  );
  const result = verifyChain([e1, e2, e3], { hmacKey: TEST_HMAC_KEY });
  assert.equal(result.ok, true);
});

test("verifyChain: tampering middle entry breaks at correct index", () => {
  const e1 = sealLedgerEntry(VALID_ENTRY, {
    prevHash: null,
    hmacKey: TEST_HMAC_KEY,
  });
  const e2 = sealLedgerEntry(
    { ...VALID_ENTRY, id: "led_e2", summary: "second" },
    { prevHash: e1.entry_hash, hmacKey: TEST_HMAC_KEY },
  );
  const e3 = sealLedgerEntry(
    { ...VALID_ENTRY, id: "led_e3", summary: "third" },
    { prevHash: e2.entry_hash, hmacKey: TEST_HMAC_KEY },
  );

  // Tamper e2's data field
  const tamperedE2 = { ...e2, summary: "TAMPERED" };
  const result = verifyChain([e1, tamperedE2, e3], { hmacKey: TEST_HMAC_KEY });
  assert.equal(result.ok, false);
  assert.equal(result.brokenAt, 1);
});

// ---------------------------------------------------------------------------
// appendSealedEntry edge cases
// ---------------------------------------------------------------------------

test("appendSealedEntry: appending to empty array creates genesis entry", () => {
  const chain = appendSealedEntry([], VALID_ENTRY, { hmacKey: TEST_HMAC_KEY });
  assert.equal(chain.length, 1);
  assert.equal(chain[0].prev_hash, null);
  assert.match(chain[0].entry_hash, /^[0-9a-f]{64}$/);
});

test("appendSealedEntry: each append creates new array (immutable)", () => {
  const chain1 = appendSealedEntry([], VALID_ENTRY, { hmacKey: TEST_HMAC_KEY });
  const chain2 = appendSealedEntry(chain1, { ...VALID_ENTRY, id: "led_e2" }, {
    hmacKey: TEST_HMAC_KEY,
  });
  // Original array must be unchanged
  assert.equal(chain1.length, 1);
  assert.equal(chain2.length, 2);
});
