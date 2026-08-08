#!/usr/bin/env node

// Live seal helpers + local action-ledger seal-on-write (flag-gated).

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

const TEST_KEY = "test-only-live-seal-key-never-from-env";

async function importLiveSeal() {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });
  return jiti.import(path.join(__dirname, "hash-chain-live-seal.ts"));
}

async function importRepository() {
  process.env.NODE_ENV = "development";
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });
  return jiti.import(path.join(projectRoot, "src/server/actions/action-ledger-repository.ts"));
}

function sampleFields(overrides = {}) {
  return {
    id: "act_live_1",
    userId: "user_1",
    workspaceId: "ws_live",
    actionType: "test.seal",
    summary: "seal me",
    autonomyLevel: 1,
    requiresConfirmation: false,
    payload: {},
    metadata: {},
    createdAt: "2026-08-08T12:00:00.000Z",
    ...overrides,
  };
}

test("sealLiveLedgerEntry returns null when write flag is OFF", async () => {
  const { sealLiveLedgerEntry } = await importLiveSeal();
  const cols = sealLiveLedgerEntry({
    fields: sampleFields(),
    tail: null,
    enabled: false,
    hmacKey: TEST_KEY,
  });
  assert.equal(cols, null);
});

test("sealLiveLedgerEntry seals genesis when enabled", async () => {
  const { sealLiveLedgerEntry } = await importLiveSeal();
  const cols = sealLiveLedgerEntry({
    fields: sampleFields(),
    tail: null,
    enabled: true,
    hmacKey: TEST_KEY,
  });
  assert.ok(cols);
  assert.equal(cols.prev_hash, null);
  assert.equal(typeof cols.entry_hash, "string");
  assert.equal(cols.entry_hash.length, 64);
  assert.ok(cols.hmac);
});

test("sealLiveLedgerEntry chains to the tip entry_hash", async () => {
  const { sealLiveLedgerEntry, tipFromStoredChain } = await importLiveSeal();
  const genesis = sealLiveLedgerEntry({
    fields: sampleFields({ id: "act_g" }),
    tail: null,
    enabled: true,
    hmacKey: TEST_KEY,
  });
  const tip = tipFromStoredChain({
    id: "act_g",
    entryHash: genesis.entry_hash,
    prevHash: null,
    hmac: genesis.hmac,
  });
  const second = sealLiveLedgerEntry({
    fields: sampleFields({ id: "act_2", summary: "second" }),
    tail: tip,
    enabled: true,
    hmacKey: TEST_KEY,
  });
  assert.equal(second.prev_hash, genesis.entry_hash);
  assert.notEqual(second.entry_hash, genesis.entry_hash);
});

test("sealLiveLedgerEntry throws when enabled without hmac key", async () => {
  const { sealLiveLedgerEntry } = await importLiveSeal();
  assert.throws(
    () =>
      sealLiveLedgerEntry({
        fields: sampleFields(),
        tail: null,
        enabled: true,
        hmacKey: "",
        env: { LEDGER_HASH_CHAIN_WRITE: "1" },
      }),
    /hmacKey/,
  );
});

test("local repository leaves rows unsealed when flag OFF", async () => {
  delete process.env.LEDGER_HASH_CHAIN_WRITE;
  delete process.env.LEDGER_HMAC_KEY;
  const repoMod = await importRepository();
  repoMod.clearLocalActionLedgerEntriesForTests();
  const repo = repoMod.createActionLedgerRepository({
    userId: "user_local",
    storagePreference: "local",
  });
  const entry = await repo.record({
    actionType: "test.unsealed",
    summary: "no seal",
    autonomyLevel: 1,
    requiresConfirmation: false,
    workspaceId: "ws_a",
  });
  assert.equal(entry.entryHash, undefined);
  assert.equal(entry.prevHash, undefined);
});

test("local repository seals a chain when flag ON + HMAC key", async () => {
  process.env.LEDGER_HASH_CHAIN_WRITE = "1";
  process.env.LEDGER_HMAC_KEY = TEST_KEY;
  try {
    const repoMod = await importRepository();
    repoMod.clearLocalActionLedgerEntriesForTests();
    const repo = repoMod.createActionLedgerRepository({
      userId: "user_local",
      storagePreference: "local",
    });
    const first = await repo.record({
      actionType: "test.sealed",
      summary: "genesis",
      autonomyLevel: 1,
      requiresConfirmation: false,
      workspaceId: "ws_b",
    });
    const second = await repo.record({
      actionType: "test.sealed",
      summary: "next",
      autonomyLevel: 1,
      requiresConfirmation: false,
      workspaceId: "ws_b",
    });
    assert.equal(typeof first.entryHash, "string");
    assert.equal(first.prevHash, null);
    assert.equal(second.prevHash, first.entryHash);
    assert.notEqual(second.entryHash, first.entryHash);
  } finally {
    delete process.env.LEDGER_HASH_CHAIN_WRITE;
    delete process.env.LEDGER_HMAC_KEY;
  }
});
