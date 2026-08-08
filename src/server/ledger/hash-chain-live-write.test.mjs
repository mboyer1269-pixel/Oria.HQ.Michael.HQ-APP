#!/usr/bin/env node
/**
 * hash-chain-live-write.test.mjs — seal helpers + flag/key fail-closed contracts.
 *
 * Pure unit tests. No DB. Does not flip the process-wide write flag permanently.
 */

import assert from "node:assert/strict";
import test from "node:test";

const {
  allocateLedgerSealIdentity,
  getLedgerHmacKey,
  requireLiveSealHmacKey,
  resolveLocalChainTail,
  sealLiveLedgerAppend,
  toCanonicalLedgerFields,
  LEDGER_HMAC_KEY_ENV,
} = await import("./hash-chain-live-write.ts");
const { HASH_CHAIN_WRITE_ENV } = await import("./hash-chain-write-flag.ts");
const { auditChain } = await import("./hash-chain-audit.ts");

const HMAC = "test-hmac-key-for-live-write-unit";

test("getLedgerHmacKey ignores empty / whitespace", () => {
  assert.equal(getLedgerHmacKey({}), undefined);
  assert.equal(getLedgerHmacKey({ [LEDGER_HMAC_KEY_ENV]: "" }), undefined);
  assert.equal(getLedgerHmacKey({ [LEDGER_HMAC_KEY_ENV]: "  " }), undefined);
  assert.equal(getLedgerHmacKey({ [LEDGER_HMAC_KEY_ENV]: ` ${HMAC} ` }), HMAC);
});

test("requireLiveSealHmacKey returns null when flag OFF", () => {
  assert.equal(
    requireLiveSealHmacKey({ [HASH_CHAIN_WRITE_ENV]: "0", [LEDGER_HMAC_KEY_ENV]: HMAC }),
    null,
  );
});

test("requireLiveSealHmacKey fails closed when flag ON without key", () => {
  assert.throws(
    () => requireLiveSealHmacKey({ [HASH_CHAIN_WRITE_ENV]: "1" }),
    /LEDGER_HMAC_KEY/,
  );
});

test("requireLiveSealHmacKey returns key when flag ON", () => {
  assert.equal(
    requireLiveSealHmacKey({ [HASH_CHAIN_WRITE_ENV]: "true", [LEDGER_HMAC_KEY_ENV]: HMAC }),
    HMAC,
  );
});

test("allocateLedgerSealIdentity yields uuid + iso timestamp", () => {
  const identity = allocateLedgerSealIdentity(new Date("2026-08-08T12:00:00.000Z"));
  assert.match(identity.id, /^[0-9a-f-]{36}$/i);
  assert.equal(identity.createdAt, "2026-08-08T12:00:00.000Z");
});

test("sealLiveLedgerAppend links genesis → successor and verifies", () => {
  const gIdentity = { id: "led_g", createdAt: "2026-08-08T12:00:00.000Z" };
  const base = {
    workspaceId: "ws_1",
    userId: "user_1",
    actionType: "test.append",
    summary: "genesis",
    autonomyLevel: 1,
    requiresConfirmation: false,
    payload: {},
    metadata: {},
    hmacKey: HMAC,
  };

  const genesisCols = sealLiveLedgerAppend({
    ...base,
    identity: gIdentity,
    tail: null,
  });
  assert.equal(genesisCols.prev_hash, null);
  assert.match(genesisCols.entry_hash, /^[0-9a-f]{64}$/);

  const genesisEntry = {
    ...toCanonicalLedgerFields({ ...base, identity: gIdentity }),
    ...genesisCols,
  };

  const sIdentity = { id: "led_s", createdAt: "2026-08-08T12:00:01.000Z" };
  const successorCols = sealLiveLedgerAppend({
    ...base,
    identity: sIdentity,
    summary: "successor",
    tail: genesisEntry,
  });
  assert.equal(successorCols.prev_hash, genesisCols.entry_hash);

  const chain = [
    genesisEntry,
    {
      ...toCanonicalLedgerFields({ ...base, identity: sIdentity, summary: "successor" }),
      ...successorCols,
    },
  ];
  const report = auditChain(chain, { hmacKey: HMAC });
  assert.equal(report.ok, true);
  assert.equal(report.count, 2);
});

test("resolveLocalChainTail picks latest sealed entry for workspace", () => {
  const entries = [
    {
      id: "a",
      userId: "u",
      actionType: "t",
      summary: "a",
      autonomyLevel: 1,
      requiresConfirmation: false,
      payload: {},
      metadata: {},
      createdAt: "2026-08-08T10:00:00.000Z",
      workspaceId: "ws",
      entryHash: "1".repeat(64),
      prevHash: null,
    },
    {
      id: "b",
      userId: "u",
      actionType: "t",
      summary: "b",
      autonomyLevel: 1,
      requiresConfirmation: false,
      payload: {},
      metadata: {},
      createdAt: "2026-08-08T11:00:00.000Z",
      workspaceId: "ws",
      entryHash: "2".repeat(64),
      prevHash: "1".repeat(64),
    },
    {
      id: "other",
      userId: "u",
      actionType: "t",
      summary: "other",
      autonomyLevel: 1,
      requiresConfirmation: false,
      payload: {},
      metadata: {},
      createdAt: "2026-08-08T12:00:00.000Z",
      workspaceId: "other",
      entryHash: "3".repeat(64),
      prevHash: null,
    },
  ];

  const tip = resolveLocalChainTail(entries, "ws");
  assert.ok(tip);
  assert.equal(tip.id, "b");
  assert.equal(tip.entry_hash, "2".repeat(64));
  assert.equal(resolveLocalChainTail(entries, "missing"), null);
});
