/**
 * hash-chain-golden-vectors.test.mjs
 *
 * Golden-vector tests for the action_ledger hash-chain primitives.
 *
 * PURPOSE
 * -------
 * Guard against algorithm drift in three modules:
 *   1. hash-chain-canonicalizer  — deterministic canonical string
 *   2. hash-chain-verifier       — FAIL-CLOSED chain verification
 *   3. hash-chain-sealer         — seal -> verify roundtrip
 *
 * The canonical string shape is derived analytically from the source:
 *   {"v":1,"<field1>":value,...}  -- single line, no extra spaces,
 *   stableStringify for values (sorted object keys, JSON primitives).
 *
 * SHA-256 hash values cannot be computed by hand. The tests assert:
 *   (a) exact canonical string -- fully derivable, catches format drift
 *   (b) correct hex format (64 lowercase chars)
 *   (c) determinism (same input -> identical output across two calls)
 *   (d) chain linkage (entry2.prev_hash === entry1.entry_hash)
 *   (e) sealer -> verifyChain roundtrip passes
 *   (f) tamper detection -- mutating any field breaks verifyChain
 */

import assert from "node:assert/strict";
import { test } from "node:test";

// -- Module imports (Node 25 strips TS types, import .ts directly) ----------
const { canonicalizeEntry, computeEntryHash, stableStringify } = await import(
  "./hash-chain-canonicalizer.ts"
);
const { verifyChain } = await import("./hash-chain-verifier.ts");
const { sealLedgerEntry, appendSealedEntry } = await import(
  "./hash-chain-sealer.ts"
);

// -- Test constants ---------------------------------------------------------

const TEST_HMAC_KEY = "golden-test-key-never-from-env";

/**
 * Minimal golden entry -- all optional fields absent (normalized to null).
 * Field order in canonical output is defined by CANONICAL_FIELD_ORDER_V1:
 *   id, workspace_id, user_id, agent_id, skill_id, mission_id,
 *   action_type, event_type, summary, autonomy_level,
 *   requires_confirmation, payload, metadata, created_at
 */
const GOLDEN_FIELDS_MINIMAL = {
  id: "led_g1",
  workspace_id: "ws_test",
  user_id: "u_test",
  action_type: "test_action",
  summary: "golden-vector-v1",
  autonomy_level: 1,
  requires_confirmation: false,
  payload: {},
  metadata: {},
  created_at: "2026-01-01T00:00:00.000Z",
};

/**
 * Expected canonical string for GOLDEN_FIELDS_MINIMAL.
 * Derived analytically from canonicalizeEntry algorithm:
 *   - starts with "v":1
 *   - iterates CANONICAL_FIELD_ORDER_V1 in order
 *   - absent fields normalized to null
 *   - stableStringify: primitives -> JSON.stringify, empty object -> "{}"
 */
const GOLDEN_CANONICAL_MINIMAL =
  '{"v":1,' +
  '"id":"led_g1",' +
  '"workspace_id":"ws_test",' +
  '"user_id":"u_test",' +
  '"agent_id":null,' +
  '"skill_id":null,' +
  '"mission_id":null,' +
  '"action_type":"test_action",' +
  '"event_type":null,' +
  '"summary":"golden-vector-v1",' +
  '"autonomy_level":1,' +
  '"requires_confirmation":false,' +
  '"payload":{},' +
  '"metadata":{},' +
  '"created_at":"2026-01-01T00:00:00.000Z"}';

/**
 * Entry with an unsorted nested payload -- stableStringify must sort keys.
 * Input payload: { b: 2, a: 1, nested: { z: 3, y: 4 } }
 * Expected canonical payload: {"a":1,"b":2,"nested":{"y":4,"z":3}}
 */
const GOLDEN_FIELDS_SORTED = {
  id: "led_g2",
  workspace_id: "ws_test",
  user_id: "u_test",
  agent_id: "agt_01",
  action_type: "sorted_payload",
  summary: "key-sort-vector",
  autonomy_level: 2,
  requires_confirmation: true,
  payload: { b: 2, a: 1, nested: { z: 3, y: 4 } },
  metadata: { source: "test", version: 1 },
  created_at: "2026-06-08T12:00:00.000Z",
};

