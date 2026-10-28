#!/usr/bin/env node
// GAP (red on purpose, npm run test:gaps) — no workspace oracle on the G1b
// decision route (not existing yet): a decision on an intent of ANOTHER
// workspace and a decision on a NONEXISTENT intent must return byte-for-byte
// identical responses: same status (404, never 403 workspace_forbidden), same
// headers except x-request-id, byte-identical body. Refusal bodies carry no
// requestId; it travels in the x-request-id header. ASSUMED: workspace switch through
// body.workspaceId, identity header x-hq-actor-kind. SIMULATED: local fallback.
import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const h = await import(path.join(projectRoot, "proofs/approval-route-harness.mjs"));
const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: { "@": path.join(projectRoot, "src"), "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs") },
});
const ROUTE = path.join(projectRoot, "src/app/api/agents/execution-intents/[intentId]/decision/route.ts");

async function raw(id, body) {
  await access(ROUTE);
  const route = await jiti.import(ROUTE);
  const res = await route.POST(
    new Request(`http://localhost/api/agents/execution-intents/${id}/decision`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-hq-actor-kind": "human" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ intentId: id }) },
  );
  const headers = Object.fromEntries([...res.headers].filter(([k]) => k !== "x-request-id"));
  return { status: res.status, headers, requestId: res.headers.get("x-request-id"),
    body: Buffer.from(await res.arrayBuffer()).toString("utf8") };
}

test("other-workspace intent and nonexistent intent -> identical not_found (status + bytes)", async () => {
  const id = await h.createIntent("dec-oracle");
  const other = await raw(id, { decision: "approved", expectedPayloadHash: "x", workspaceId: "other-workspace" });
  const missing = await raw("00000000-0000-4000-8000-00000000dead", { decision: "approved", expectedPayloadHash: "x", workspaceId: "other-workspace" });
  assert.equal(other.status, 404);
  for (const r of [other, missing]) {
    assert.ok(r.requestId, "x-request-id header missing");
    assert.doesNotMatch(r.body, /request_?id/i, "requestId leaked into refusal body");
  }
  assert.deepEqual({ ...other, requestId: 0 }, { ...missing, requestId: 0 });
  assert.equal(Buffer.compare(Buffer.from(other.body), Buffer.from(missing.body)), 0);
  assert.equal((await h.getIntent(id)).status, "pending");
});

test("existing approve route refusal (409 changed hash): no requestId in body, x-request-id header present", async () => {
  const { jiti: _ } = { jiti };
  const approve = await jiti.import(path.join(projectRoot, "src/app/api/agents/execution-intents/[intentId]/approve/route.ts"));
  const id = await h.createIntent("reqid-approve");
  const res = await approve.POST(
    new Request(`http://localhost/api/agents/execution-intents/${id}/approve`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedPayloadHash: "stale" }) }),
    { params: Promise.resolve({ intentId: id }) },
  );
  assert.ok(res.status >= 400, String(res.status));
  assert.doesNotMatch(await res.text(), /request_?id/i);
  assert.ok(res.headers.get("x-request-id"), "x-request-id header missing");
});
