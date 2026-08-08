#!/usr/bin/env node

// Locks live seal-on-append behavior for the local action ledger repository:
// flag OFF → no chain columns; flag ON + HMAC → linked sealed entries.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

const originalNodeEnv = process.env.NODE_ENV;
const originalWrite = process.env.LEDGER_HASH_CHAIN_WRITE;
const originalHmac = process.env.LEDGER_HMAC_KEY;
const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalSupabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function clearSupabaseAdminEnv() {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
}

async function loadModules() {
  process.env.NODE_ENV = "development";
  clearSupabaseAdminEnv();

  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const repo = await jiti.import(
    path.join(projectRoot, "src/server/actions/action-ledger-repository.ts"),
  );
  const audit = await jiti.import(
    path.join(projectRoot, "src/server/ledger/hash-chain-workspace-audit.ts"),
  );

  return {
    createActionLedgerRepository: repo.createActionLedgerRepository,
    auditWorkspaceLedgerChain: audit.auditWorkspaceLedgerChain,
  };
}

test.after(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;

  if (originalWrite === undefined) delete process.env.LEDGER_HASH_CHAIN_WRITE;
  else process.env.LEDGER_HASH_CHAIN_WRITE = originalWrite;

  if (originalHmac === undefined) delete process.env.LEDGER_HMAC_KEY;
  else process.env.LEDGER_HMAC_KEY = originalHmac;

  if (originalSupabaseUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;

  if (originalSupabaseServiceRoleKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = originalSupabaseServiceRoleKey;
});

test("local record leaves chain fields unset when write flag is OFF", async () => {
  delete process.env.LEDGER_HASH_CHAIN_WRITE;
  delete process.env.LEDGER_HMAC_KEY;

  const { createActionLedgerRepository } = await loadModules();
  const repository = createActionLedgerRepository({
    userId: "owner-seal-test",
    storagePreference: "local",
  });

  const entry = await repository.record({
    actionType: "calendar.book",
    summary: "Unsealed decision",
    autonomyLevel: 1,
    requiresConfirmation: true,
    workspaceId: "ws-seal-off",
  });

  assert.equal(entry.entryHash, undefined);
  assert.equal(entry.prevHash, undefined);
});

test("local record seals a linked chain when write flag is ON", async () => {
  process.env.LEDGER_HASH_CHAIN_WRITE = "1";
  process.env.LEDGER_HMAC_KEY = "local-test-hmac-key-never-commit";

  const { createActionLedgerRepository, auditWorkspaceLedgerChain } = await loadModules();
  const repository = createActionLedgerRepository({
    userId: "owner-seal-test",
    storagePreference: "local",
  });

  const workspaceId = `ws-seal-on-${Date.now()}`;
  const first = await repository.record({
    actionType: "calendar.book",
    eventType: "decision",
    summary: "Genesis seal",
    autonomyLevel: 1,
    requiresConfirmation: true,
    workspaceId,
  });
  const second = await repository.record({
    actionType: "calendar.book",
    eventType: "action",
    summary: "Successor seal",
    autonomyLevel: 1,
    requiresConfirmation: false,
    workspaceId,
  });

  assert.equal(typeof first.entryHash, "string");
  assert.equal(first.entryHash.length, 64);
  assert.equal(first.prevHash, null);
  assert.equal(second.prevHash, first.entryHash);
  assert.equal(typeof second.entryHash, "string");

  const view = await auditWorkspaceLedgerChain(workspaceId);
  assert.equal(view.status, "intact");
  assert.equal(view.sealedCount, 2);
  assert.equal(view.hmacChecked, true);
});
