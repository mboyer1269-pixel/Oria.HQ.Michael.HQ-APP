#!/usr/bin/env node
// Wiring regression (npm run test:gaps; original pre-G1b gap now closed) — strict G1b: approving a governed
// REQUIRE_APPROVAL intent WITHOUT an approvalDecisionId / decisionId must be
// refused (4xx): no dispatch, no ledger attempt, intent stays pending.
// f71c34a kept the legacy G2 owner approval when no decisionId is supplied,
// which this test rejects. SIMULATED: local fallback repo, n8n fetch spy.
import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const h = await import(path.join(projectRoot, "proofs/approval-route-harness.mjs"));

for (const [label, extra] of [["no decision id field", {}], ["decisionId: null", { decisionId: null }], ["approvalDecisionId: ''", { approvalDecisionId: "" }]]) {
  test(`approve without approvalDecisionId (${label}) -> refused, no dispatch, no ledger, intent pending`, async () => {
    const n8n = h.installN8n();
    try {
      const id = await h.createIntent(`no-decision-${Object.keys(extra)[0] ?? "none"}`);
      const stored = await h.getIntent(id);
      const ledgerBefore = structuredClone(h.ledgerFor(id));
      assert.equal(ledgerBefore.filter(e => e.eventType === "decision").length, 1, "creation decision is retained");
      const { createJiti } = await import("jiti");
      const jiti = createJiti(import.meta.url, {
        alias: { "@": path.join(projectRoot, "src"), "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs") },
      });
      const approve = await jiti.import(path.join(projectRoot, "src/app/api/agents/execution-intents/[intentId]/approve/route.ts"));
      const res = await approve.POST(
        new Request(`http://localhost/api/agents/execution-intents/${id}/approve`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedPayloadHash: h.hashExecutionIntentPayload(stored.payload), ...extra }),
        }),
        { params: Promise.resolve({ intentId: id }) },
      );
      assert.ok(res.status >= 400 && res.status < 500, `expected 4xx refusal, got ${res.status}`);
      assert.equal(n8n.calls.length, 0, "dispatched without a decision id");
      assert.deepEqual(h.ledgerFor(id), ledgerBefore, "approval refusal adds or changes no ledger fact");
      assert.equal(h.ledgerFor(id).filter(e => e.eventType === "action").length, 0, "zero execution attempts; creation decision is not an attempt");
      assert.equal((await h.getIntent(id)).status, "pending");
    } finally {
      n8n.restore();
    }
  });
}
