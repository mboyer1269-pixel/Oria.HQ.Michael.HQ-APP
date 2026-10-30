#!/usr/bin/env node
// Wiring regression (npm run test:gaps; original pre-G1b gap now closed) — room contract: approve WITHOUT a
// decisionId -> REQUIRE_APPROVAL, refused BEFORE the claim and BEFORE any
// ledger write: zero ledger attempts, intent stays in its waiting-for-approval
// status (local repo: "pending"), the tool never runs. On 9f69756 the refusal
// happens at dispatch, i.e. after the claim and the ledger attempt.
// Built through the public createApproveHandler(deps). SIMULATED: local repo,
// n8n fetch spy, in-memory decision store.
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

for (const [label, extra] of [["no decision field", {}], ["decisionId: null", { decisionId: null }], ["decisionId: ''", { decisionId: "" }], ["approvalDecisionId: ''", { approvalDecisionId: "" }]]) {
  test(`approve with ${label} -> REQUIRE_APPROVAL before claim and ledger, zero attempts, intent waiting`, async () => {
    const n8n = h.installN8n();
    const transitions = [];
    try {
      const id = await h.createIntent(`missing-${label.replace(/\W+/g, "-")}`);
      const before = (await h.getIntent(id)).status;
      const stored = await h.getIntent(id);
      const ledgerBefore = structuredClone(h.ledgerFor(id));
      assert.equal(ledgerBefore.filter(e => e.eventType === "decision").length, 1, "creation decision is retained");
      const res = await POST(
        new Request(`http://localhost/api/agents/execution-intents/${id}/approve`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedPayloadHash: h.hashExecutionIntentPayload(stored.payload), ...extra }),
        }),
        { params: Promise.resolve({ intentId: id }) },
      );
      const body = await res.json().catch(() => ({}));
      const text = JSON.stringify(body);
      assert.notEqual(res.status, 200, `approved without a decision: ${text}`);
      assert.match(text, /REQUIRE_APPROVAL/, `response must say REQUIRE_APPROVAL: ${res.status} ${text}`);
      assert.deepEqual(h.ledgerFor(id), ledgerBefore, "approval refusal adds or changes no ledger fact");
      assert.equal(h.ledgerFor(id).filter(e => e.eventType === "action").length, 0, "zero execution attempts; creation decision is not an attempt");
      assert.equal(n8n.calls.length, 0, "tool ran without a decision");
      assert.equal(store.calls.length, 0, "nothing to consume without a decision");
      const after = await h.getIntent(id);
      assert.equal(after.status, before, "intent must stay waiting for approval");
      assert.ok(!after.actionRef?.startsWith?.("attempt:"), `the intent was claimed (actionRef ${after.actionRef})`);
      void transitions;
    } finally {
      n8n.restore();
    }
  });
}
