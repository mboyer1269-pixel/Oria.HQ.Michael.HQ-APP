// Offline fixture only. Actual atomic factory/service/dispatch with an explicit
// SIMULATED transaction port and local repository. This does NOT prove SQL
// atomicity/rollback; the separate admission DB harness must establish those.
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

globalThis.fetch = async () => { throw new Error("Unexpected network in expiry fixture"); };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const h = await import("./approval-route-harness.mjs");
const { createDecisionStore, buildApproveHandler } = await import("./approval-decision-test-support.mjs");
const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, { alias: {
  "@": path.join(root, "src"),
  "server-only": path.join(root, "src/scripts/smoke/server-only-stub.mjs"),
} });

export async function expiryFixture(tag, expiresInMs) {
  const storeNow = Date.parse("2026-01-01T00:00:00.000Z");
  const store = createDecisionStore({ now: () => storeNow });
  const actorId = '11111111-1111-4111-8111-111111111111';
  const {recordLedgerEvent}=await jiti.import('@/server/actions/ledger-events');
  const {getActiveWorkspaceContext}=await jiti.import('@/core/workspace-context');
  const fresh=new WeakSet();
  const atomicAdmission={
    async admit(input){
      const current=await h.getIntent(input.source.intentId);
      if(current?.status!=='pending')return{status:'conflict'};
      const consumed=await store.consume(input.source.workspaceId,input.decisionId,input.source.intentId,input.payloadHash);
      if(!consumed)return{status:'approval_required'};
      await h.repo.transitionAgentExecutionIntent(h.WS,input.source.intentId,{toStatus:'executing',expectedFromStatus:'pending',expectedPayload:current.payload,actionRef:'attempt:'+input.attemptId,updatedAt:new Date(storeNow).toISOString()});
      await recordLedgerEvent(getActiveWorkspaceContext(),{eventType:'action',actionType:'execution_intent.owner_admitted',summary:'SIMULATED atomic admission port',autonomyLevel:0,requiresConfirmation:true,workspaceId:h.WS,actorId,approverId:actorId,effect:{kind:'db_write',operation:'create',target:'simulated_admission'},metadata:{intentId:input.source.intentId,attemptId:input.attemptId}});
      const receipt={version:1,workspaceId:h.WS,actorId,intentId:input.source.intentId,decisionId:input.decisionId,attemptId:input.attemptId,payloadHash:input.payloadHash,sourceHash:input.sourceHash,ledgerId:input.attemptId,ledgerHash:'a'.repeat(64),admittedAt:new Date(storeNow).toISOString()};fresh.add(receipt);return{status:'admitted',receipt};
    },
    async takeCurrent(input,receipt){return fresh.delete(receipt)&&store.isConsumed(input.decisionId)&&(await h.getIntent(input.source.intentId))?.actionRef==='attempt:'+input.attemptId;},
  };
  const POST = await buildApproveHandler(jiti, root, { store, atomicAdmission, authenticatedActorId:actorId });
  h.rateLimit.__resetRateLimitersForTests();
  const id = await h.createIntent(tag);
  const hash = h.hashExecutionIntentPayload((await h.getIntent(id)).payload);
  const decisionId = store.issue(h.WS, id, hash, { expiresAt: storeNow + expiresInMs });
  const initialLedger = structuredClone(h.ledgerFor(id));
  const n8n = h.installN8n();
  return {
    id, store, decisionId, initialLedger, n8n,
    ledger: () => structuredClone(h.ledgerFor(id)),
    intent: () => h.getIntent(id),
    async approve() {
      const res = await POST(new Request(`http://localhost/api/agents/execution-intents/${id}/approve`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedPayloadHash: hash, decisionId }),
      }), { params: Promise.resolve({ intentId: id }) });
      return { status: res.status, body: await res.json() };
    },
    async assertRefusedWithoutAdmission(result) {
      assert.ok(result.status === 403 || result.status === 409, JSON.stringify(result));
      assert.equal(n8n.calls.length, 0, "no external dispatch");
      assert.equal(store.isConsumed(decisionId), false, "expired decision remains unconsumed");
      assert.deepEqual({ ledger: h.ledgerFor(id), status: (await h.getIntent(id)).status },
        { ledger: initialLedger, status: "pending" }, "refusal must not claim or append an execution attempt");
    },
    close: () => n8n.restore(),
  };
}
