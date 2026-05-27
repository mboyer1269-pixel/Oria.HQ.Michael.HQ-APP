#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

const originalNodeEnv = process.env.NODE_ENV;
const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalSupabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function clearSupabaseAdminEnv() {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
}

async function importReadModel() {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  return jiti.import(path.join(projectRoot, "src/server/actions/action-ledger-read.ts"));
}

async function importRepository() {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  return jiti.import(path.join(projectRoot, "src/server/actions/action-ledger-repository.ts"));
}

test.after(() => {
  process.env.NODE_ENV = originalNodeEnv;

  if (originalSupabaseUrl === undefined) {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  } else {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
  }

  if (originalSupabaseServiceRoleKey === undefined) {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  } else {
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalSupabaseServiceRoleKey;
  }
});

test("listActionLedgerForWorkspace returns empty local list in development without Supabase", async () => {
  process.env.NODE_ENV = "development";
  clearSupabaseAdminEnv();

  const { listActionLedgerForWorkspace } = await importReadModel();

  const result = await listActionLedgerForWorkspace({
    workspaceId: "michael-hq",
  });

  assert.equal(result.source, "local");
  assert.equal(result.workspaceId, "michael-hq");
  assert.ok(Array.isArray(result.entries));
});

test("listActionLedgerForWorkspace fails fast in production without Supabase", async () => {
  process.env.NODE_ENV = "production";
  clearSupabaseAdminEnv();

  const { listActionLedgerForWorkspace } = await importReadModel();

  await assert.rejects(
    () =>
      listActionLedgerForWorkspace({
        workspaceId: "michael-hq",
      }),
    /Supabase configuration is required for action ledger reads in production/,
  );
});

test("listActionLedgerForWorkspace returns local entries after writes for the same workspace", async () => {
  process.env.NODE_ENV = "development";
  clearSupabaseAdminEnv();

  const { createActionLedgerRepository } = await importRepository();
  const { listActionLedgerForWorkspace } = await importReadModel();

  const repository = createActionLedgerRepository({
    userId: "owner-test",
    storagePreference: "local",
  });

  await repository.record({
    actionType: "calendar.book",
    eventType: "decision",
    summary: "Décision test",
    autonomyLevel: 2,
    requiresConfirmation: true,
    workspaceId: "michael-hq",
    skillId: "calendar.book",
    agentId: "joris",
    metadata: { modeId: "hq" },
  });

  const result = await listActionLedgerForWorkspace({
    workspaceId: "michael-hq",
    limit: 5,
  });

  assert.equal(result.source, "local");
  assert.ok(result.entries.length >= 1);
  assert.equal(result.entries[0]?.actionType, "calendar.book");
  assert.equal(result.entries[0]?.eventType, "decision");
  assert.equal(result.entries[0]?.workspaceId, "michael-hq");
});

test("listActionLedgerForWorkspace clamps limit to max", async () => {
  process.env.NODE_ENV = "development";
  clearSupabaseAdminEnv();

  const { listActionLedgerForWorkspace, MAX_LEDGER_ACTIVITY_LIMIT } = await importReadModel();

  const result = await listActionLedgerForWorkspace({
    workspaceId: "michael-hq",
    limit: 999,
  });

  assert.ok(result.entries.length <= MAX_LEDGER_ACTIVITY_LIMIT);
});
