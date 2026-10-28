#!/usr/bin/env node
// GAP (red on purpose, npm run test:gaps) — G1b route
// POST /api/agents/execution-intents/[intentId]/decision does not exist yet.
// Expected contract (ASSUMED until Atelier publishes the route):
// Codes (Atelier final): 401 no session; 403 machine/non-human/non-owner;
// 404 intent not found (also other workspace); 409 not_pending,
// payload_changed, live_decision_exists.
//   - agent / runner identity -> 403;
//   - decision for an intent of another workspace -> 404 (never 403);
//   - intent not pending -> 409 not_pending;
//   - second decision on the same intent -> 409 live_decision_exists;
//   - recording the decision (approve click) does NOT consume it: the decision
//     stays unconsumed; consumption happens server-side at execution.
// Identity comes from a verified session minted through the ASSUMED auth seam
// (AUTH_SEAM) — never from a header; the decision
// store is read through the ASSUMED seam approval-decision-repository
// .getApprovalDecisionForIntent(ws, intentId). SIMULATED: local fallback repo.
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
const AUTH_SEAM = { module: "@/server/auth/session-tokens", mint: "mintSessionToken" }; // ({ kind, ownerId, workspaceId }) -> bearer token
async function authHeaders(kind) {
  if (!kind) return {}; // no session
  const auth = await jiti.import(AUTH_SEAM.module);
  if (typeof auth[AUTH_SEAM.mint] !== "function") throw new Error(`missing auth seam ${AUTH_SEAM.module}.${AUTH_SEAM.mint}`);
  return { Authorization: `Bearer ${await auth[AUTH_SEAM.mint]({ kind, ownerId: "owner-1", workspaceId: h.WS })}` };
}
const ROUTE = path.join(projectRoot, "src/app/api/agents/execution-intents/[intentId]/decision/route.ts");
const loadRoute = async () => { await access(ROUTE); return jiti.import(ROUTE); };

async function decide(id, { actor = "human", workspaceId, decision = "approved" } = {}) {
  const route = await loadRoute();
  const stored = await h.getIntent(id);
  const res = await route.POST(
    new Request(`http://localhost/api/agents/execution-intents/${id}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders(actor)) },
      body: JSON.stringify({ decision, expectedPayloadHash: stored ? h.hashExecutionIntentPayload(stored.payload) : "x",
        ...(workspaceId ? { workspaceId } : {}) }),
    }),
    { params: Promise.resolve({ intentId: id }) },
  );
  return res.status;
}

test("decision route exists", async () => { await access(ROUTE); });

for (const actor of ["agent", "runner"]) {
  test(`${actor} identity -> 403`, async () => {
    const id = await h.createIntent(`dec-${actor}`);
    assert.equal(await decide(id, { actor }), 403);
    assert.equal((await h.getIntent(id)).status, "pending");
  });
}

test("intent of another workspace -> refused", async () => {
  const id = await h.createIntent("dec-ws");
  assert.equal(await decide(id, { workspaceId: "other-workspace" }), 404);
});

test("no session -> 401", async () => {
  const id = await h.createIntent("dec-nosession");
  assert.equal(await decide(id, { actor: "" }), 401);
});

test("non-pending intent -> 409", async () => {
  const id = await h.createIntent("dec-nonpending");
  await h.approve(id);
  assert.notEqual((await h.getIntent(id)).status, "pending");
  assert.equal(await decide(id), 409);
});

test("second decision on the same intent -> 409", async () => {
  const id = await h.createIntent("dec-twice");
  assert.equal(await decide(id), 200);
  assert.equal(await decide(id), 409);
});

test("approve click records the decision but does NOT consume it", async () => {
  const id = await h.createIntent("dec-noconsume");
  assert.equal(await decide(id), 200);
  const repo = await jiti.import("@/server/agents/approval-decision-repository");
  assert.equal(typeof repo.getApprovalDecisionForIntent, "function", "missing seam getApprovalDecisionForIntent");
  const d = await repo.getApprovalDecisionForIntent(h.WS, id);
  assert.ok(d, "decision recorded");
  assert.equal(d.consumedAt ?? d.consumed_at ?? null, null, "decision consumed at click time");
  assert.equal(d.status, "approved");
});
