#!/usr/bin/env node

// src/server/ledger/hash-chain-verifier.test.mjs
//
// Foundation tests for the action_ledger hash-chain verifier (no DB, no env).
// Proves the chain primitives behave as the plan requires
// (docs/security/action-ledger-hash-chain-plan.md):
//   - valid chain passes
//   - tampered payload fails
//   - broken prev_hash fails
//   - wrong hmac fails (when a key is provided)
//   - missing required hash fields fails
//   - canonicalization is deterministic
// Node 25 strips TS types, so the .ts modules import directly.

import assert from "node:assert/strict";
import test from "node:test";

const { canonicalizeEntry, computeEntryHash, CANONICAL_VERSION } = await import(
  "./hash-chain-canonicalizer.ts"
);
const { verifyChain, computeHmac } = await import("./hash-chain-verifier.ts");

const TEST_HMAC_KEY = "test-only-key-never-from-env";

// ---------------------------------------------------------------------------
// Fixture helpers — build content fields and seal them into a valid chain.
// ---------------------------------------------------------------------------

function baseFields(overrides = {}) {
  return {
    id: "led_1",
    workspace_id: "michael-hq",
    user_id: "local-michael",
    agent_id: "joris",
    skill_id: "brief.generate",
    mission_id: null,
    action_type: "sentinelle_allow",
    event_type: "decision",
    summary: "green lane decision",
    autonomy_level: 2,
    requires_confirmation: false,
    payload: { b: 1, a: 2, nested: { y: 1, x: 2 } },
    metadata: { phase: "decision" },
    created_at: "2026-06-08T00:00:00.000Z",
    ...overrides,
  };
}

/** Seal a list of content-field objects into a linked, optionally HMAC'd chain. */
function sealChain(fieldsList, { hmacKey } = {}) {
  const sealed = [];
  let prev = null;
  for (const fields of fieldsList) {
    const entry_hash = computeEntryHash(fields, prev, CANONICAL_VERSION);
    const entry = { ...fields, prev_hash: prev, entry_hash, canonical_version: CANONICAL_VERSION };
    if (hmacKey) entry.hmac = computeHmac(entry_hash, hmacKey);
    sealed.push(entry);
    prev = entry_hash;
  }
  return sealed;
}