/**
 * Expected canonical string for GOLDEN_FIELDS_SORTED.
 * stableStringify({b:2,a:1,nested:{z:3,y:4}})
 *   -> keys sort ["a","b","nested"], nested sort ["y","z"]
 *   -> {"a":1,"b":2,"nested":{"y":4,"z":3}}
 */
const GOLDEN_CANONICAL_SORTED =
  '{"v":1,' +
  '"id":"led_g2",' +
  '"workspace_id":"ws_test",' +
  '"user_id":"u_test",' +
  '"agent_id":"agt_01",' +
  '"skill_id":null,' +
  '"mission_id":null,' +
  '"action_type":"sorted_payload",' +
  '"event_type":null,' +
  '"summary":"key-sort-vector",' +
  '"autonomy_level":2,' +
  '"requires_confirmation":true,' +
  '"payload":{"a":1,"b":2,"nested":{"y":4,"z":3}},' +
  '"metadata":{"source":"test","version":1},' +
  '"created_at":"2026-06-08T12:00:00.000Z"}';

// -- stableStringify golden vectors ----------------------------------------

test("stableStringify: null -> 'null'", () => {
  assert.equal(stableStringify(null), "null");
});

test("stableStringify: number -> JSON number", () => {
  assert.equal(stableStringify(42), "42");
  assert.equal(stableStringify(0), "0");
  assert.equal(stableStringify(-1.5), "-1.5");
});

test("stableStringify: boolean", () => {
  assert.equal(stableStringify(true), "true");
  assert.equal(stableStringify(false), "false");
});

test("stableStringify: string -> JSON quoted", () => {
  assert.equal(stableStringify("hello"), '"hello"');
  assert.equal(stableStringify(""), '""');
});

test("stableStringify: empty object -> '{}'", () => {
  assert.equal(stableStringify({}), "{}");
});

test("stableStringify: flat object sorts keys alphabetically", () => {
  assert.equal(stableStringify({ b: 2, a: 1 }), '{"a":1,"b":2}');
});

test("stableStringify: nested object sorts keys at every level", () => {
  const result = stableStringify({ z: { y: 1, x: 2 }, a: 3 });
  assert.equal(result, '{"a":3,"z":{"x":2,"y":1}}');
});

test("stableStringify: empty array -> '[]'", () => {
  assert.equal(stableStringify([]), "[]");
});

test("stableStringify: array preserves order (not sorted)", () => {
  assert.equal(stableStringify([3, 1, 2]), "[3,1,2]");
});

test("stableStringify: array of objects -- objects sorted, array order kept", () => {
  const result = stableStringify([{ b: 2, a: 1 }, { d: 4, c: 3 }]);
  assert.equal(result, '[{"a":1,"b":2},{"c":3,"d":4}]');
});

// -- canonicalizeEntry golden vectors --------------------------------------

test("canonicalizeEntry: minimal fields -- exact canonical string", () => {
  const actual = canonicalizeEntry(GOLDEN_FIELDS_MINIMAL);
  assert.equal(actual, GOLDEN_CANONICAL_MINIMAL);
});

test("canonicalizeEntry: sorted payload -- exact canonical string", () => {
  const actual = canonicalizeEntry(GOLDEN_FIELDS_SORTED);
  assert.equal(actual, GOLDEN_CANONICAL_SORTED);
});

test('canonicalizeEntry: v1 canonical starts with {"v":1,', () => {
  const actual = canonicalizeEntry(GOLDEN_FIELDS_MINIMAL);
  assert.ok(actual.startsWith('{"v":1,'), `got: ${actual.slice(0, 20)}`);
});

test("canonicalizeEntry: single line -- no newlines", () => {
  const actual = canonicalizeEntry(GOLDEN_FIELDS_MINIMAL);
  assert.ok(!actual.includes("\n"));
});

