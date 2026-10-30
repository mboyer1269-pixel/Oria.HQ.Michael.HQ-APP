#!/usr/bin/env node
// G1b — dispatchGovernedTool must CONSUME the decision (public consumeDecision
// option) and only then run the tool. Kills Sentinelle's surviving mutants on
// 9f69756:
//   M2: consumeDecision never called      -> consume called exactly once with
//       (workspaceId, decisionId, intentId, storedPayloadHash)
//   M3: null/empty consume result accepted -> REQUIRE_APPROVAL refusal, tool not run
//   replay: the same decision presented a second time is refused.
// SIMULATED: local fallback repo, in-memory decision store, spy executor.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) delete process.env[k];
process.env.NODE_ENV = "test";

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: { "@": path.join(projectRoot, "src"), "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs") },
});
const repo = await jiti.import("@/server/agents/execution-intent-repository");
const { buildAgentExecutionIntent } = await jiti.import("@/features/agents/execution-intent");
const { hashExecutionIntentPayload } = await jiti.import("@/server/agents/execution-intent-payload-hash");
const { dispatchGovernedTool } = await jiti.import("@/server/runtime/governed-tool-dispatch");
const { createDecisionStore } = await import(path.join(projectRoot, "proofs/approval-decision-test-support.mjs"));

const WS = "ws-consume-g1b";
let seq = 0;
async function claimedIntent() {
  seq += 1;
  const intentId = `consume-intent-${seq}`;
  const intent = buildAgentExecutionIntent({
    intentId, workspaceId: WS, agentId: "hermes", skillId: "skill-x", toolName: "n8n_webhook_trigger",
    autonomyLevel: 3, createdAt: new Date().toISOString(),
    payload: { agentId: "hermes", skillId: "skill-x", client: "Acme", email: "buyer@acme.test",
      actionType: "g1.test", missionId: "mission-g1", data: { n: seq } },
  });
  await repo.createAgentExecutionIntent(WS, "owner", intent);
  await repo.transitionAgentExecutionIntent(WS, intentId, { toStatus: "executing", expectedFromStatus: "pending",
    actionRef: `attempt:${intentId}`, updatedAt: new Date().toISOString() });
  return repo.getAgentExecutionIntent(WS, intentId);
}
const input = (intent, over = {}) => ({ workspaceId: WS, intentId: intent.intentId, toolName: intent.toolName,
  agentId: intent.agentId, payload: intent.payload, attemptToken: `attempt:${intent.intentId}`, ...over });
const spyExec = () => { const s = { n: 0 }; s.fn = async () => { s.n += 1; return { ok: true, actionRef: "ref" }; }; return s; };

test("M2: consumeDecision is called exactly once with (workspace, decisionId, intentId, stored payload hash) before the tool runs", async () => {
  const intent = await claimedIntent();
  const store = createDecisionStore();
  const decisionId = store.issue(WS, intent.intentId, hashExecutionIntentPayload(intent.payload));
  const exec = spyExec();
  let consumedBeforeRun = null;
  const consumeDecision = async (...a) => { const r = await store.consume(...a); consumedBeforeRun = exec.n === 0; return r; };
  const r = await dispatchGovernedTool(input(intent, { decisionId }), exec.fn, { consumeDecision });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(store.calls, [{ workspaceId: WS, decisionId, intentId: intent.intentId, payloadHash: hashExecutionIntentPayload(intent.payload) }]);
  assert.equal(consumedBeforeRun, true, "the decision must be consumed before the tool runs");
  assert.equal(exec.n, 1);
  assert.equal(store.isConsumed(decisionId), true);
});

for (const [label, result] of [["null", null], ["undefined", undefined], ["empty object", {}], ["false", false],
  ["row for another intent", (a) => ({ workspaceId: a[0], decisionId: a[1], intentId: "other-intent", payloadHash: a[3], consumedAt: "x" })],
  ["row for another payload hash", (a) => ({ workspaceId: a[0], decisionId: a[1], intentId: a[2], payloadHash: "f".repeat(64), consumedAt: "x" })],
  ["row for another workspace", (a) => ({ workspaceId: "ws-other", decisionId: a[1], intentId: a[2], payloadHash: a[3], consumedAt: "x" })]]) {
  test(`M3: consume result ${label} -> REQUIRE_APPROVAL refusal, tool never runs`, async () => {
    const intent = await claimedIntent();
    const exec = spyExec();
    let calls = 0;
    const consumeDecision = async (...a) => { calls += 1; return typeof result === "function" ? result(a) : result; };
    const r = await dispatchGovernedTool(input(intent, { decisionId: "11111111-1111-4111-8111-111111111111" }), exec.fn, { consumeDecision });
    assert.equal(calls, 1);
    assert.equal(r.ok, false);
    assert.equal(r.refusal?.verdict, "REQUIRE_APPROVAL", JSON.stringify(r));
    assert.equal(exec.n, 0);
  });
}

test("replay: the same decision presented a second time is refused, the tool runs once", async () => {
  const intent = await claimedIntent();
  const store = createDecisionStore();
  const decisionId = store.issue(WS, intent.intentId, hashExecutionIntentPayload(intent.payload));
  const exec = spyExec();
  assert.equal((await dispatchGovernedTool(input(intent, { decisionId }), exec.fn, { consumeDecision: store.consume })).ok, true);
  // Same intent re-claimed by a new attempt, same (already consumed) decision.
  repo.__forceAgentExecutionIntentRowForTests(WS, intent.intentId, { status: "executing", actionRef: "attempt:replay" });
  const again = await dispatchGovernedTool(input(intent, { decisionId, attemptToken: "attempt:replay" }), exec.fn, { consumeDecision: store.consume });
  assert.equal(again.ok, false);
  assert.equal(again.refusal?.verdict, "REQUIRE_APPROVAL", JSON.stringify(again));
  assert.equal(exec.n, 1);
  assert.equal(store.calls.length, 2, "the replay must still go through consume (and be refused there)");
});
