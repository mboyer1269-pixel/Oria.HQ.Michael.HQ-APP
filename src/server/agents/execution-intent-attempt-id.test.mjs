#!/usr/bin/env node
// G1 lot — attemptId + idempotency (design: oria-lot1/attemptid-design.md).
// SIMULATED: local-fallback repo and ledger, real route handlers, fetch
// replaced. No real n8n: the n8n-side dedup on actionRef is NOT exercised here,
// only that Oria sends a stable key it could dedup on.
import assert from "node:assert/strict";
import test from "node:test";
import {
  WS, repo, rateLimit, createIntent, getIntent, approve, installN8n, clearHook,
  ledgerFor, injectLedgerRepository, hashExecutionIntentPayload,
} from "../../../proofs/approval-route-harness.mjs";

const TOKEN_RE = /^attempt:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function capturePatches(id) {
  const patches = [];
  repo.__setBeforeLocalTransitionHookForTests((ws, intentId, patch) => {
    if (intentId === id) patches.push({ ...patch });
  });
  return patches;
}

test("B: same idemKey on every attempt; the attempt token differs and is not part of the key", async () => {
  rateLimit.__resetRateLimitersForTests();
  const id = await createIntent("attempt-same-key");
  const hash = hashExecutionIntentPayload((await getIntent(id)).payload);
  const expectedKey = `oria1:${WS}:${id}:${hash}`;
  const patches = capturePatches(id);

  // Attempt 1: injected ledger outage → the claim is reverted, nothing is sent.
  injectLedgerRepository(() => { throw new Error("ledger unavailable (injected)"); });
  let n8n = installN8n();
  try {
    const r1 = await approve(id);
    assert.equal(r1.status, 500, JSON.stringify(r1.body));
    assert.equal(n8n.calls.length, 0);
  } finally { injectLedgerRepository(null); n8n.restore(); }
  const row1 = await getIntent(id);
  assert.equal(row1.status, "pending");
  assert.equal(row1.actionRef ?? null, null, "the revert clears the attempt token");

  // Attempt 2: succeeds.
  n8n = installN8n();
  try {
    const r2 = await approve(id);
    assert.equal(r2.status, 200, JSON.stringify(r2.body));
    assert.equal(n8n.calls.length, 1);
    const sent = n8n.calls[0].init;
    const body = JSON.parse(sent.body);
    assert.equal(body.actionRef, expectedKey, "actionRef sent to n8n = idemKey");
    assert.equal(sent.headers["Idempotency-Key"], expectedKey);
  } finally { clearHook(); n8n.restore(); }

  const claims = patches.filter((p) => p.toStatus === "executing").map((p) => p.actionRef);
  assert.equal(claims.length, 2);
  for (const t of claims) assert.match(t ?? "", TOKEN_RE);
  assert.notEqual(claims[0], claims[1], "a fresh token per attempt");
  for (const t of claims) assert.ok(!expectedKey.includes(t.slice("attempt:".length)), "token is not part of the key");
  assert.ok(!n8n.calls[0].init.body.includes(claims[1].slice("attempt:".length)), "token never reaches n8n");

  const attempt = ledgerFor(id).find((e) => e.metadata?.phase === "attempt");
  assert.equal(attempt?.metadata?.attemptId, claims[1]);
  assert.equal(attempt?.metadata?.idemKey, expectedKey);
});

test("B: every post-claim transition is conditional on the claim token; executed keeps the token", async () => {
  rateLimit.__resetRateLimitersForTests();
  const id = await createIntent("attempt-cas");
  const patches = capturePatches(id);
  const n8n = installN8n();
  try {
    const r = await approve(id);
    assert.equal(r.status, 200, JSON.stringify(r.body));
  } finally { clearHook(); n8n.restore(); }
  const claim = patches.find((p) => p.toStatus === "executing");
  const done = patches.find((p) => p.toStatus === "executed");
  assert.match(claim?.actionRef ?? "", TOKEN_RE);
  assert.equal(done?.expectedActionRef, claim.actionRef);
  const row = await getIntent(id);
  assert.equal(row.status, "executed");
  assert.equal(row.actionRef, claim.actionRef, "action_ref is not overwritten by the provider ref");
});

