#!/usr/bin/env node
// GAP (red on purpose) — G1 expiry (a): an approved decision whose expires_at is in the PAST is refused at execution; nothing is written to the ledger; the intent stays pending.
// CONTRACT (Architecte): expiry is enforced by Postgres in the SAME consuming
// UPDATE on agent_review_approval_events (db/migrations/0010…sql:28, NOT NULL
// for approved at :55):  UPDATE … SET status = consumed
//   WHERE id = $decision AND intent_id = $intent AND payload_hash = $hash
//     AND status = 'approved' AND expires_at > now() RETURNING …
// Zero rows → refusal, no ledger write, no dispatch. Nothing on the approval
// path compares expires_at to now() today (9f8ac0c).
// SEAM ASKED OF THE IMPLEMENTER: module
// src/server/agents/approval-decision-repository.ts exporting
//   __seedApprovalDecisionForTests({ workspaceId, intentId, payloadHash, expiresIn })
// where expiresIn is an SQL interval applied to the STORE clock
// (now() + interval; local fallback mirrors it). The test never reads a JS
// clock in its assertions. Returns { decisionId }; the approve body carries it.
// SIMULATED: local-fallback repo + ledger via proofs/approval-route-harness.mjs
// (real route.ts through jiti), n8n replaced by a counting spy. A real-db proof
// is NOT included: the consuming UPDATE does not exist yet and the
// approval-real-db CI job only runs proofs/run-approval-real-db.sh (workflow
// change out of scope for a tests-only branch).
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { WS, rateLimit, createIntent, getIntent, installN8n, ledgerFor, hashExecutionIntentPayload }
  from "../../../proofs/approval-route-harness.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(projectRoot, "src"),
  "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs") } });
const approveRoute = await jiti.import(path.join(projectRoot, "src/app/api/agents/execution-intents/[intentId]/approve/route.ts"));
const decisions = await jiti.import("@/server/agents/approval-decision-repository").catch((e) => ({ __missing: e.message }));

function requireSeam() {
  assert.equal(typeof decisions.__seedApprovalDecisionForTests, "function",
    `missing seam approval-decision-repository.__seedApprovalDecisionForTests (${decisions.__missing ?? "not exported"})`);
}
async function seeded(tag, expiresIn) {
  requireSeam();
  rateLimit.__resetRateLimitersForTests();
  const id = await createIntent(tag);
  const hash = hashExecutionIntentPayload((await getIntent(id)).payload);
  const { decisionId } = await decisions.__seedApprovalDecisionForTests({ workspaceId: WS, intentId: id, payloadHash: hash, expiresIn });
  return { id, hash, decisionId };
}
async function approveWith(id, hash, decisionId) {
  const res = await approveRoute.POST(new Request(`http://localhost/api/agents/execution-intents/${id}/approve`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expectedPayloadHash: hash, decisionId }),
  }), { params: Promise.resolve({ intentId: id }) });
  return { status: res.status, body: await res.json() };
}
function assertRefusedNothingWritten(r, id, n8n, ledgerBefore) {
  assert.ok(r.status === 403 || r.status === 409, JSON.stringify(r));
  assert.equal(n8n.calls.length, 0, "no dispatch");
  assert.equal(ledgerFor(id).length, ledgerBefore, "no ledger write");
}

test("(a) expired approved decision → refused, no ledger write, no dispatch, intent stays pending", async () => {
  const { id, hash, decisionId } = await seeded("expiry-a", "-1 hour");
  const before = ledgerFor(id).length;
  const n8n = installN8n();
  try {
    const r = await approveWith(id, hash, decisionId);
    assertRefusedNothingWritten(r, id, n8n, before);
    assert.equal((await getIntent(id)).status, "pending");
  } finally { n8n.restore(); }
});

test("(a) control: a decision valid for 1 hour is consumed and dispatches once", async () => {
  const { id, hash, decisionId } = await seeded("expiry-a-ok", "1 hour");
  const n8n = installN8n();
  try {
    const r = await approveWith(id, hash, decisionId);
    assert.equal(r.status, 200, JSON.stringify(r));
    assert.equal(n8n.calls.length, 1);
  } finally { n8n.restore(); }
});
