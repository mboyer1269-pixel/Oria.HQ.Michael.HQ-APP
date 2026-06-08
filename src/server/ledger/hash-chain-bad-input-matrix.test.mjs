// src/server/ledger/hash-chain-bad-input-matrix.test.mjs
//
// Adversarial / bad-input matrix for hash-chain primitives.
//
// Tests cover:
//   - stableStringify: null, primitives, objects, arrays, nested, key ordering
//   - canonicalizeEntry: field order, undefined→null normalization, excluded fields
//   - computeEntryHash: genesis, prevHash, determinism, undefined≡null
//   - sealLedgerEntry: invalid inputs (empty key, empty prevHash, bad version,
//                       pre-sealed fields), correct sealing, key independence
//   - verifyChain: valid chains, tampered fields, HMAC checks,
//                  fail-closed gaps (documented with assert.throws)
//   - appendSealedEntry: null chain, valid appends, immutability, verify flag
//
// DOCUMENTED IMPLEMENTATION GAPS (two tests use assert.throws for current behavior):
//   1. verifyChain(null) — throws TypeError instead of returning { ok: false }
//   2. verifyChain([..., null]) — null chain entry crashes instead of { ok: false }
// These tests document current behavior, not desired behavior.
//
// All HMAC keys are explicit arguments — never read from environment.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  stableStringify,
  canonicalizeEntry,
  computeEntryHash,
} from "./hash-chain-canonicalizer.ts";

import { verifyChain } from "./hash-chain-verifier.ts";

import { sealLedgerEntry, appendSealedEntry } from "./hash-chain-sealer.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const TEST_HMAC_KEY = "bad-input-test-key-never-from-env";

/** A complete, valid ledger entry with all CANONICAL_FIELD_ORDER_V1 fields. */
const VALID_ENTRY = {
  id: "00000000-0000-0000-0000-000000000001",
  workspace_id: "ws-123",
  user_id: "user-abc",
  agent_id: null,
  skill_id: null,
  mission_id: null,
  action_type: "EXECUTE",
  event_type: "START",
  summary: "Test action",
  autonomy_level: 2,
  requires_confirmation: false,
  payload: { key: "value" },
  metadata: {},
  created_at: "2024-01-01T00:00:00.000Z",
};

/**
 * Helper: seal VALID_ENTRY (with optional field overrides) using the test key.
 * Uses the correct two-argument form: sealLedgerEntry(entry, options).
 */
function makeSealed(overrides = {}, prevHash = null) {
  const entry = { ...VALID_ENTRY, ...overrides };
  return sealLedgerEntry(entry, { prevHash, hmacKey: TEST_HMAC_KEY });
}

// ─────────────────────────────────────────────────────────────────────────────
// stableStringify
// ─────────────────────────────────────────────────────────────────────────────

test("stableStringify: null → 'null'", () => {
  assert.equal(stableStringify(null), "null");
});

test("stableStringify: number → JSON representation", () => {
  assert.equal(stableStringify(42), "42");
  assert.equal(stableStringify(0), "0");
  assert.equal(stableStringify(-1.5), "-1.5");
});

test("stableStringify: boolean → JSON representation", () => {
  assert.equal(stableStringify(true), "true");
  assert.equal(stableStringify(false), "false");
});

test("stableStringify: string → quoted JSON string", () => {
  assert.equal(stableStringify("hello"), '"hello"');
  assert.equal(stableStringify(""), '""');
});

test("stableStringify: empty array → '[]'", () => {
  assert.equal(stableStringify([]), "[]");
});

test("stableStringify: array of primitives preserves order", () => {
  assert.equal(stableStringify([3, 1, 2]), "[3,1,2]");
  assert.equal(stableStringify([1, 2, 3]), "[1,2,3]");
});

test("stableStringify: array with null values", () => {
  assert.equal(stableStringify([null, 1, null]), "[null,1,null]");
});

test("stableStringify: empty object → '{}'", () => {
  assert.equal(stableStringify({}), "{}");
});

