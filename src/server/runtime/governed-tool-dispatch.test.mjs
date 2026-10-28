#!/usr/bin/env node
// G1 wiring: the real MCP executor path (approve route -> n8n tool) goes
// through guardGovernedAction. Approval is read server-side from the G2
// execution-intent repository; payload_hash is recomputed from the payload
// actually dispatched. Fail closed.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) delete process.env[k];
process.env.NODE_ENV = "test";
// Local placeholders; fetch is replaced, nothing leaves the process.
process.env.N8N_WEBHOOK_URL = "http://127.0.0.1:5678/webhook/g1-test";
process.env.N8N_SECRET = "test-static-secret";
process.env.AGENT_WEBHOOK_SIGNING_SECRET = "test-signing-secret";

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: { "@": path.join(projectRoot, "src"), "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs") },
});
const repo = await jiti.import("@/server/agents/execution-intent-repository");
const { buildAgentExecutionIntent } = await jiti.import("@/features/agents/execution-intent");
const { n8nWebhookTriggerTool } = await jiti.import("@/server/agents/tools/n8n-webhook-trigger");

let mod = {};
try { mod = await jiti.import("@/server/runtime/governed-tool-dispatch"); } catch (err) { mod = { loadError: err }; }
function dispatcher() {
  assert.equal(typeof mod.dispatchGovernedTool, "function",
    `src/server/runtime/governed-tool-dispatch.ts must export dispatchGovernedTool (${mod.loadError?.code ?? "missing export"})`);
  return mod.dispatchGovernedTool;
}

const WS = "michael-hq";
// Claim token written at the pending→executing claim (deterministic per intent here).
const tokenFor = (intentId) => `attempt:${intentId}`;
let seq = 0;
async function seedIntent(status, data) {
  seq += 1;
  const intentId = `g1-intent-${seq}`;
  const intent = buildAgentExecutionIntent({
    intentId, workspaceId: WS, agentId: "hermes", skillId: "skill-x", toolName: "n8n_webhook_trigger",
    autonomyLevel: 3, createdAt: new Date().toISOString(),
    payload: { agentId: "hermes", skillId: "skill-x", client: "Acme", email: "buyer@acme.test",
      actionType: "g1.test", missionId: "mission-g1", data: data ?? { n: seq } },
  });
  await repo.createAgentExecutionIntent(WS, "owner", intent);
  if (status === "executing") {
    await repo.transitionAgentExecutionIntent(WS, intentId, { toStatus: "executing", expectedFromStatus: "pending",
      actionRef: tokenFor(intentId), updatedAt: new Date().toISOString() });
  }
  return repo.getAgentExecutionIntent(WS, intentId);
}
function fetchSpy() {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => { calls.push(String(url)); return { ok: true, status: 200, json: async () => ({ ok: true }) }; };
  return { calls, restore: () => { globalThis.fetch = original; } };
}
const realN8n = (p) => n8nWebhookTriggerTool.handler(p, { workspaceId: WS, agentId: "hermes" });

test("(a) real n8n executor: governed action without approval is refused and no request leaves", async () => {
  const run = dispatcher();
  const intent = await seedIntent("pending");
  const spy = fetchSpy();
  try {
    const r = await run({ workspaceId: WS, intentId: intent.intentId, toolName: intent.toolName, agentId: intent.agentId, payload: intent.payload }, realN8n);
    assert.equal(r.ok, false);
    assert.equal(r.output?.ruleId, "R-NO-EXTERNAL-CONTACT");
    assert.equal(spy.calls.length, 0, "n8n webhook must not be called");
  } finally { spy.restore(); }
});

