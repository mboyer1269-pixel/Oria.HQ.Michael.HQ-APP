#!/usr/bin/env node
// GAP (red on purpose at f6de985). Architecte À CORRIGER + Sentinelle P2 #2.
// (k) 429 path: revert_conflict response hardcodes status "executing"
//     (service:175-181) while the row may already be terminal. Expect the
//     status re-read from the store, or "unknown" if the read fails.
// SIMULATED: local-fallback repo, real route handler, fetch replaced.
import assert from "node:assert/strict";
import test from "node:test";
import { WS, repo, rateLimit, createIntent, getIntent, approve, installN8n, clearHook }
  from "../../../proofs/approval-route-harness.mjs";

test("(k) 429 revert_conflict on a row that became executed reports the real status, never 'executing'", async () => {
  const id = await createIntent("k-terminal");
  const row = await getIntent(id);
  rateLimit.__resetRateLimitersForTests();
  const P = rateLimit.RATE_LIMIT_POLICIES.n8n_dispatch;
  const key = rateLimit.rateLimitKey(P, `${WS}:${row.agentId}`);
  for (let i = 0; i < P.limit; i += 1) await rateLimit.isAllowed(key, P.limit, P.windowMs);
  repo.__setBeforeLocalTransitionHookForTests((ws, intentId, patch) => {
    if (intentId !== id || patch.toStatus !== "pending") return;
    repo.__setBeforeLocalTransitionHookForTests(null);
    void repo.transitionAgentExecutionIntent(ws, intentId, { toStatus: "executed", expectedFromStatus: "executing", updatedAt: "x" });
  });
  const n8n = installN8n();
  try {
    const r = await approve(id);
    const stored = (await getIntent(id)).status;
    assert.equal(stored, "executed");
    assert.equal(r.status, 409, JSON.stringify(r.body));
    assert.equal(r.body.reason, "revert_conflict");
    assert.ok(r.body.status === stored || r.body.status === "unknown",
      `response says ${r.body.status} while the row is ${stored}`);
    assert.equal(n8n.calls.length, 0);
  } finally { clearHook(); n8n.restore(); rateLimit.__resetRateLimitersForTests(); }
});
