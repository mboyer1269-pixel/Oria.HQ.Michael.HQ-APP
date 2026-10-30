#!/usr/bin/env node
// Wiring regression (npm run test:gaps) — Architect DI model for the approve
// route: route.ts exports `POST = createApproveHandler(defaultDeps)`; deps are
// frozen at module load. Asserts on the PRODUCTION route module:
//   - createApproveHandler exists (ASSUMED module
//     @/server/agents/execution-intent-approve-handler);
//   - the route exports no setter / deps object / test hook (only POST + Next
//     config keys);
//   - headers, body fields or env changes after load cannot swap deps: the
//     dispatch still goes to the n8n URL captured at load.
// The module-shape checks use the production route. Dispatch uses the same
// public factory and real deps, with the established in-memory consume port;
// a production route cannot consume a fictional decision without a real DB.
// SIMULATED: local fallback repo, decision store and fetch spy. No production hook.
import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const h = await import(path.join(projectRoot, "proofs/approval-route-harness.mjs"));
const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: { "@": path.join(projectRoot, "src"), "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs") },
});
const route = await jiti.import(path.join(projectRoot, "src/app/api/agents/execution-intents/[intentId]/approve/route.ts"));
const support = await import(path.join(projectRoot, "proofs/approval-decision-test-support.mjs"));
const decisions = support.createDecisionStore();
const POST = await support.buildApproveHandler(jiti, projectRoot, { store: decisions });
const NEXT_KEYS = new Set(["POST", "runtime", "dynamic", "revalidate", "maxDuration", "preferredRegion", "fetchCache"]);

test("createApproveHandler(deps) factory exists", async () => {
  const m = await jiti.import("@/server/agents/execution-intent-approve-handler");
  assert.equal(typeof m.createApproveHandler, "function");
});

test("route module exports nothing mutable (no setter, no deps, no test hook)", () => {
  const extra = Object.keys(route).filter((k) => k !== "default" && !NEXT_KEYS.has(k));
  assert.deepEqual(extra, []);
  assert.equal(typeof route.POST, "function");
  for (const k of Object.keys(route.POST)) assert.fail(`POST carries own property ${k}`);
});

test("headers / body / env tweaks after construction cannot redirect an approved dispatch", async () => {
  const loadedUrl = process.env.N8N_WEBHOOK_URL;
  const seen = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => { seen.push(String(url)); return { ok: true, status: 200, json: async () => ({ ok: true, status: "ok" }) }; };
  process.env.N8N_WEBHOOK_URL = "http://127.0.0.1:9/evil";
  try {
    const id = await h.createIntent("di-tamper");
    const stored = await h.getIntent(id);
    const hash = h.hashExecutionIntentPayload(stored.payload);
    const decisionId = decisions.issue(h.WS, id, hash);
    const ledgerBefore = structuredClone(h.ledgerFor(id));
    const missing = await POST(new Request(`http://localhost/api/agents/execution-intents/${id}/approve`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedPayloadHash: hash }),
    }), { params: Promise.resolve({ intentId: id }) });
    assert.equal(missing.status, 409);assert.equal((await missing.json()).code, "approval_required");
    assert.equal(seen.length, 0);assert.equal(decisions.calls.length, 0);assert.deepEqual(h.ledgerFor(id), ledgerBefore);
    const request = () => new Request(`http://localhost/api/agents/execution-intents/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-hq-deps": "evil", "x-n8n-webhook-url": "http://127.0.0.1:9/evil" },
      body: JSON.stringify({ expectedPayloadHash: hash, decisionId,
        deps: { dispatch: "evil" }, n8nWebhookUrl: "http://127.0.0.1:9/evil", __proto__: { deps: 1 } }),
    });
    const res = await POST(
      request(),
      { params: Promise.resolve({ intentId: id }) },
    );
    assert.equal(res.status, 200, String(res.status));
    assert.ok(!seen.some((u) => u.includes("/evil")), `dispatch redirected: ${seen}`);
    assert.deepEqual(seen, [loadedUrl]);
    assert.equal(decisions.calls.length, 1);assert.equal(decisions.isConsumed(decisionId), true);
    const ledgerAfter = structuredClone(h.ledgerFor(id));
    assert.equal(ledgerAfter.filter(e => e.eventType === "action").length, 1);
    const replay = await POST(request(), { params: Promise.resolve({ intentId: id }) });
    assert.equal(replay.status, 409);assert.equal(decisions.calls.length, 1);
    assert.deepEqual(seen, [loadedUrl]);assert.deepEqual(h.ledgerFor(id), ledgerAfter);
  } finally {
    globalThis.fetch = original;
    process.env.N8N_WEBHOOK_URL = loadedUrl;
  }
});
