#!/usr/bin/env node
// GAP (red on purpose, npm run test:gaps) — Architect DI model for the approve
// route: route.ts exports `POST = createApproveHandler(defaultDeps)`; deps are
// frozen at module load. Asserts on the PRODUCTION route module:
//   - createApproveHandler exists (ASSUMED module
//     @/server/agents/execution-intent-approve-handler);
//   - the route exports no setter / deps object / test hook (only POST + Next
//     config keys);
//   - headers, body fields or env changes after load cannot swap deps: the
//     dispatch still goes to the n8n URL captured at load.
// SIMULATED: local fallback repo, fetch spy.
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

test("headers / body / env tweaks after load cannot redirect the dispatch", async () => {
  const loadedUrl = process.env.N8N_WEBHOOK_URL;
  const seen = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => { seen.push(String(url)); return { ok: true, status: 200, json: async () => ({ ok: true, status: "ok" }) }; };
  process.env.N8N_WEBHOOK_URL = "http://127.0.0.1:9/evil";
  try {
    const id = await h.createIntent("di-tamper");
    const stored = await h.getIntent(id);
    const res = await route.POST(
      new Request(`http://localhost/api/agents/execution-intents/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-hq-deps": "evil", "x-n8n-webhook-url": "http://127.0.0.1:9/evil" },
        body: JSON.stringify({ expectedPayloadHash: h.hashExecutionIntentPayload(stored.payload),
          deps: { dispatch: "evil" }, n8nWebhookUrl: "http://127.0.0.1:9/evil", __proto__: { deps: 1 } }),
      }),
      { params: Promise.resolve({ intentId: id }) },
    );
    assert.ok(res.status < 500, String(res.status));
    assert.ok(!seen.some((u) => u.includes("/evil")), `dispatch redirected: ${seen}`);
    assert.ok(seen.some((u) => u.startsWith(loadedUrl)), `no dispatch to load-time URL: ${seen}`);
  } finally {
    globalThis.fetch = original;
    process.env.N8N_WEBHOOK_URL = loadedUrl;
  }
});
