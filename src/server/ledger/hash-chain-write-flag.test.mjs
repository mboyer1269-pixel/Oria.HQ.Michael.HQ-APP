/**
 * hash-chain-write-flag.test.mjs
 *
 * The live hash-chain write flag defaults ON (CEO mandate 2026-08-08).
 * Explicit falsey values opt out.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const { isHashChainWriteEnabled, HASH_CHAIN_WRITE_ENV } = await import(
  "./hash-chain-write-flag.ts"
);

test("defaults ON when the toggle is unset", () => {
  assert.equal(isHashChainWriteEnabled({}), true);
});

test("OFF for explicit falsey values", () => {
  for (const v of ["0", "false", "off", "no", "FALSE", " Off "]) {
    assert.equal(isHashChainWriteEnabled({ [HASH_CHAIN_WRITE_ENV]: v }), false, v);
  }
});

test("ON for empty string and recognized truthy values", () => {
  assert.equal(isHashChainWriteEnabled({ [HASH_CHAIN_WRITE_ENV]: "" }), true);
  for (const v of ["1", "true", "on", "yes", "TRUE", " On ", "YES"]) {
    assert.equal(isHashChainWriteEnabled({ [HASH_CHAIN_WRITE_ENV]: v }), true, v);
  }
});

test("reads process.env by default — ON in the test environment", () => {
  assert.equal(isHashChainWriteEnabled(), true);
});
