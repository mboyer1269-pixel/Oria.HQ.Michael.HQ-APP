#!/usr/bin/env node

// src/server/ledger/hash-chain-test-fixtures.test.mjs
//
// Tests for the pre-sealed hash-chain fixtures (chain1/chain3/chain5).
// Proves each fixture chain is well-formed, frozen, deterministic, and genuinely
// HMAC-sealed under TEST_HMAC_KEY. No DB, no env.
// Node 22.18+/25 strip TS types, so the .ts modules import directly.

import assert from "node:assert/strict";
import test from "node:test";

import {
  chain1,
  chain3,
  chain5,
  TEST_HMAC_KEY,
} from "./hash-chain-test-fixtures.ts";
import { verifyChain } from "./hash-chain-verifier.ts";

test("TEST_HMAC_KEY is a non-empty, clearly-test key", () => {
  assert.equal(typeof TEST_HMAC_KEY, "string");
  assert.ok(TEST_HMAC_KEY.length > 0);
  assert.match(TEST_HMAC_KEY, /test/i);
});

test("chains have the documented lengths", () => {
  assert.equal(chain1.length, 1);
  assert.equal(chain3.length, 3);
  assert.equal(chain5.length, 5);
});

test("every chain verifies under TEST_HMAC_KEY", () => {
  for (const chain of [chain1, chain3, chain5]) {
    const result = verifyChain(chain, { hmacKey: TEST_HMAC_KEY });
    assert.equal(result.ok, true);
    assert.equal(result.count, chain.length);
  }
});

test("chains are frozen (tests cannot mutate shared fixtures)", () => {
  assert.ok(Object.isFrozen(chain1));
  assert.ok(Object.isFrozen(chain3));
  assert.ok(Object.isFrozen(chain5));
});

test("genesis entry has null prev_hash; linkage holds across chain5", () => {
  assert.equal(chain5[0].prev_hash, null);
  for (let i = 1; i < chain5.length; i++) {
    assert.equal(chain5[i].prev_hash, chain5[i - 1].entry_hash);
  }
});

test("determinism: shorter chains share hashes with longer ones (same key + raw entries)", () => {
  assert.equal(chain3[0].entry_hash, chain1[0].entry_hash);
  assert.equal(chain5[0].entry_hash, chain1[0].entry_hash);
  assert.equal(chain5[1].entry_hash, chain3[1].entry_hash);
});

test("every entry_hash is 64-char lowercase hex", () => {
  for (const entry of chain5) {
    assert.match(entry.entry_hash, /^[0-9a-f]{64}$/);
  }
});

test("a wrong hmac key fails verification (chains are really sealed)", () => {
  const result = verifyChain(chain5, { hmacKey: "not-the-fixture-key" });
  assert.equal(result.ok, false);
});

test("tampering a copied entry breaks verification at that index", () => {
  const tampered = chain3.map((entry) => ({ ...entry }));
  tampered[1] = { ...tampered[1], summary: "tampered summary" };
  const result = verifyChain(tampered, { hmacKey: TEST_HMAC_KEY });
  assert.equal(result.ok, false);
  assert.equal(result.brokenAt, 1);
});