function threeEntryFields() {
  return [
    baseFields({ id: "led_1", event_type: "decision", summary: "decision" }),
    baseFields({ id: "led_2", event_type: "action", summary: "pending dispatch" }),
    baseFields({ id: "led_3", event_type: "result", summary: "result success" }),
  ];
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

test("valid chain passes (no hmac)", () => {
  const chain = sealChain(threeEntryFields());
  const result = verifyChain(chain);
  assert.equal(result.ok, true);
  assert.equal(result.count, 3);
});

test("valid chain passes with correct hmac key", () => {
  const chain = sealChain(threeEntryFields(), { hmacKey: TEST_HMAC_KEY });
  const result = verifyChain(chain, { hmacKey: TEST_HMAC_KEY });
  assert.equal(result.ok, true);
  assert.equal(result.count, 3);
});

test("genesis entry has null prev_hash", () => {
  const chain = sealChain(threeEntryFields());
  assert.equal(chain[0].prev_hash, null);
  assert.equal(chain[1].prev_hash, chain[0].entry_hash);
  assert.equal(chain[2].prev_hash, chain[1].entry_hash);
});

// ---------------------------------------------------------------------------
// Tamper detection — fail closed
// ---------------------------------------------------------------------------

test("tampered payload fails (entry_hash mismatch)", () => {
  const chain = sealChain(threeEntryFields());
  chain[1].payload = { ...chain[1].payload, injected: "evil" }; // mutate without re-sealing
  const result = verifyChain(chain);
  assert.equal(result.ok, false);
  assert.equal(result.brokenAt, 1);
  assert.match(result.reason, /entry_hash mismatch/);
  assert.equal(result.entryId, "led_2");
});

test("tampered summary fails", () => {
  const chain = sealChain(threeEntryFields());
  chain[2].summary = "rewritten history";
  const result = verifyChain(chain);
  assert.equal(result.ok, false);
  assert.equal(result.brokenAt, 2);
  assert.match(result.reason, /entry_hash mismatch/);
});

test("broken prev_hash fails (linkage)", () => {
  const chain = sealChain(threeEntryFields());
  chain[2].prev_hash = "deadbeef".repeat(8); // 64 hex chars, but wrong
  const result = verifyChain(chain);
  assert.equal(result.ok, false);
  assert.equal(result.brokenAt, 2);
  assert.match(result.reason, /prev_hash does not match/);
});

test("deleted middle entry breaks linkage", () => {
  const chain = sealChain(threeEntryFields());
  const truncated = [chain[0], chain[2]]; // drop led_2
  const result = verifyChain(truncated);
  assert.equal(result.ok, false);
  assert.equal(result.brokenAt, 1);
  assert.match(result.reason, /prev_hash does not match/);
});

test("genesis entry with non-null prev_hash fails", () => {
  const chain = sealChain(threeEntryFields());
  chain[0].prev_hash = "0".repeat(64);
  const result = verifyChain(chain);
  assert.equal(result.ok, false);
  assert.equal(result.brokenAt, 0);
  assert.match(result.reason, /genesis entry must have null prev_hash/);
});

// ---------------------------------------------------------------------------
// HMAC
// ---------------------------------------------------------------------------

test("wrong hmac key fails when a key is provided", () => {
  const chain = sealChain(threeEntryFields(), { hmacKey: TEST_HMAC_KEY });
  const result = verifyChain(chain, { hmacKey: "a-different-key" });
  assert.equal(result.ok, false);
  assert.equal(result.brokenAt, 0);
  assert.match(result.reason, /hmac mismatch/);
});

test("tampered hmac value fails", () => {
  const chain = sealChain(threeEntryFields(), { hmacKey: TEST_HMAC_KEY });
  chain[1].hmac = "f".repeat(64);
  const result = verifyChain(chain, { hmacKey: TEST_HMAC_KEY });
  assert.equal(result.ok, false);
  assert.equal(result.brokenAt, 1);
  assert.match(result.reason, /hmac mismatch/);
});

test("missing hmac fails when a key is provided", () => {
  const chain = sealChain(threeEntryFields()); // sealed WITHOUT hmac
  const result = verifyChain(chain, { hmacKey: TEST_HMAC_KEY });
  assert.equal(result.ok, false);
  assert.equal(result.brokenAt, 0);
  assert.match(result.reason, /missing hmac/);
});

test("hmac is not checked when no key is provided", () => {
  const chain = sealChain(threeEntryFields()); // no hmac field
  const result = verifyChain(chain);
  assert.equal(result.ok, true);
});

// ---------------------------------------------------------------------------
// Missing required hash fields
// ---------------------------------------------------------------------------

test("missing entry_hash fails", () => {
  const chain = sealChain(threeEntryFields());
  delete chain[1].entry_hash;
  const result = verifyChain(chain);
  assert.equal(result.ok, false);
  assert.equal(result.brokenAt, 1);
  assert.match(result.reason, /missing entry_hash/);
});

test("empty entry_hash fails", () => {
  const chain = sealChain(threeEntryFields());
  chain[0].entry_hash = "";
  const result = verifyChain(chain);
  assert.equal(result.ok, false);
  assert.equal(result.brokenAt, 0);
  assert.match(result.reason, /missing entry_hash/);
});

// ---------------------------------------------------------------------------
// Deterministic canonicalization
// ---------------------------------------------------------------------------

test("canonicalization is deterministic regardless of json key insertion order", () => {
  const a = baseFields({ payload: { a: 1, b: 2, nested: { x: 1, y: 2 } } });
  const b = baseFields({ payload: { nested: { y: 2, x: 1 }, b: 2, a: 1 } });
  assert.equal(canonicalizeEntry(a), canonicalizeEntry(b));
  assert.equal(computeEntryHash(a, null), computeEntryHash(b, null));
});

test("identical content yields identical entry_hash; different content differs", () => {
  const a = baseFields();
  const b = baseFields();
  assert.equal(computeEntryHash(a, null), computeEntryHash(b, null));

  const c = baseFields({ summary: "changed" });
  assert.notEqual(computeEntryHash(a, null), computeEntryHash(c, null));
});

test("entry_hash depends on prev_hash (chain binding)", () => {
  const fields = baseFields();
  assert.notEqual(computeEntryHash(fields, null), computeEntryHash(fields, "a".repeat(64)));
});

test("unsupported canonical_version throws", () => {
  assert.throws(() => canonicalizeEntry(baseFields(), 99), /Unsupported canonical_version/);
});

test("empty chain verifies as ok with count 0", () => {
  const result = verifyChain([]);
  assert.equal(result.ok, true);
  assert.equal(result.count, 0);
});