test("stableStringify: object keys are sorted alphabetically", () => {
  assert.equal(stableStringify({ z: 1, a: 2, m: 3 }), '{"a":2,"m":3,"z":1}');
});

test("stableStringify: nested object keys are sorted recursively", () => {
  const out = stableStringify({ b: { y: 1, a: 2 }, a: 3 });
  assert.equal(out, '{"a":3,"b":{"a":2,"y":1}}');
});

test("stableStringify: object with null values", () => {
  assert.equal(stableStringify({ key: null }), '{"key":null}');
});

test("stableStringify: insertion order is irrelevant — same canonical output", () => {
  const o1 = { a: 1, b: 2 };
  const o2 = { b: 2, a: 1 };
  assert.equal(stableStringify(o1), stableStringify(o2));
});

test("stableStringify: nested arrays inside objects", () => {
  const out = stableStringify({ b: [3, 1], a: [2, 4] });
  assert.equal(out, '{"a":[2,4],"b":[3,1]}');
});

// ─────────────────────────────────────────────────────────────────────────────
// canonicalizeEntry
// ─────────────────────────────────────────────────────────────────────────────

test("canonicalizeEntry: output starts with {\"v\":1", () => {
  const canonical = canonicalizeEntry(VALID_ENTRY);
  assert.ok(canonical.startsWith('{"v":1,'), `Got: ${canonical.slice(0, 20)}`);
});

test("canonicalizeEntry: output is a single line (no newlines)", () => {
  const canonical = canonicalizeEntry(VALID_ENTRY);
  assert.ok(!canonical.includes("\n"));
});

test("canonicalizeEntry: undefined fields normalized to null in output", () => {
  const entry = { ...VALID_ENTRY, agent_id: undefined };
  const canonical = canonicalizeEntry(entry);
  assert.ok(canonical.includes('"agent_id":null'), `Got: ${canonical}`);
});

test("canonicalizeEntry: null field explicitly present in output", () => {
  const canonical = canonicalizeEntry(VALID_ENTRY);
  assert.ok(canonical.includes('"agent_id":null'));
  assert.ok(canonical.includes('"skill_id":null'));
  assert.ok(canonical.includes('"mission_id":null'));
});

test("canonicalizeEntry: excludes seal/chain fields (prev_hash, entry_hash, hmac)", () => {
  const entry = {
    ...VALID_ENTRY,
    prev_hash: "some-prev",
    entry_hash: "some-hash",
    hmac: "some-hmac",
  };
  const canonical = canonicalizeEntry(entry);
  assert.ok(!canonical.includes("prev_hash"), "prev_hash must be excluded");
  assert.ok(!canonical.includes("entry_hash"), "entry_hash must be excluded");
  assert.ok(!canonical.includes('"hmac"'), "hmac must be excluded");
});

test("canonicalizeEntry: payload uses stableStringify (sorted keys)", () => {
  const entry = { ...VALID_ENTRY, payload: { z: 1, a: 2 } };
  const canonical = canonicalizeEntry(entry);
  assert.ok(canonical.includes('"payload":{"a":2,"z":1}'));
});

test("canonicalizeEntry: metadata uses stableStringify (sorted keys)", () => {
  const entry = { ...VALID_ENTRY, metadata: { beta: true, alpha: false } };
  const canonical = canonicalizeEntry(entry);
  assert.ok(canonical.includes('"metadata":{"alpha":false,"beta":true}'));
});

test("canonicalizeEntry: deterministic — same entry produces identical output", () => {
  assert.equal(canonicalizeEntry(VALID_ENTRY), canonicalizeEntry(VALID_ENTRY));
});

test("canonicalizeEntry: different content produces different canonical", () => {
  const e1 = { ...VALID_ENTRY, summary: "First" };
  const e2 = { ...VALID_ENTRY, summary: "Second" };
  assert.notEqual(canonicalizeEntry(e1), canonicalizeEntry(e2));
});