test("B: markExecuted from a stale attempt (row re-claimed by another token) is refused", async () => {
  rateLimit.__resetRateLimitersForTests();
  const id = await createIntent("attempt-stale-route");
  repo.__setBeforeLocalTransitionHookForTests((ws, intentId, patch) => {
    if (intentId !== id || patch.toStatus !== "executed") return;
    repo.__setBeforeLocalTransitionHookForTests(null);
    repo.__forceAgentExecutionIntentRowForTests(ws, intentId, { actionRef: "attempt:00000000-0000-4000-8000-00000000000b" });
  });
  const n8n = installN8n();
  try {
    const r = await approve(id);
    assert.notEqual(r.status, 200, JSON.stringify(r.body));
    const row = await getIntent(id);
    assert.equal(row.status, "executing", "the stale tail must not settle the row");
    assert.equal(row.actionRef, "attempt:00000000-0000-4000-8000-00000000000b");
  } finally { clearHook(); n8n.restore(); }
});

test("B: repository — a stale-attempt transition matches 0 rows (markExecuted, markFailed, revert)", async () => {
  const id = await createIntent("attempt-stale-repo");
  const A = "attempt:00000000-0000-4000-8000-00000000000a";
  const B = "attempt:00000000-0000-4000-8000-00000000000b";
  const t = (patch) => repo.transitionAgentExecutionIntent(WS, id, { updatedAt: new Date().toISOString(), ...patch });
  await t({ toStatus: "executing", expectedFromStatus: "pending", actionRef: A });
  await t({ toStatus: "pending", expectedFromStatus: "executing", expectedActionRef: A, actionRef: null });
  assert.equal((await getIntent(id)).actionRef ?? null, null);
  await t({ toStatus: "executing", expectedFromStatus: "pending", actionRef: B });

  for (const stale of [
    { toStatus: "executed", expectedFromStatus: "executing", expectedActionRef: A },
    { toStatus: "failed", expectedFromStatus: "executing", expectedActionRef: A, failureCode: "X" },
    { toStatus: "pending", expectedFromStatus: "executing", expectedActionRef: A, actionRef: null },
  ]) {
    await assert.rejects(() => t(stale), repo.AgentExecutionIntentConcurrencyError, `stale ${stale.toStatus} must match 0 rows`);
  }
  const row = await getIntent(id);
  assert.deepEqual([row.status, row.actionRef], ["executing", B]);
  await t({ toStatus: "executed", expectedFromStatus: "executing", expectedActionRef: B });
  assert.equal((await getIntent(id)).status, "executed");
});

// Last: exhausts the in-memory n8n window, which the test reset does not clear.
test("B: rate-limited revert is a CAS on the claim token and clears it", async () => {
  rateLimit.__resetRateLimitersForTests();
  const id = await createIntent("attempt-429");
  const row0 = await getIntent(id);
  const P = rateLimit.RATE_LIMIT_POLICIES.n8n_dispatch;
  const key = rateLimit.rateLimitKey(P, `${WS}:${row0.agentId}`);
  for (let i = 0; i < P.limit; i += 1) await rateLimit.isAllowed(key, P.limit, P.windowMs);
  const patches = capturePatches(id);
  const n8n = installN8n();
  try {
    const r = await approve(id);
    assert.equal(r.status, 429, JSON.stringify(r.body));
    assert.equal(n8n.calls.length, 0);
  } finally { clearHook(); n8n.restore(); rateLimit.__resetRateLimitersForTests(); }
  const claim = patches.find((p) => p.toStatus === "executing");
  const revert = patches.find((p) => p.toStatus === "pending");
  assert.match(claim?.actionRef ?? "", TOKEN_RE);
  assert.equal(revert?.expectedActionRef, claim.actionRef);
  assert.equal(revert?.actionRef, null);
  const row = await getIntent(id);
  assert.deepEqual([row.status, row.actionRef ?? null], ["pending", null]);
});
