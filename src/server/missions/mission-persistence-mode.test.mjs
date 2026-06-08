#!/usr/bin/env node

/**
 * mission-persistence-mode.test.mjs
 *
 * - resolveMissionPersistenceMode: durable only when flag ON AND Supabase
 *   configured; every other combination stays local.
 * - describeMissionDraftPersistence: default test env (no Supabase, flag OFF)
 *   reports local.
 */

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

async function loadModule() {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });
  return jiti.import(path.join(projectRoot, "src/server/missions/mission-persistence-mode.ts"));
}

test("resolveMissionPersistenceMode: durable only when flag ON and Supabase configured", async () => {
  const { resolveMissionPersistenceMode } = await loadModule();

  assert.equal(resolveMissionPersistenceMode(true, true).mode, "durable");
  assert.equal(resolveMissionPersistenceMode(true, false).mode, "local");
  assert.equal(resolveMissionPersistenceMode(false, true).mode, "local");
  assert.equal(resolveMissionPersistenceMode(false, false).mode, "local");
});

test("resolveMissionPersistenceMode: summaries distinguish the local reasons", async () => {
  const { resolveMissionPersistenceMode } = await loadModule();

  assert.match(resolveMissionPersistenceMode(true, true).summary, /durable/);
  assert.match(resolveMissionPersistenceMode(true, false).summary, /flag ON but Supabase not configured/);
  assert.match(resolveMissionPersistenceMode(false, false).summary, /durable persistence OFF/);
});

test("describeMissionDraftPersistence: default test env reports local", async () => {
  const { describeMissionDraftPersistence } = await loadModule();

  const status = describeMissionDraftPersistence();
  assert.equal(status.mode, "local");
  assert.equal(status.durableEnabled, false);
  assert.equal(typeof status.supabaseConfigured, "boolean");
  assert.match(status.summary, /local/);
});