test("canonicalizeEntry: unsupported version throws", () => {
  assert.throws(
    () => canonicalizeEntry(VALID_ENTRY, 99),
    /Unsupported canonical_version/,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// computeEntryHash
// ─────────────────────────────────────────────────────────────────────────────

test("computeEntryHash: genesis (prevHash=null) produces 64-char hex", () => {
  const hash = computeEntryHash(VALID_ENTRY, null);
  assert.match(hash, /^[0-9a-f]{64}$/);
});

test("computeEntryHash: different prevHash produces different output", () => {
  const hashA = computeEntryHash(VALID_ENTRY, null);
  const hashB = computeEntryHash(VALID_ENTRY, "a".repeat(64));
  assert.notEqual(hashA, hashB);
});

test("computeEntryHash: deterministic — same inputs, same output", () => {
  const h1 = computeEntryHash(VALID_ENTRY, null);
  const h2 = computeEntryHash(VALID_ENTRY, null);
  assert.equal(h1, h2);
});

test("computeEntryHash: null prevHash and undefined prevHash produce same hash (both treated as genesis)", () => {
  const hashNull = computeEntryHash(VALID_ENTRY, null);
  const hashUndef = computeEntryHash(VALID_ENTRY, undefined);
  assert.equal(hashNull, hashUndef);
});

test("computeEntryHash: different content produces different hash", () => {
  const entryA = { ...VALID_ENTRY, summary: "Action A" };
  const entryB = { ...VALID_ENTRY, summary: "Action B" };
  assert.notEqual(computeEntryHash(entryA, null), computeEntryHash(entryB, null));
});

// ─────────────────────────────────────────────────────────────────────────────
// sealLedgerEntry — invalid inputs (throw cases)
// ─────────────────────────────────────────────────────────────────────────────

test("sealLedgerEntry: empty string hmacKey throws", () => {
  assert.throws(
    () => sealLedgerEntry(VALID_ENTRY, { prevHash: null, hmacKey: "" }),
    /hmacKey is required/,
  );
});

test("sealLedgerEntry: empty string prevHash (non-null) throws", () => {
  assert.throws(
    () => sealLedgerEntry(VALID_ENTRY, { prevHash: "", hmacKey: TEST_HMAC_KEY }),
    /prevHash must be null/,
  );
});

test("sealLedgerEntry: unsupported canonicalVersion throws", () => {
  assert.throws(
    () =>
      sealLedgerEntry(VALID_ENTRY, {
        prevHash: null,
        hmacKey: TEST_HMAC_KEY,
        canonicalVersion: 99,
      }),
    /unsupported canonical_version/,
  );
});

test("sealLedgerEntry: input with existing entry_hash throws without overwrite", () => {
  const entry = { ...VALID_ENTRY, entry_hash: "existing-hash" };
  assert.throws(
    () => sealLedgerEntry(entry, { prevHash: null, hmacKey: TEST_HMAC_KEY }),
    /already carries seal fields/,
  );
});

test("sealLedgerEntry: input with existing prev_hash throws without overwrite", () => {
  const entry = { ...VALID_ENTRY, prev_hash: "existing-prev" };
  assert.throws(
    () => sealLedgerEntry(entry, { prevHash: null, hmacKey: TEST_HMAC_KEY }),
    /already carries seal fields/,
  );
});

test("sealLedgerEntry: input with existing hmac throws without overwrite", () => {
  const entry = { ...VALID_ENTRY, hmac: "existing-hmac" };
  assert.throws(
    () => sealLedgerEntry(entry, { prevHash: null, hmacKey: TEST_HMAC_KEY }),
    /already carries seal fields/,
  );
});

test("sealLedgerEntry: pre-sealed input accepted with overwrite:true", () => {
  const entry = { ...VALID_ENTRY, entry_hash: "existing-hash" };
  const sealed = sealLedgerEntry(entry, {
    prevHash: null,
    hmacKey: TEST_HMAC_KEY,
    overwrite: true,
  });
  assert.ok(sealed.entry_hash);
  assert.notEqual(sealed.entry_hash, "existing-hash");
});

// ─────────────────────────────────────────────────────────────────────────────
// sealLedgerEntry — correct sealing
// ─────────────────────────────────────────────────────────────────────────────

test("sealLedgerEntry: genesis entry has prev_hash=null", () => {
  const sealed = makeSealed();
  assert.equal(sealed.prev_hash, null);
});

test("sealLedgerEntry: sealed entry has 64-char hex entry_hash", () => {
  const sealed = makeSealed();
  assert.match(sealed.entry_hash, /^[0-9a-f]{64}$/);
});

test("sealLedgerEntry: sealed entry has non-empty hmac string", () => {
  const sealed = makeSealed();
  assert.ok(typeof sealed.hmac === "string" && sealed.hmac.length > 0);
});

test("sealLedgerEntry: sealing is deterministic — same inputs produce same output", () => {
  const s1 = makeSealed();
  const s2 = makeSealed();
  assert.equal(s1.entry_hash, s2.entry_hash);
  assert.equal(s1.hmac, s2.hmac);
});

test("sealLedgerEntry: different hmacKey produces different hmac but same entry_hash", () => {
  const s1 = sealLedgerEntry(VALID_ENTRY, { prevHash: null, hmacKey: "key-alpha" });
  const s2 = sealLedgerEntry(VALID_ENTRY, { prevHash: null, hmacKey: "key-beta" });
  // entry_hash is content-only — HMAC key does not affect it
  assert.equal(s1.entry_hash, s2.entry_hash);
  // hmac is key-dependent
  assert.notEqual(s1.hmac, s2.hmac);
});

test("sealLedgerEntry: sealing with a non-null prevHash links to predecessor", () => {
  const prev = makeSealed();
  const next = makeSealed({ summary: "Second action" }, prev.entry_hash);
  assert.equal(next.prev_hash, prev.entry_hash);
});

test("sealLedgerEntry: different prevHash changes entry_hash", () => {
  const s1 = makeSealed({}, null);
  const s2 = makeSealed({}, "a".repeat(64));
  assert.notEqual(s1.entry_hash, s2.entry_hash);
});

// ─────────────────────────────────────────────────────────────────────────────
// verifyChain — valid chains
// ─────────────────────────────────────────────────────────────────────────────

test("verifyChain: empty array → ok: true", () => {
  const result = verifyChain([]);
  assert.equal(result.ok, true);
});

test("verifyChain: single valid entry without hmacKey → ok: true", () => {
  const sealed = makeSealed();
  const result = verifyChain([sealed]);
  assert.equal(result.ok, true);
});

test("verifyChain: single valid entry with correct hmacKey → ok: true", () => {
  const sealed = makeSealed();
  const result = verifyChain([sealed], { hmacKey: TEST_HMAC_KEY });
  assert.equal(result.ok, true);
});

test("verifyChain: two-entry chain → ok: true", () => {
  const e1 = makeSealed();
  const e2 = makeSealed({ summary: "Second" }, e1.entry_hash);
  const result = verifyChain([e1, e2], { hmacKey: TEST_HMAC_KEY });
  assert.equal(result.ok, true);
});

test("verifyChain: three-entry chain → ok: true", () => {
  const e1 = makeSealed();
  const e2 = makeSealed({ summary: "Second" }, e1.entry_hash);
  const e3 = makeSealed({ summary: "Third" }, e2.entry_hash);
  const result = verifyChain([e1, e2, e3], { hmacKey: TEST_HMAC_KEY });
  assert.equal(result.ok, true);
});

// ─────────────────────────────────────────────────────────────────────────────
// verifyChain — fail-closed gaps (documented — current behavior throws)
// ─────────────────────────────────────────────────────────────────────────────

test("verifyChain: null chain → throws TypeError [DOCUMENTED GAP: should return ok:false]", () => {
  // Implementation gap: verifyChain does not guard against null input.
  // null.length → TypeError. The correct behavior would be { ok: false }.
  // This test documents actual (unsafe) behavior, not desired behavior.
  assert.throws(() => verifyChain(null), TypeError);
});

test("verifyChain: chain with null entry → throws TypeError [DOCUMENTED GAP: should return ok:false]", () => {
  // Implementation gap: verifyChain does not guard against null entries in the array.
  // null.entry_hash → TypeError. The correct behavior would be { ok: false, brokenAt: 1 }.
  // This test documents actual (unsafe) behavior, not desired behavior.
  const sealed = makeSealed();
  assert.throws(() => verifyChain([sealed, null]), TypeError);
});

// ─────────────────────────────────────────────────────────────────────────────
// verifyChain — bad inputs that return ok:false (no throws)
// ─────────────────────────────────────────────────────────────────────────────

test("verifyChain: string as chain (has .length, no valid entries) → ok: false", () => {
  // A string has .length and string indexing, but chars have no entry_hash property.
  const result = verifyChain("not an array");
  assert.equal(result.ok, false);
});

test("verifyChain: chain with string element → ok: false", () => {
  const result = verifyChain(["not an entry"]);
  assert.equal(result.ok, false);
});

test("verifyChain: entry with missing entry_hash → ok: false", () => {
  const sealed = makeSealed();
  const broken = { ...sealed };
  delete broken.entry_hash;
  const result = verifyChain([broken]);
  assert.equal(result.ok, false);
});

test("verifyChain: entry_hash replaced with garbage → ok: false, brokenAt: 0", () => {
  const sealed = makeSealed();
  const broken = { ...sealed, entry_hash: "garbage-not-a-real-hash" };
  const result = verifyChain([broken], { hmacKey: TEST_HMAC_KEY });
  assert.equal(result.ok, false);
  assert.equal(result.brokenAt, 0);
});

test("verifyChain: summary tampered after sealing → ok: false", () => {
  const sealed = makeSealed();
  const tampered = { ...sealed, summary: "tampered summary injected" };
  const result = verifyChain([tampered], { hmacKey: TEST_HMAC_KEY });
  assert.equal(result.ok, false);
});

test("verifyChain: payload tampered after sealing → ok: false", () => {
  const sealed = makeSealed();
  const tampered = { ...sealed, payload: { injected: true, malicious: "data" } };
  const result = verifyChain([tampered], { hmacKey: TEST_HMAC_KEY });
  assert.equal(result.ok, false);
});

test("verifyChain: metadata tampered after sealing → ok: false", () => {
  const sealed = makeSealed();
  const tampered = { ...sealed, metadata: { extra_field: "tampered" } };
  const result = verifyChain([tampered], { hmacKey: TEST_HMAC_KEY });
  assert.equal(result.ok, false);
});

test("verifyChain: correct entry_hash but wrong hmac, with hmacKey → ok: false", () => {
  const sealed = makeSealed();
  const broken = { ...sealed, hmac: "wrong-hmac-value-xxxx" };
  const result = verifyChain([broken], { hmacKey: TEST_HMAC_KEY });
  assert.equal(result.ok, false);
});

test("verifyChain: correct chain but wrong hmacKey → ok: false", () => {
  const sealed = makeSealed(); // sealed with TEST_HMAC_KEY
  const result = verifyChain([sealed], { hmacKey: "completely-wrong-key" });
  assert.equal(result.ok, false);
});

test("verifyChain: no hmacKey provided — entry with wrong hmac still passes hash check → ok: true", () => {
  // Without a hmacKey, HMAC is not verified. Only entry_hash is checked.
  const sealed = makeSealed();
  const noHmacVerify = { ...sealed, hmac: "any-value-not-checked" };
  const result = verifyChain([noHmacVerify]);
  // entry_hash is correct, no hmac key to verify against
  assert.equal(result.ok, true);
});

test("verifyChain: two-entry chain, second entry has wrong prev_hash → ok: false, brokenAt: 1", () => {
  const e1 = makeSealed();
  const e2 = makeSealed({ summary: "Second" }, "wrong-prev-hash-not-e1");
  const result = verifyChain([e1, e2]);
  assert.equal(result.ok, false);
  assert.equal(result.brokenAt, 1);
});

test("verifyChain: three-entry chain, middle entry tampered → ok: false, brokenAt ≤ 2", () => {
  const e1 = makeSealed();
  const e2 = makeSealed({ summary: "Second" }, e1.entry_hash);
  const e3 = makeSealed({ summary: "Third" }, e2.entry_hash);
  const tamperedE2 = { ...e2, summary: "tampered" };
  const result = verifyChain([e1, tamperedE2, e3]);
  assert.equal(result.ok, false);
  assert.ok(result.brokenAt <= 2);
});

// ─────────────────────────────────────────────────────────────────────────────
// appendSealedEntry
// ─────────────────────────────────────────────────────────────────────────────

test("appendSealedEntry: empty chain → single genesis entry", () => {
  const chain = appendSealedEntry([], VALID_ENTRY, { hmacKey: TEST_HMAC_KEY });
  assert.equal(chain.length, 1);
  assert.equal(chain[0].prev_hash, null);
  assert.match(chain[0].entry_hash, /^[0-9a-f]{64}$/);
});

test("appendSealedEntry: null chain → throws TypeError (null has no .length)", () => {
  assert.throws(
    () => appendSealedEntry(null, VALID_ENTRY, { hmacKey: TEST_HMAC_KEY }),
    TypeError,
  );
});

test("appendSealedEntry: second append links to first entry's hash", () => {
  const e2 = { ...VALID_ENTRY, id: "00000000-0000-0000-0000-000000000002", summary: "Second" };
  let chain = appendSealedEntry([], VALID_ENTRY, { hmacKey: TEST_HMAC_KEY });
  chain = appendSealedEntry(chain, e2, { hmacKey: TEST_HMAC_KEY });
  assert.equal(chain.length, 2);
  assert.equal(chain[1].prev_hash, chain[0].entry_hash);
});

test("appendSealedEntry: resulting chain passes verifyChain", () => {
  const e2 = { ...VALID_ENTRY, id: "00000000-0000-0000-0000-000000000002", summary: "Second" };
  let chain = appendSealedEntry([], VALID_ENTRY, { hmacKey: TEST_HMAC_KEY });
  chain = appendSealedEntry(chain, e2, { hmacKey: TEST_HMAC_KEY });
  const result = verifyChain(chain, { hmacKey: TEST_HMAC_KEY });
  assert.equal(result.ok, true);
});

test("appendSealedEntry: does not mutate the original chain (returns new array)", () => {
  const original = appendSealedEntry([], VALID_ENTRY, { hmacKey: TEST_HMAC_KEY });
  const e2 = { ...VALID_ENTRY, id: "00000000-0000-0000-0000-000000000002", summary: "Second" };
  const extended = appendSealedEntry(original, e2, { hmacKey: TEST_HMAC_KEY });
  assert.equal(original.length, 1);
  assert.equal(extended.length, 2);
});

test("appendSealedEntry: three-entry chain built via successive appends → ok: true", () => {
  const e2 = { ...VALID_ENTRY, id: "00000000-0000-0000-0000-000000000002", summary: "Second" };
  const e3 = { ...VALID_ENTRY, id: "00000000-0000-0000-0000-000000000003", summary: "Third" };
  let chain = appendSealedEntry([], VALID_ENTRY, { hmacKey: TEST_HMAC_KEY });
  chain = appendSealedEntry(chain, e2, { hmacKey: TEST_HMAC_KEY });
  chain = appendSealedEntry(chain, e3, { hmacKey: TEST_HMAC_KEY });
  assert.equal(chain.length, 3);
  const result = verifyChain(chain, { hmacKey: TEST_HMAC_KEY });
  assert.equal(result.ok, true);
});

test("appendSealedEntry: verify:true throws when existing chain is corrupt", () => {
  // Append to a chain with a corrupted first entry — verifyChain will catch it
  const corruptedFirst = { ...makeSealed(), entry_hash: "corrupted-not-real" };
  const corruptedChain = [corruptedFirst];
  const e2 = { ...VALID_ENTRY, id: "00000000-0000-0000-0000-000000000002", summary: "Second" };
  assert.throws(
    () => appendSealedEntry(corruptedChain, e2, { hmacKey: TEST_HMAC_KEY, verify: true }),
    /verification/i,
  );
});