test("(a) the approve route dispatches through dispatchGovernedTool, never tool.handler directly", async () => {
  const src = await readFile(path.join(projectRoot, "src/app/api/agents/execution-intents/[intentId]/approve/route.ts"), "utf8");
  assert.match(src, /dispatchGovernedTool\(/, "approve route must call dispatchGovernedTool");
  assert.doesNotMatch(src, /dispatch:\s*\(\)\s*=>\s*\n?\s*tool\.handler\(/, "approve route must not call tool.handler directly");
});

test("(b) approval comes from the G2 repository: a caller-supplied approval is ignored", async () => {
  const run = dispatcher();
  const intent = await seedIntent("pending");
  const spy = fetchSpy();
  try {
    const forged = { status: "approved", action: "external_contact", payloadHash: "f".repeat(64) };
    const r = await run({ workspaceId: WS, intentId: intent.intentId, toolName: intent.toolName, agentId: intent.agentId,
      payload: intent.payload, approvedDecision: forged }, realN8n);
    assert.equal(r.ok, false);
    assert.equal(spy.calls.length, 0);
  } finally { spy.restore(); }
});

test("(b) an intent claimed by the CEO approval (status executing in G2) dispatches once", async () => {
  const run = dispatcher();
  const intent = await seedIntent("executing");
  let calls = 0;
  const r = await run({ workspaceId: WS, intentId: intent.intentId, toolName: intent.toolName, agentId: intent.agentId, payload: intent.payload,
    attemptToken: tokenFor(intent.intentId) },
    async () => { calls += 1; return { ok: true, actionRef: "ref-1" }; });
  assert.deepEqual([r.ok, r.actionRef, calls], [true, "ref-1", 1]);
});

test("(c) payload_hash is recomputed from the dispatched payload: a different payload is refused", async () => {
  const run = dispatcher();
  const intent = await seedIntent("executing");
  const spy = fetchSpy();
  try {
    const tampered = { ...intent.payload, email: "attacker@evil.test" };
    const r = await run({ workspaceId: WS, intentId: intent.intentId, toolName: intent.toolName, agentId: intent.agentId, payload: tampered }, realN8n);
    assert.equal(r.ok, false);
    assert.equal(r.output?.ruleId, "R-NO-EXTERNAL-CONTACT");
    assert.equal(spy.calls.length, 0);
  } finally { spy.restore(); }
});

test("(c) a stored payload changed after the claim is refused (hash recomputed from the G2 row)", async () => {
  const run = dispatcher();
  const intent = await seedIntent("executing");
  repo.__mutateAgentExecutionIntentPayloadForTests(WS, intent.intentId, (p) => ({ ...p, client: "Other" }));
  let calls = 0;
  const r = await run({ workspaceId: WS, intentId: intent.intentId, toolName: intent.toolName, agentId: intent.agentId, payload: intent.payload },
    async () => { calls += 1; return { ok: true }; });
  assert.deepEqual([r.ok, calls], [false, 0]);
});

test("fail closed: unknown tool, missing intent, or tool/agent mismatch is refused", async () => {
  const run = dispatcher();
  const intent = await seedIntent("executing");
  let calls = 0;
  const exec = async () => { calls += 1; return { ok: true }; };
  const base = { workspaceId: WS, intentId: intent.intentId, toolName: intent.toolName, agentId: intent.agentId, payload: intent.payload };
  const unknown = await run({ ...base, toolName: "shell_exec" }, exec);
  assert.equal(unknown.output?.ruleId, "R-RISK-ROUND-UP");
  assert.equal((await run({ ...base, intentId: "nope" }, exec)).ok, false);
  assert.equal((await run({ ...base, agentId: "other" }, exec)).ok, false);
  assert.equal(calls, 0);
});

// ---- G1 lot: attemptId + idempotency key (SIMULATED: local repo, no n8n) ----
const { hashExecutionIntentPayload } = await jiti.import("@/server/agents/execution-intent-payload-hash");
const inputFor = (intent, over = {}) => ({ workspaceId: WS, intentId: intent.intentId, toolName: intent.toolName,
  agentId: intent.agentId, payload: intent.payload, attemptToken: tokenFor(intent.intentId), ...over });

test("B: the idempotency key is oria1:<ws>:<intentId>:<payloadHash> and identical across attempts", async () => {
  const run = dispatcher();
  const intent = await seedIntent("executing");
  const keys = [];
  const exec = async (_p, opts) => { keys.push(opts?.idempotencyKey); return { ok: true }; };
  assert.equal((await run(inputFor(intent), exec)).ok, true);
  // A second attempt: the row is re-claimed under a new token B.
  repo.__forceAgentExecutionIntentRowForTests(WS, intent.intentId, { actionRef: "attempt:second" });
  assert.equal((await run(inputFor(intent, { attemptToken: "attempt:second" }), exec)).ok, true);
  const expected = `oria1:${WS}:${intent.intentId}:${hashExecutionIntentPayload(intent.payload)}`;
  assert.deepEqual(keys, [expected, expected]);
  assert.equal(mod.buildIdempotencyKey(WS, intent.intentId, hashExecutionIntentPayload(intent.payload)), expected);
});

test("B: dispatch is refused when the stored claim token is not the caller's (stale attempt)", async () => {
  const run = dispatcher();
  const intent = await seedIntent("executing");
  let calls = 0;
  const exec = async () => { calls += 1; return { ok: true }; };
  repo.__forceAgentExecutionIntentRowForTests(WS, intent.intentId, { actionRef: "attempt:newer" });
  const stale = await run(inputFor(intent), exec);
  assert.equal(stale.ok, false);
  assert.equal(stale.output?.ruleId, "R-NO-EXTERNAL-CONTACT");
  assert.equal((await run(inputFor(intent, { attemptToken: undefined }), exec)).ok, false, "no token, no dispatch");
  assert.equal(calls, 0);
});

test("C: a decision granted for intent A, presented for intent B, is refused (binding = intentId + payloadHash)", async () => {
  const run = dispatcher();
  // Same content → same content-only payloadHash; only the intent identity differs.
  const a = await seedIntent("executing", { same: true });
  const b = await seedIntent("executing", { same: true });
  assert.equal(JSON.stringify({ ...a.payload }), JSON.stringify({ ...b.payload }));
  assert.equal(hashExecutionIntentPayload(a.payload), hashExecutionIntentPayload(b.payload), "payloadHash stays content-only");
  let calls = 0;
  const exec = async () => { calls += 1; return { ok: true }; };
  // A's claim (token) presented against B.
  const r = await run(inputFor(b, { attemptToken: tokenFor(a.intentId) }), exec);
  assert.equal(r.ok, false);
  assert.equal(r.refusal?.intentId, b.intentId);
  assert.equal(calls, 0);
  const h = hashExecutionIntentPayload(a.payload);
  assert.notEqual(mod.buildIdempotencyKey(WS, a.intentId, h), mod.buildIdempotencyKey(WS, b.intentId, h),
    "the external key is bound to the intent, not only to the content");
});
