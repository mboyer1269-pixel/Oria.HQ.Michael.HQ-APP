#!/usr/bin/env node
// G1 follow-up 2: when the post-conflict re-read (deps.readStatus) itself
// fails, the service must answer status "unknown" (never a guessed
// "executing"/"pending"), keep the conflict signal, and log an alert.
// Service level with injected deps: the route's readStatus
// (getAgentExecutionIntent) has no failure seam without a production change.
// SIMULATED: injected deps, no repo, no network.
import assert from "node:assert/strict";
import test from "node:test";
import { service, logger } from "../../../proofs/approval-route-harness.mjs";

function spyLoggerError() {
  const original = logger.error;
  const calls = [];
  logger.error = (event, meta) => { calls.push({ event, meta }); };
  return { calls, restore: () => { logger.error = original; } };
}
const baseDeps = (over = {}) => ({
  evaluate: () => ({ outcome: "ALLOW", reason: "ok" }),
  markExecuting: async () => {},
  recordAttempt: async () => {},
  dispatch: async () => ({ ok: true, actionRef: "ref" }),
  recordResult: async () => {},
  markExecuted: async () => {},
  markFailed: async () => {},
  revertToPending: async () => {},
  revertClaim: async () => {},
  ...over,
});
const readFails = async () => { throw new Error("store unreachable"); };

test("429 + revert conflict + readStatus throws → 409 revert_conflict, status 'unknown', alert logged", async () => {
  const spy = spyLoggerError();
  try {
    const res = await service.approveAndDispatchExecutionIntent(baseDeps({
      dispatch: async () => ({ ok: false, rateLimited: true, error: "429" }),
      revertToPending: async () => { throw new Error("0 rows"); },
      readStatus: readFails,
    }));
    assert.equal(res.ok, false);
    assert.equal(res.httpStatus, 409);
    assert.equal(res.reason, "revert_conflict");
    assert.equal(res.status, "unknown");
    const alert = spy.calls.find((c) => c.event === "agent.execution-intent.reread_status.failed");
    assert.ok(alert, JSON.stringify(spy.calls.map((c) => c.event)));
    assert.equal(alert.meta?.alert, true);
  } finally { spy.restore(); }
});

test("ledger down + claim revert conflict + readStatus throws → 500 ledger_unavailable, revert_conflict, status 'unknown', alert", async () => {
  const spy = spyLoggerError();
  let dispatched = 0;
  try {
    const res = await service.approveAndDispatchExecutionIntent(baseDeps({
      recordAttempt: async () => { throw new Error("ledger down"); },
      revertClaim: async () => { throw new Error("0 rows"); },
      dispatch: async () => { dispatched += 1; return { ok: true }; },
      readStatus: readFails,
    }));
    assert.equal(res.httpStatus, 500);
    assert.equal(res.reason, "ledger_unavailable");
    assert.equal(res.revert, "revert_conflict");
    assert.equal(res.status, "unknown");
    assert.equal(dispatched, 0);
    const alert = spy.calls.find((c) => c.event === "agent.execution-intent.reread_status.failed");
    assert.equal(alert?.meta?.alert, true);
  } finally { spy.restore(); }
});