test("canonicalizeEntry: deterministic -- identical output on two calls", () => {
  const a = canonicalizeEntry(GOLDEN_FIELDS_MINIMAL);
  const b = canonicalizeEntry(GOLDEN_FIELDS_MINIMAL);
  assert.equal(a, b);
});

test("canonicalizeEntry: field order -- id before workspace_id", () => {
  const actual = canonicalizeEntry(GOLDEN_FIELDS_MINIMAL);
  const idIdx = actual.indexOf('"id"');
  const wsIdx = actual.indexOf('"workspace_id"');
  assert.ok(idIdx < wsIdx, "id must appear before workspace_id");
});

test("canonicalizeEntry: field order -- autonomy_level before requires_confirmation", () => {
  const actual = canonicalizeEntry(GOLDEN_FIELDS_MINIMAL);
  const alIdx = actual.indexOf('"autonomy_level"');
  const rcIdx = actual.indexOf('"requires_confirmation"');
  assert.ok(alIdx < rcIdx, "autonomy_level must appear before requires_confirmation");
});

// -- computeEntryHash golden vectors ---------------------------------------

test("computeEntryHash: returns 64-char lowercase hex", () => {
  const h = computeEntryHash(GOLDEN_FIELDS_MINIMAL, null);
  assert.match(h, /^[0-9a-f]{64}$/, `expected 64-char hex, got: ${h}`);
});

test("computeEntryHash: deterministic -- same args -> same hash", () => {
  const h1 = computeEntryHash(GOLDEN_FIELDS_MINIMAL, null);
  const h2 = computeEntryHash(GOLDEN_FIELDS_MINIMAL, null);
  assert.equal(h1, h2);
});

test("computeEntryHash: genesis (null prevHash) != entry with prevHash", () => {
  const genesis = computeEntryHash(GOLDEN_FIELDS_MINIMAL, null);
  const withPrev = computeEntryHash(GOLDEN_FIELDS_MINIMAL, "a".repeat(64));
  assert.notEqual(genesis, withPrev);
});

test("computeEntryHash: different fields -> different hash", () => {
  const h1 = computeEntryHash(GOLDEN_FIELDS_MINIMAL, null);
  const h2 = computeEntryHash(GOLDEN_FIELDS_SORTED, null);
  assert.notEqual(h1, h2);
});

test("computeEntryHash: mutating id changes hash", () => {
  const original = computeEntryHash(GOLDEN_FIELDS_MINIMAL, null);
  const mutated = computeEntryHash({ ...GOLDEN_FIELDS_MINIMAL, id: "led_g9" }, null);
  assert.notEqual(original, mutated);
});

test("computeEntryHash: mutating payload changes hash", () => {
  const original = computeEntryHash(GOLDEN_FIELDS_MINIMAL, null);
  const mutated = computeEntryHash(
    { ...GOLDEN_FIELDS_MINIMAL, payload: { extra: true } },
    null,
  );
  assert.notEqual(original, mutated);
});

// -- Chain linkage golden vectors ------------------------------------------

test("chain linkage: entry2.prev_hash === entry1.entry_hash", () => {
  const h1 = computeEntryHash(GOLDEN_FIELDS_MINIMAL, null);
  const h2 = computeEntryHash(GOLDEN_FIELDS_SORTED, h1);

  assert.match(h1, /^[0-9a-f]{64}$/);
  assert.match(h2, /^[0-9a-f]{64}$/);
  assert.notEqual(h1, h2);

  const entry2 = sealLedgerEntry(GOLDEN_FIELDS_SORTED, {
    prevHash: h1,
    hmacKey: TEST_HMAC_KEY,
  });
  assert.equal(entry2.prev_hash, h1);
  assert.equal(entry2.entry_hash, h2);
});

// -- sealLedgerEntry -> verifyChain roundtrip ------------------------------

