#!/usr/bin/env node

// ---------------------------------------------------------------------------
// execution-attempt-store-enforcement.test.mjs
//
// Locks the EXECUTION-ATTEMPT enforcement behaviour of the real in-memory store
// (src/server/missions/execution-attempt-store.ts), which composes the real
// idempotency + rate-limit primitives (idempotency-contract.ts). Together they
// are the replay/flood guard for mission execution attempts: an attempt cannot
// be recorded twice (idempotency/replay), attempts are bounded per workspace
// (rate limit), a missing key is rejected, and reserving an attempt blocks a
// replay of the same key.
//
// Prior coverage exercised only the production fail-fast guard and the
// dev-available case; the enforcement paths above had no direct test, and
// idempotency-contract.ts had no test file at all. This closes that gap.
//
// Test-only: no source change, no DB, no Supabase, no runtime dispatch, no
// ledger write. Runs in development mode (local in-memory store).
// ---------------------------------------------------------------------------

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const originalNodeEnv = process.env.NODE_ENV;
process.env.NODE_ENV = "development";

test.after(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});

const storePath = path.join(projectRoot, "src/server/missions/execution-attempt-store.ts");
const contractPath = path.join(projectRoot, "src/server/missions/idempotency-contract.ts");

const { checkExecutionAttempt, recordAttempt } = await jiti.import(storePath);
const { DEFAULT_RATE_LIMIT_CONFIG } = await jiti.import(contractPath);

// Each test uses a distinct workspaceId so the module-level in-memory stores
// (idempotency + rate-limit) cannot leak enforcement state across tests.
function input(workspaceId, idempotencyKey, missionId = "msn_test") {
  return { missionId, workspaceId, idempotencyKey };
}

test("a missing idempotency key is rejected (never executable)", () => {
  const empty = checkExecutionAttempt(input("ws-missing", ""));
  assert.equal(empty.allowed, false);
  assert.equal(empty.reason, "missing_idempotency_key");

  const blank = checkExecutionAttempt(input("ws-missing", "   "));
  assert.equal(blank.allowed, false);
  assert.equal(blank.reason, "missing_idempotency_key");
});

test("a fresh attempt is allowed, then the same key is a duplicate (replay blocked)", () => {
  const first = checkExecutionAttempt(input("ws-dup", "ws-dup:msn_test:req_1"));
  assert.equal(first.allowed, true);

  // Reserve-before-build: recording the attempt must block a replay of the key.
  recordAttempt(input("ws-dup", "ws-dup:msn_test:req_1"));

  const replay = checkExecutionAttempt(input("ws-dup", "ws-dup:msn_test:req_1"));
  assert.equal(replay.allowed, false);
  assert.equal(replay.reason, "duplicate_key");
});

test("a distinct key in the same workspace is not a duplicate", () => {
  recordAttempt(input("ws-distinct", "ws-distinct:msn_test:req_1"));
  const other = checkExecutionAttempt(input("ws-distinct", "ws-distinct:msn_test:req_2"));
  assert.equal(other.allowed, true);
});

test("attempts are rate-limited per workspace once the window is full", () => {
  const max = DEFAULT_RATE_LIMIT_CONFIG.maxAttempts;
  const ws = "ws-rate";

  for (let i = 0; i < max; i++) {
    const key = `${ws}:msn_test:req_${i}`;
    const check = checkExecutionAttempt(input(ws, key));
    assert.equal(check.allowed, true, `attempt ${i + 1}/${max} should be allowed`);
    recordAttempt(input(ws, key));
  }

  const overflow = checkExecutionAttempt(input(ws, `${ws}:msn_test:req_overflow`));
  assert.equal(overflow.allowed, false);
  assert.equal(overflow.reason, "rate_limit_exceeded");
});

test("rate limiting is isolated per workspace", () => {
  const max = DEFAULT_RATE_LIMIT_CONFIG.maxAttempts;
  const saturated = "ws-iso-saturated";

  for (let i = 0; i < max; i++) {
    recordAttempt(input(saturated, `${saturated}:msn_test:req_${i}`));
  }
  const blocked = checkExecutionAttempt(input(saturated, `${saturated}:msn_test:req_overflow`));
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, "rate_limit_exceeded");

  // A different workspace is unaffected by the saturated one.
  const fresh = checkExecutionAttempt(input("ws-iso-fresh", "ws-iso-fresh:msn_test:req_1"));
  assert.equal(fresh.allowed, true);
});
