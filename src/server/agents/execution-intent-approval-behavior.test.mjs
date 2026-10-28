#!/usr/bin/env node
// Behavioural tests (a)-(g), (h1) for the CEO approval route of PR #452.
// Real route handlers, local repo + local ledger, n8n fetch replaced.
// Harness: proofs/approval-route-harness.mjs.
import assert from "node:assert/strict";
import test from "node:test";
import {
  SECRETS, WS, repo, rateLimit, service, createIntent, getIntent, approve,
  installN8n, tamperAfterClaim, clearHook, ledgerFor,
} from "../../../proofs/approval-route-harness.mjs";

test("(a) policy refusal end to end through the route: 403, ruleId, ledger phase refused", async () => {
  const id = await createIntent("a");
  const n8n = installN8n();
  tamperAfterClaim(id);
  try {
    const r = await approve(id);
    assert.equal(r.status, 403, JSON.stringify(r.body));
    assert.equal(r.body.status, "refused");
    assert.equal(typeof r.body.ruleId, "string");
    assert.ok(r.body.ruleId.length > 0);
    const refused = ledgerFor(id).filter((e) => e.metadata.phase === "refused");
    assert.equal(refused.length, 1);
    assert.equal(refused[0].metadata.ruleId, r.body.ruleId);
    assert.equal(n8n.calls.length, 0);
  } finally { clearHook(); n8n.restore(); }
});

test("(b) payload modified after the claim is blocked AND journaled", async () => {
  const id = await createIntent("b");
  const n8n = installN8n();
  tamperAfterClaim(id);
  try {
    const r = await approve(id);
    assert.equal(r.status, 403);
    assert.equal(n8n.calls.length, 0, "no request may leave");
    const row = await getIntent(id);
    assert.equal(row.status, "failed");
    assert.match(row.failureCode, /^GUARD_REFUSED:/);
    const phases = ledgerFor(id).map((e) => e.metadata.phase);
    const after = phases.slice(phases.indexOf("attempt") + 1);
    assert.deepEqual(after, ["refused"], JSON.stringify(phases));
  } finally { clearHook(); n8n.restore(); }
});

test("(c) refusal vs n8n HTTP 500 in one assertion: refused/403 vs uncertain/502", async () => {
  const idRefused = await createIntent("c-refused");
  const idUncertain = await createIntent("c-500");
  let n8n = installN8n();
  tamperAfterClaim(idRefused);
  let r1;
  try { r1 = await approve(idRefused); } finally { clearHook(); n8n.restore(); }
  n8n = installN8n(() => ({ ok: false, status: 500, json: async () => ({}) }));
  let r2;
  try { r2 = await approve(idUncertain); } finally { n8n.restore(); }
  const row2 = await getIntent(idUncertain);
  const uncertainPhases = ledgerFor(idUncertain).map((e) => e.metadata.phase);
  assert.deepEqual(
    [r1.status, r1.body.status, r2.status, r2.body.outcome, row2.status, uncertainPhases.includes("uncertain")],
    [403, "refused", 502, "uncertain", "executing", true],
  );
});

test("(d) no secret, no raw payload in ledger metadata (success and refusal)", async () => {
  const ok = await createIntent("d-ok");
  let n8n = installN8n();
  try { assert.equal((await approve(ok)).status, 200); } finally { n8n.restore(); }
  const ko = await createIntent("d-ko");
  n8n = installN8n();
  tamperAfterClaim(ko);
  try { assert.equal((await approve(ko)).status, 403); } finally { clearHook(); n8n.restore(); }
  const entries = [...ledgerFor(ok), ...ledgerFor(ko)];
  assert.ok(entries.length >= 4, "ledger store must have grown");
  const text = JSON.stringify(entries.map((e) => e.metadata));
  for (const s of [...SECRETS, "buyer@acme.test", "Tampered Inc"]) assert.ok(!text.includes(s), `leaked: ${s}`);
  for (const e of entries) assert.ok(!Object.hasOwn(e.metadata, "payload"), "raw payload key in metadata");
});

test("(e) result-ledger write fails after a possible effect: no resend, no revert to pending", async () => {
  const calls = { dispatch: 0, revertToPending: 0, revertClaim: 0, markExecuted: 0 };
  const res = await service.approveAndDispatchExecutionIntent({
    evaluate: () => ({ outcome: "ALLOW", reason: "ok" }),
    markExecuting: async () => {},
    recordAttempt: async () => {},
    dispatch: async () => { calls.dispatch += 1; return { ok: true, actionRef: "ref-e" }; },
    recordResult: async () => { throw new Error("ledger down after effect"); },
    markExecuted: async () => { calls.markExecuted += 1; },
    markFailed: async () => {},
    revertToPending: async () => { calls.revertToPending += 1; },
    revertClaim: async () => { calls.revertClaim += 1; },
  });
  assert.deepEqual(calls, { dispatch: 1, revertToPending: 0, revertClaim: 0, markExecuted: 1 });
  assert.equal(res.status, "executed");
});

test("(f) response lost after remote acceptance: uncertain, then re-approve does not resend", async () => {
  const id = await createIntent("f");
  const n8n = installN8n(() => { throw new Error("socket hang up after n8n accepted"); });
  try {
    const r1 = await approve(id);
    assert.equal(r1.status, 502, JSON.stringify(r1.body));
    assert.equal(r1.body.outcome, "uncertain");
    const r2 = await approve(id);
    assert.equal(r2.status, 409, JSON.stringify(r2.body));
    assert.equal(n8n.calls.length, 1, "exactly one send");
    assert.equal((await getIntent(id)).status, "executing");
  } finally { n8n.restore(); }
});

test("(g) a consumed approval cannot be re-activated (sequential re-approve)", async () => {
  const id = await createIntent("g");
  const n8n = installN8n();
  try {
    assert.equal((await approve(id)).status, 200);
    const r2 = await approve(id);
    assert.equal(r2.status, 409, JSON.stringify(r2.body));
    assert.equal(r2.body.reason, "already_decided");
    assert.equal(n8n.calls.length, 1);
    assert.equal(ledgerFor(id).filter((e) => e.metadata.phase === "attempt").length, 1);
  } finally { n8n.restore(); }
});

test("(h1) rate-limited revert never re-activates an intent that moved on concurrently", async () => {
  const id = await createIntent("h1");
  const row = await getIntent(id);
  rateLimit.__resetRateLimitersForTests();
  const P = rateLimit.RATE_LIMIT_POLICIES.n8n_dispatch;
  const key = rateLimit.rateLimitKey(P, `${WS}:${row.agentId}`);
  for (let i = 0; i < P.limit; i += 1) await rateLimit.isAllowed(key, P.limit, P.windowMs);
  repo.__setBeforeLocalTransitionHookForTests((ws, intentId, patch) => {
    if (intentId !== id || patch.toStatus !== "pending") return;
    repo.__setBeforeLocalTransitionHookForTests(null);
    // A concurrent writer settles the claim first (sync in the local repo).
    void repo.transitionAgentExecutionIntent(ws, intentId, { toStatus: "executed", expectedFromStatus: "executing", updatedAt: "x" });
  });
  const n8n = installN8n();
  try {
    await approve(id);
    assert.equal((await getIntent(id)).status, "executed", "must not be put back in pending");
    assert.equal(n8n.calls.length, 0);
  } finally { clearHook(); n8n.restore(); rateLimit.__resetRateLimitersForTests(); }
});
