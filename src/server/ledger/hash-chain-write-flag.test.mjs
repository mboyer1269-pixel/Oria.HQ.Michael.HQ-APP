/**
 * hash-chain-write-flag.test.mjs
 *
 * The live hash-chain write flag must default OFF and only enable on an
 * explicit recognized truthy value. OFF is the invariant that keeps the current
 * ledger write path unchanged.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const { isHashChainWriteEnabled, HASH_CHAIN_WRITE_ENV } = await import(
  "./hash-chain-write-flag.ts"
);

test("defaults OFF when the toggle is unset", () => {
  assert.equal(isHashChainWriteEnabled({}), false);
});

test("OFF for empty / unknown / falsey values", () => {
  for (const v of ["", "0", "false", "off", "no", "nope", " ", "enabled?"]) {
    assert.equal(isHashChainWriteEnabled({ [HASH_CHAIN_WRITE_ENV]: v }), false, v);
  }
});

test("ON only for recognized truthy values (case/space-insensitive)", () => {
  for (const v of ["1", "true", "on", "yes", "TRUE", " On ", "YES"]) {
    assert.equal(isHashChainWriteEnabled({ [HASH_CHAIN_WRITE_ENV]: v }), true, v);
  }
});

test("reads process.env by default — OFF in the test environment", () => {
  // The runner does not set LEDGER_HASH_CHAIN_WRITE.
  assert.equal(isHashChainWriteEnabled(), false);
});
