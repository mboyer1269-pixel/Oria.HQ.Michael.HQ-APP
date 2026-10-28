#!/usr/bin/env node
// Follow-up behavioural tests (h3), (i), (j) for the fixes of 743817d.
import assert from "node:assert/strict";
import test from "node:test";
import {
  WS, repo, rateLimit, service, logger, createIntent, getIntent, approve,
  installN8n, tamperAfterClaim, clearHook, ledgerFor,
} from "../../../proofs/approval-route-harness.mjs";

function exhaustN8nRateLimit(agentId) {
  rateLimit.__resetRateLimitersForTests();
  const P = rateLimit.RATE_LIMIT_POLICIES.n8n_dispatch;
  const key = rateLimit.rateLimitKey(P, `${WS}:${agentId}`);
  return Promise.all(Array.from({ length: P.limit }, () => rateLimit.isAllowed(key, P.limit, P.windowMs)));
}

function spyLoggerError() {
  const original = logger.error;
  const events = [];
  logger.error = (event, ctx) => { events.push({ event, ctx }); };
  return { events, restore: () => void (logger.error = original) };
}

test("(h3) payload changed while executing, then rate-limited revert: 409, never back to pending", async () => {
  const id = await createIntent("h3");
  await exhaustN8nRateLimit((await getIntent(id)).agentId);
  repo.__setBeforeLocalTransitionHookForTests((ws, intentId, patch) => {
    if (intentId !== id || patch.toStatus !== "pending") return;
    repo.__setBeforeLocalTransitionHookForTests(null);
    // Status stays `executing`; only the payload moved under the claim.
    repo.__mutateAgentExecutionIntentPayloadForTests(ws, intentId, (p) => ({ ...p, client: "Changed While Executing" }));
  });
  const n8n = installN8n();
  try {
    const r = await approve(id);
    assert.equal(r.status, 409, JSON.stringify(r.body));
    assert.equal(r.body.reason, "revert_conflict");
    assert.notEqual((await getIntent(id)).status, "pending");
    assert.equal(n8n.calls.length, 0);
  } finally { clearHook(); n8n.restore(); rateLimit.__resetRateLimitersForTests(); }
});

test("(i) markFailed fails after a dispatch-stage refusal: still 403 with ruleId, failure logged", async () => {
  const id = await createIntent("i");
  const n8n = installN8n();
  const spy = spyLoggerError();
  repo.__setBeforeLocalTransitionHookForTests((ws, intentId, patch) => {
    if (intentId !== id) return;
    if (patch.toStatus === "executing") {
      queueMicrotask(() => repo.__mutateAgentExecutionIntentPayloadForTests(ws, intentId, (p) => ({ ...p, client: "Tampered Inc" })));
    }
    if (patch.toStatus === "failed") throw new Error("terminal write unavailable");
  });
  try {
    const r = await approve(id);
    assert.equal(r.status, 403, JSON.stringify(r.body));
    assert.equal(r.body.status, "refused");
    assert.ok(typeof r.body.ruleId === "string" && r.body.ruleId.length > 0);
    assert.equal(n8n.calls.length, 0);
    const ev = spy.events.find((e) => e.event === "agent.execution-intent.mark_failed_after_refusal.failed");
    assert.ok(ev, "mark_failed_after_refusal.failed must be logged");
    assert.equal(ev.ctx.ruleId, r.body.ruleId);
    assert.equal(ledgerFor(id).filter((e) => e.metadata.phase === "refused").length, 1);
  } finally { clearHook(); n8n.restore(); spy.restore(); }
});

test("(j) recordResult fails after a success: outcome unchanged, ledger_result.failed alert logged", async () => {
  const spy = spyLoggerError();
  let dispatches = 0;
  try {
    const res = await service.approveAndDispatchExecutionIntent({
      evaluate: () => ({ outcome: "ALLOW", reason: "ok" }),
      markExecuting: async () => {},
      recordAttempt: async () => {},
      dispatch: async () => { dispatches += 1; return { ok: true, actionRef: "ref-j" }; },
      recordResult: async () => { throw new Error("ledger down after success"); },
      markExecuted: async () => {},
      markFailed: async () => {},
      revertToPending: async () => {},
      revertClaim: async () => {},
    });
    assert.equal(res.status, "executed");
    assert.equal(dispatches, 1);
    const ev = spy.events.filter((e) => e.event === "agent.execution-intent.ledger_result.failed");
    assert.equal(ev.length, 1, JSON.stringify(spy.events));
    assert.equal(ev[0].ctx.phase, "success");
    assert.match(ev[0].ctx.error, /ledger down after success/);
  } finally { spy.restore(); }
});
