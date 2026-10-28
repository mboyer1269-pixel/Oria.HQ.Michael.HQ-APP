#!/usr/bin/env node
// Atelier fixes on PR #452 (approved by Michael): revert_conflict, catch-path
// status mapping, response after markExecuted fails, refusal ledger operation,
// plus the Sentinelle P2 coverage gaps. SIMULATED: local-fallback repo and
// ledger, real route handlers, fetch replaced — no network, no Supabase.
import assert from "node:assert/strict";
import test from "node:test";
import {
  WS, repo, rateLimit, service, logger, createIntent, getIntent, approve,
  installN8n, clearHook, ledgerFor,
} from "../../../proofs/approval-route-harness.mjs";

function spyLoggerError() {
  const original = logger.error;
  const events = [];
  logger.error = (event, ...rest) => { events.push(event); return original.call(logger, event, ...rest); };
  return { events, restore: () => { logger.error = original; } };
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
function exhaustRateLimit(row) {
  rateLimit.__resetRateLimitersForTests();
  const P = rateLimit.RATE_LIMIT_POLICIES.n8n_dispatch;
  const key = rateLimit.rateLimitKey(P, `${WS}:${row.agentId}`);
  return (async () => { for (let i = 0; i < P.limit; i += 1) await rateLimit.isAllowed(key, P.limit, P.windowMs); })();
}

test("fix1: a conditional claim revert that matches 0 rows is reported as revert_conflict, not success", async () => {
  const res = await service.approveAndDispatchExecutionIntent(baseDeps({
    recordAttempt: async () => { throw new Error("ledger down"); },
    revertClaim: async () => { throw new Error("0 rows"); },
    readStatus: async () => "executed", // what the store holds after the conflict
  }));
  assert.equal(res.ok, false);
  assert.equal(res.status, "executed", "status must be re-read from the store, not assumed");
  assert.equal(res.revert, "revert_conflict");
});

test("fix2: a transient (non-conflict) error in the route maps to 503, not a generic 500", async () => {
  rateLimit.__resetRateLimitersForTests();
  const id = await createIntent("atelier-503");
  repo.__setBeforeLocalTransitionHookForTests((ws, intentId, patch) => {
    if (intentId === id && patch.toStatus === "executing") throw new Error("db connection reset");
  });
  const n8n = installN8n();
  // logger.error(event, meta): capture meta to read the alert field.
  const original = logger.error;
  const calls = [];
  logger.error = (event, meta) => { calls.push({ event, meta }); return original.call(logger, event, meta); };
  try {
    const r = await approve(id);
    assert.equal(r.status, 503);
    assert.equal(n8n.calls.length, 0);
    const failed = calls.find((c) => c.event === "agent.execution-intent.approve.failed");
    assert.ok(failed, JSON.stringify(calls.map((c) => c.event)));
    assert.equal(failed.meta?.alert, true, "the 503 catch must raise an operator alert");
    assert.equal(failed.meta?.intentId, id);
  } finally { logger.error = original; clearHook(); n8n.restore(); }
});

test("fix3: markExecuted fails after dispatch → uncertain/dispatched response, stays executing, alert, no resend", async () => {
  rateLimit.__resetRateLimitersForTests();
  const id = await createIntent("atelier-mark-executed");
  repo.__setBeforeLocalTransitionHookForTests((ws, intentId, patch) => {
    if (intentId === id && patch.toStatus === "executed") throw new Error("db write lost");
  });
  const n8n = installN8n();
  const spy = spyLoggerError();
  try {
    const r = await approve(id);
    assert.notEqual(r.status, 500);
    assert.ok(r.status < 500, `must not invite a retry, got ${r.status}`);
    assert.equal(r.body.status, "executing");
    assert.equal(r.body.outcome, "dispatched_unconfirmed");
    assert.equal((await getIntent(id)).status, "executing");
    assert.ok(spy.events.includes("agent.execution-intent.approve.mark_executed_failed"));
    clearHook();
    const again = await approve(id);
    assert.equal(again.status, 409);
    assert.equal(n8n.calls.length, 1, "no resend");
  } finally { clearHook(); spy.restore(); n8n.restore(); }
});

test("fix2: markFailed failing after a plain dispatch failure does not become a 500", async () => {
  const res = await service.approveAndDispatchExecutionIntent(baseDeps({
    dispatch: async () => ({ ok: false, error: "n8n 4xx" }),
    markFailed: async () => { throw new Error("db down"); },
  }));
  assert.equal(res.ok, false);
  assert.equal(res.status, "executing");
  assert.equal(res.httpStatus, 503);
});

test("fix4: the refusal ledger event uses operation 'refuse', not 'execute'", async () => {
  rateLimit.__resetRateLimitersForTests();
  const id = await createIntent("atelier-refuse-op");
  repo.__setBeforeLocalTransitionHookForTests((ws, intentId, patch) => {
    if (intentId !== id || patch.toStatus !== "executing") return;
    queueMicrotask(() => repo.__mutateAgentExecutionIntentPayloadForTests(ws, intentId, (p) => ({ ...p, client: "Tampered" })));
  });
  const n8n = installN8n();
  try {
    const r = await approve(id);
    assert.equal(r.status, 403);
    const refused = ledgerFor(id).filter((e) => e.metadata.phase === "refused");
    assert.equal(refused.length, 1);
    const op = refused[0].effect?.operation ?? refused[0].payload?.effect?.operation ?? refused[0].effectOperation;
    assert.equal(op, "refuse");
  } finally { clearHook(); n8n.restore(); }
});

test("P2: post-claim refusal keeps 403 + ruleId even when markFailed fails", async () => {
  rateLimit.__resetRateLimitersForTests();
  const id = await createIntent("atelier-403-markfailed");
  repo.__setBeforeLocalTransitionHookForTests((ws, intentId, patch) => {
    if (intentId !== id) return;
    if (patch.toStatus === "executing") {
      queueMicrotask(() => repo.__mutateAgentExecutionIntentPayloadForTests(ws, intentId, (p) => ({ ...p, client: "Tampered" })));
    }
    if (patch.toStatus === "failed") throw new Error("db down on markFailed");
  });
  const n8n = installN8n();
  const spy = spyLoggerError();
  try {
    const r = await approve(id);
    assert.equal(r.status, 403);
    assert.ok(r.body.ruleId);
    assert.equal(n8n.calls.length, 0);
    assert.ok(spy.events.includes("agent.execution-intent.mark_failed_after_refusal.failed"));
  } finally { clearHook(); spy.restore(); n8n.restore(); }
});

test("P2: ledger failure after a success raises an alert and keeps the executed outcome", async () => {
  const spy = spyLoggerError();
  try {
    const res = await service.approveAndDispatchExecutionIntent(baseDeps({
      recordResult: async () => { throw new Error("ledger down after effect"); },
    }));
    assert.equal(res.status, "executed");
    assert.ok(spy.events.includes("agent.execution-intent.ledger_result.failed"));
  } finally { spy.restore(); }
});

// Last: exhausts the in-memory n8n window, which the test reset does not clear.
test("fix1/P2: rate-limited revert is conditional on the payload too (expectedPayload guard)", async () => {
  rateLimit.__resetRateLimitersForTests();
  const id = await createIntent("atelier-revert-payload");
  await exhaustRateLimit(await getIntent(id));
  repo.__setBeforeLocalTransitionHookForTests((ws, intentId, patch) => {
    if (intentId !== id || patch.toStatus !== "pending") return;
    repo.__setBeforeLocalTransitionHookForTests(null);
    // Status stays `executing`; only the payload moves. Only expectedPayload can catch it.
    repo.__mutateAgentExecutionIntentPayloadForTests(ws, intentId, (p) => ({ ...p, client: "Moved Inc" }));
  });
  const n8n = installN8n();
  try {
    const r = await approve(id);
    assert.equal(r.status, 409);
    assert.equal(r.body.reason, "revert_conflict");
    assert.equal((await getIntent(id)).status, "executing");
    assert.equal(n8n.calls.length, 0);
  } finally { clearHook(); n8n.restore(); rateLimit.__resetRateLimitersForTests(); }
});
