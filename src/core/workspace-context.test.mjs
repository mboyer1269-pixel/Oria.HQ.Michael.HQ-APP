#!/usr/bin/env node

// Auth gate critical path (offline): getActiveWorkspaceContext composes the
// active user + workspace + mode + assistant from the source of truth. Dev
// fallback owner only — no real user/workspace/email, no network.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// This test lives in src/core (2 levels below the repo root).
const projectRoot = path.resolve(__dirname, "..", "..");

process.env.NODE_ENV = "development";
delete process.env.MICHAEL_HQ_OWNER_ID;

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});

const { getActiveWorkspaceContext } = await jiti.import(
  path.join(projectRoot, "src/core/workspace-context.ts"),
);

test("getActiveWorkspaceContext composes a consistent context (dev fallback)", () => {
  const ctx = getActiveWorkspaceContext();

  // Workspace + mode + assistant come from the configured source of truth.
  assert.equal(ctx.activeWorkspace.id, "michael-hq");
  assert.equal(ctx.workspace.id, "michael-hq");
  assert.equal(ctx.activeMode.id, "hq");
  assert.equal(ctx.activeAgentProfile.id, "joris");
  assert.ok(ctx.activeAgentProfile.allowedTools.includes("calendar.book"));

  // Dev fallback identity wires through consistently (no real owner configured).
  assert.equal(ctx.userId, "local-michael");
  assert.equal(ctx.storagePreference, "local");
  assert.equal(ctx.currentOwnerUser.id, ctx.userId);
  assert.equal(ctx.activeWorkspace.ownerUserId, ctx.userId);
});
