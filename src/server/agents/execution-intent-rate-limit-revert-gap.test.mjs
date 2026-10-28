#!/usr/bin/env node
// (h2) GAP TRIPWIRE — red on purpose at 445a0dd (run by `npm run test:gaps`).
// When the n8n rate limit fires and the intent changed state concurrently, the
// revert to pending fails, but the failure is swallowed (service:140
// `.catch(() => void 0)`) and the route still answers 429 status "pending"
// ("retry"), although the row is no longer pending. Fail-closed expectation:
// the response must not tell the CEO to retry an intent that is not pending.
// Turns green once the route uses a conditional revert (route:216-220) and the
// service reports a failed revert instead of swallowing it.
import assert from "node:assert/strict";
import test from "node:test";
import { WS, repo, rateLimit, createIntent, getIntent, approve, installN8n, clearHook }
  from "../../../proofs/approval-route-harness.mjs";

test("(h2) rate-limited revert fails closed when the state changed: no 429 'pending' retry", async () => {
  const id = await createIntent("h2");
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
    assert.notEqual(stored, "pending");
    assert.ok(!(r.status === 429 && r.body.status === "pending"),
      `route claims retryable pending (429) while the row is ${stored}: ${JSON.stringify(r.body)}`);
  } finally { clearHook(); n8n.restore(); rateLimit.__resetRateLimitersForTests(); }
});