test("sealer roundtrip: single genesis entry verifies cleanly", () => {
  const sealed = sealLedgerEntry(GOLDEN_FIELDS_MINIMAL, {
    prevHash: null,
    hmacKey: TEST_HMAC_KEY,
  });

  assert.equal(sealed.entry_hash.length, 64);
  assert.match(sealed.entry_hash, /^[0-9a-f]{64}$/);
  assert.equal(sealed.prev_hash, null);
  assert.equal(sealed.canonical_version, 1);
  assert.ok(typeof sealed.hmac === "string" && sealed.hmac.length === 64);

  const result = verifyChain([sealed], { hmacKey: TEST_HMAC_KEY });
  assert.equal(result.ok, true, `verifyChain failed: ${result.reason}`);
});

test("sealer roundtrip: two-entry chain verifies cleanly", () => {
  const e1 = sealLedgerEntry(GOLDEN_FIELDS_MINIMAL, {
    prevHash: null,
    hmacKey: TEST_HMAC_KEY,
  });
  const e2 = sealLedgerEntry(GOLDEN_FIELDS_SORTED, {
    prevHash: e1.entry_hash,
    hmacKey: TEST_HMAC_KEY,
  });

  const result = verifyChain([e1, e2], { hmacKey: TEST_HMAC_KEY });
  assert.equal(result.ok, true, `verifyChain failed: ${result.reason}`);
});

test("appendSealedEntry: builds chain with correct linkage", () => {
  const chain = appendSealedEntry([], GOLDEN_FIELDS_MINIMAL, {
    hmacKey: TEST_HMAC_KEY,
  });
  assert.equal(chain.length, 1);
  assert.equal(chain[0].prev_hash, null);

  const chain2 = appendSealedEntry(chain, GOLDEN_FIELDS_SORTED, {
    hmacKey: TEST_HMAC_KEY,
  });
  assert.equal(chain2.length, 2);
  assert.equal(chain2[1].prev_hash, chain[0].entry_hash);
});

// -- Tamper detection -------------------------------------------------------

test("tamper detection: mutating entry_hash breaks verifyChain", () => {
  const sealed = sealLedgerEntry(GOLDEN_FIELDS_MINIMAL, {
    prevHash: null,
    hmacKey: TEST_HMAC_KEY,
  });

  const tampered = { ...sealed, entry_hash: "0".repeat(64) };
  const result = verifyChain([tampered], { hmacKey: TEST_HMAC_KEY });
  assert.equal(result.ok, false);
  assert.ok(typeof result.brokenAt === "number");
});

test("tamper detection: mutating a data field breaks verifyChain", () => {
  const e1 = sealLedgerEntry(GOLDEN_FIELDS_MINIMAL, {
    prevHash: null,
    hmacKey: TEST_HMAC_KEY,
  });
  const e2 = sealLedgerEntry(GOLDEN_FIELDS_SORTED, {
    prevHash: e1.entry_hash,
    hmacKey: TEST_HMAC_KEY,
  });

  const tampered1 = { ...e1, summary: "TAMPERED" };
  const result = verifyChain([tampered1, e2], { hmacKey: TEST_HMAC_KEY });
  assert.equal(result.ok, false);
  assert.equal(result.brokenAt, 0);
});

test("tamper detection: wrong HMAC key breaks verifyChain", () => {
  const sealed = sealLedgerEntry(GOLDEN_FIELDS_MINIMAL, {
    prevHash: null,
    hmacKey: TEST_HMAC_KEY,
  });

  const result = verifyChain([sealed], { hmacKey: "wrong-key-never-from-env" });
  assert.equal(result.ok, false);
});

test("tamper detection: swapped entry order breaks verifyChain", () => {
  const e1 = sealLedgerEntry(GOLDEN_FIELDS_MINIMAL, {
    prevHash: null,
    hmacKey: TEST_HMAC_KEY,
  });
  const e2 = sealLedgerEntry(GOLDEN_FIELDS_SORTED, {
    prevHash: e1.entry_hash,
    hmacKey: TEST_HMAC_KEY,
  });

  const result = verifyChain([e2, e1], { hmacKey: TEST_HMAC_KEY });
  assert.equal(result.ok, false);
});
