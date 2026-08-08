#!/usr/bin/env node

import assert from "node:assert/strict";
import test from "node:test";

const { getLedgerHmacKey, LEDGER_HMAC_KEY_ENV } = await import("./hash-chain-hmac-key.ts");

test("getLedgerHmacKey returns undefined when absent or empty", () => {
  assert.equal(getLedgerHmacKey({}), undefined);
  assert.equal(getLedgerHmacKey({ [LEDGER_HMAC_KEY_ENV]: "" }), undefined);
  assert.equal(getLedgerHmacKey({ [LEDGER_HMAC_KEY_ENV]: "   " }), undefined);
});

test("getLedgerHmacKey returns trimmed key when present", () => {
  assert.equal(getLedgerHmacKey({ [LEDGER_HMAC_KEY_ENV]: " secret-key " }), "secret-key");
});
