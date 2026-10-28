#!/usr/bin/env node
// GAP (red on purpose, npm run test:gaps) — room contract: a decisionId that is
// present but NOT a UUID -> 400, before the claim and before any ledger write
// (zero ledger attempts), intent untouched, tool never runs. On 9f69756 the
// handler silently turns a malformed id into undefined (~l.114-119) and goes on
// to claim. Built through the public createApproveHandler(deps). SIMULATED.
import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const h = await import(path.join(projectRoot, "proofs/approval-route-harness.mjs"));
const support = await import(path.join(projectRoot, "proofs/approval-decision-test-support.mjs"));
const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: { "@": path.join(projectRoot, "src"), "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs") },
});
const store = support.createDecisionStore();
const POST = await support.buildApproveHandler(jiti, projectRoot, { store });

for (const [field, value] of [["decisionId", "not-a-uuid"], ["decisionId", "12345"], ["decisionId", 42], ["decisionId", { id: "x" }],
  ["approvalDecisionId", "zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz"], ["decisionId", "11111111-1111-4111-8111-111111111111' or 1=1--"]]) {
  test(`approve with ${field}=${JSON.stringify(value)} -> 400 before claim and ledger, zero attempts`, async () => {
    const n8n = h.installN8n();
    try {
      const id = await h.createIntent(`non-uuid-${field}`);
      const stored = await h.getIntent(id);
      const res = await POST(
        new Request(`http://localhost/api/agents/execution-intents/${id}/approve`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedPayloadHash: h.hashExecutionIntentPayload(stored.payload), [field]: value }),
        }),
        { params: Promise.resolve({ intentId: id }) },
      );
      assert.equal(res.status, 400, `expected 400, got ${res.status} ${JSON.stringify(await res.json().catch(() => ({})))}`);
      assert.equal(h.ledgerFor(id).length, 0, "ledger attempts must be 0");
      assert.equal(n8n.calls.length, 0);
      assert.equal(store.calls.length, 0);
      const after = await h.getIntent(id);
      assert.equal(after.status, stored.status);
      assert.ok(!after.actionRef?.startsWith?.("attempt:"), `the intent was claimed (actionRef ${after.actionRef})`);
    } finally {
      n8n.restore();
    }
  });
}
