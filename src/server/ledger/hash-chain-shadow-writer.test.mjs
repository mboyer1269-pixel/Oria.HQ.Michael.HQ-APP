#!/usr/bin/env node

// src/server/ledger/hash-chain-shadow-writer.test.mjs
//
// Tests for the in-memory ShadowChainWriter (no DB, no env, pure).
// Proves the writer seals + chains entries correctly, exposes immutable
// snapshots, and that its chain is genuinely HMAC-sealed (verifies under the
// configured key, fails under another).
// Node 22.18+/25 strip TS types, so the .ts modules import directly.

import assert from "node:assert/strict";
import test from "node:test";

import {
  ShadowChainWriter,
  createShadowChainWriter,
} from "./hash-chain-shadow-writer.ts";
import { verifyChain } from "./hash-chain-verifier.ts";

const TEST_HMAC_KEY = "test-only-shadow-writer-key-never-from-env";

/** Build a content-only SealableEntry (no seal fields) with overridable parts. */
function baseFields(overrides = {}) {
  return {
    id: "led_shadow_1",
    workspace_id: "michael-hq",
    user_id: "local-michael",
    agent_id: "joris",
    skill_id: null,
    mission_id: null,
    action_type: "shadow.append",
    event_type: "decision",
    summary: "shadow writer entry",
    autonomy_level: 1,
    requires_confirmation: false,
    payload: { a: 1, b: 2 },
    metadata: { phase: "shadow" },
    created_at: "2026-06-08T00:00:00.000Z",
    ...overrides,
  };
}

test("constructor rejects an empty or non-string hmacKey", () => {
  assert.throws(() => new ShadowChainWriter({ hmacKey: "" }), /hmacKey is required/);
  assert.throws(() => new ShadowChainWriter({ hmacKey: undefined }), /hmacKey is required/);
});

test("append seals an entry and grows the chain (genesis prev_hash is null)", () => {
  const writer = new ShadowChainWriter({ hmacKey: TEST_HMAC_KEY });
  assert.equal(writer.length, 0);
  const sealed = writer.append(baseFields({ id: "led_shadow_a" }));
  assert.equal(writer.length, 1);
  assert.equal(sealed.prev_hash, null);
  assert.match(sealed.entry_hash, /^[0-9a-f]{64}$/);
  assert.equal(typeof sealed.hmac, "string");
});

test("chain linkage: second entry prev_hash === first entry_hash", () => {
  const writer = new ShadowChainWriter({ hmacKey: TEST_HMAC_KEY });
  const first = writer.append(baseFields({ id: "led_shadow_1" }));
  const second = writer.append(baseFields({ id: "led_shadow_2" }));
  assert.equal(second.prev_hash, first.entry_hash);
  assert.equal(writer.length, 2);
});

test("getTail returns the last entry, or null when empty", () => {
  const writer = new ShadowChainWriter({ hmacKey: TEST_HMAC_KEY });
  assert.equal(writer.getTail(), null);
  const entry = writer.append(baseFields());
  assert.deepEqual(writer.getTail(), entry);
});

test("getChain returns a frozen copy that cannot mutate internal state", () => {
  const writer = new ShadowChainWriter({ hmacKey: TEST_HMAC_KEY });
  writer.append(baseFields());
  const snapshot = writer.getChain();
  assert.ok(Object.isFrozen(snapshot));
  assert.throws(() => snapshot.push(baseFields()));
  assert.equal(writer.length, 1);
});

test("verify returns ok:true with the right count for a well-formed chain", () => {
  const writer = new ShadowChainWriter({ hmacKey: TEST_HMAC_KEY });
  writer.append(baseFields({ id: "a" }));
  writer.append(baseFields({ id: "b" }));
  writer.append(baseFields({ id: "c" }));
  const result = writer.verify();
  assert.equal(result.ok, true);
  assert.equal(result.count, 3);
});

test("chain is genuinely HMAC-sealed: verifies under its key, fails under another", () => {
  const writer = new ShadowChainWriter({ hmacKey: TEST_HMAC_KEY });
  writer.append(baseFields({ id: "a" }));
  writer.append(baseFields({ id: "b" }));
  assert.equal(writer.verify().ok, true);
  const wrong = verifyChain(writer.getChain(), { hmacKey: "a-different-key" });
  assert.equal(wrong.ok, false);
});

test("reset empties the chain (verify of empty chain is vacuously ok)", () => {
  const writer = new ShadowChainWriter({ hmacKey: TEST_HMAC_KEY });
  writer.append(baseFields());
  writer.append(baseFields({ id: "b" }));
  assert.equal(writer.length, 2);
  writer.reset();
  assert.equal(writer.length, 0);
  assert.equal(writer.getTail(), null);
  const result = writer.verify();
  assert.equal(result.ok, true);
  assert.equal(result.count, 0);
});

test("verifyOnAppend:true seals and verifies each append without throwing", () => {
  const writer = new ShadowChainWriter({ hmacKey: TEST_HMAC_KEY, verifyOnAppend: true });
  assert.doesNotThrow(() => {
    writer.append(baseFields({ id: "a" }));
    writer.append(baseFields({ id: "b" }));
  });
  assert.equal(writer.length, 2);
});

test("createShadowChainWriter factory behaves like the constructor", () => {
  const writer = createShadowChainWriter({ hmacKey: TEST_HMAC_KEY });
  assert.ok(writer instanceof ShadowChainWriter);
  writer.append(baseFields());
  assert.equal(writer.verify().ok, true);
});

test("determinism: same key + same content => identical entry_hash and hmac", () => {
  const w1 = new ShadowChainWriter({ hmacKey: TEST_HMAC_KEY });
  const w2 = new ShadowChainWriter({ hmacKey: TEST_HMAC_KEY });
  const a = w1.append(baseFields({ id: "same" }));
  const b = w2.append(baseFields({ id: "same" }));
  assert.equal(a.entry_hash, b.entry_hash);
  assert.equal(a.hmac, b.hmac);
});

test("different keys keep entry_hash but change hmac (key binds only the hmac)", () => {
  const w1 = new ShadowChainWriter({ hmacKey: "key-one" });
  const w2 = new ShadowChainWriter({ hmacKey: "key-two" });
  const a = w1.append(baseFields({ id: "same" }));
  const b = w2.append(baseFields({ id: "same" }));
  assert.equal(a.entry_hash, b.entry_hash);
  assert.notEqual(a.hmac, b.hmac);
});
