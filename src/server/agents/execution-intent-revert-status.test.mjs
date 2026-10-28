#!/usr/bin/env node
// Formerly a -gap tripwire (red at f6de985), green since c1c6af0 (#452).
// Architecte À CORRIGER + Sentinelle P2 #2.
// (k) 429 path: when the conditional revert hits a row that became terminal,
//     the 409 revert_conflict response must carry the status RE-READ from the
//     store. Here the re-read succeeds, so the answer MUST be exactly
//     "executed" ("unknown" is only for a failed re-read, covered separately
//     in execution-intent-reread-status-failure.test.mjs).
// SIMULATED: local-fallback repo, real route handler, fetch replaced.
import assert from "node:assert/strict";
import test from "node:test";
import { WS, repo, rateLimit, createIntent, getIntent, approve, installN8n, clearHook }
  from "../../../proofs/approval-route-harness.mjs";

test("(k) 429 revert_conflict on a row that became executed reports exactly 'executed' (re-read succeeded)", async () => {
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
    assert.equal(r.body.status, "executed",
      `response says ${r.body.status} while the row is ${stored} and the re-read succeeded`);
    assert.equal(n8n.calls.length, 0);
  } finally { clearHook(); n8n.restore(); rateLimit.__resetRateLimitersForTests(); }
});
