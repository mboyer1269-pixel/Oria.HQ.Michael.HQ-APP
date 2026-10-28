#!/usr/bin/env node
// GAP (red on purpose, npm run test:gaps) — an approve handler built with
// createApproveHandler(defaultDeps) reads N8N_WEBHOOK_URL ONCE, at
// construction. Changing process.env afterwards must not change where the
// dispatch goes. ASSUMED seam (one constant): HANDLER_SEAM. SIMULATED: fetch spy,
// local fallback repo.
import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HANDLER_SEAM = { module: "@/server/agents/execution-intent-approve-handler", factory: "createApproveHandler", defaults: "defaultDeps" };

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const h = await import(path.join(projectRoot, "proofs/approval-route-harness.mjs"));
const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: { "@": path.join(projectRoot, "src"), "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs") },
});

test("N8N_WEBHOOK_URL is captured at construction; later env changes do not redirect dispatch", async () => {
  const m = await jiti.import(HANDLER_SEAM.module);
  assert.equal(typeof m[HANDLER_SEAM.factory], "function", `missing ${HANDLER_SEAM.factory}`);
  assert.ok(m[HANDLER_SEAM.defaults], `missing ${HANDLER_SEAM.defaults}`);
  const constructedUrl = process.env.N8N_WEBHOOK_URL;
  const POST = m[HANDLER_SEAM.factory](m[HANDLER_SEAM.defaults]);
  const seen = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => { seen.push(String(url)); return { ok: true, status: 200, json: async () => ({ ok: true, status: "ok" }) }; };
  process.env.N8N_WEBHOOK_URL = "http://127.0.0.1:9/after-construction";
  try {
    const id = await h.createIntent("env-once");
    const stored = await h.getIntent(id);
    const res = await POST(
      new Request(`http://localhost/api/agents/execution-intents/${id}/approve`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedPayloadHash: h.hashExecutionIntentPayload(stored.payload) }),
      }),
      { params: Promise.resolve({ intentId: id }) },
    );
    assert.equal(res.status, 200);
    assert.deepEqual(seen.filter((u) => u.includes("127.0.0.1")).map((u) => u.startsWith(constructedUrl)), [true]);
  } finally {
    globalThis.fetch = original;
    process.env.N8N_WEBHOOK_URL = constructedUrl;
  }
});
