#!/usr/bin/env node
// Lot 2: advisory precheck before the claim; binding re-check after it.
// Simulated: local in-memory repo, fetch spied (no request leaves). Not real DB.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: { "@": path.join(projectRoot, "src"), "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs") },
});
const { approveAndDispatchExecutionIntent } = await jiti.import("@/server/agents/execution-intent-approval-service");
const repo = await jiti.import("@/server/agents/execution-intent-repository");
const { buildAgentExecutionIntent } = await jiti.import("@/features/agents/execution-intent");
const gtd = await jiti.import("@/server/runtime/governed-tool-dispatch");

const WS = "lot2-ws";
let seq = 0;
async function seed(toolName = "n8n_webhook_trigger") {
  seq += 1;
  const intent = buildAgentExecutionIntent({
    intentId: `lot2-${seq}`, workspaceId: WS, agentId: "hermes", skillId: "skill-x", toolName,
    autonomyLevel: 3, createdAt: new Date().toISOString(),
    payload: { agentId: "hermes", skillId: "skill-x", client: "Acme", email: "buyer@acme.test", actionType: "lot2", missionId: "m", data: { n: seq } },
  });
  await repo.createAgentExecutionIntent(WS, "owner", intent);
  return repo.getAgentExecutionIntent(WS, intent.intentId);
}

// Wires the service exactly like the approve route (claim, dispatchGovernedTool, conditional transitions).
function wire(intent, { effects, recordAttempt, policyTool } = {}) {
  const t = (patch) => repo.transitionAgentExecutionIntent(WS, intent.intentId, { updatedAt: new Date().toISOString(), ...patch });
  const TOKEN = `attempt:${intent.intentId}`;
  return {
    precheck: () => gtd.precheckGovernedTool({ intentId: intent.intentId, toolName: intent.toolName, payload: intent.payload }),
    evaluate: () => ({ outcome: "ALLOW", reason: "ok" }),
    // G1: the claim writes this attempt's token; dispatch is bound to it.
    markExecuting: () => t({ toStatus: "executing", expectedFromStatus: "pending", expectedPayload: intent.payload, actionRef: TOKEN }),
    recordAttempt: recordAttempt ?? (async () => {}),
    dispatch: () => gtd.dispatchGovernedTool(
      { workspaceId: WS, intentId: intent.intentId, toolName: policyTool ?? intent.toolName, agentId: intent.agentId, payload: intent.payload, attemptToken: TOKEN },
      async () => { effects.n += 1; return { ok: true, actionRef: "ref" }; },
      policyTool ? { loadIntent: async () => ({ ...(await repo.getAgentExecutionIntent(WS, intent.intentId)), toolName: policyTool }) } : {}),
    recordResult: async () => {},
    markExecuted: (actionRef) => t({ toStatus: "executed", expectedFromStatus: "executing", ...(actionRef ? { actionRef } : {}) }),
    markFailed: (failureCode) => t({ toStatus: "failed", expectedFromStatus: "executing", failureCode }),
    revertToPending: () => t({ toStatus: "pending", expectedFromStatus: "executing" }),
    revertClaim: () => t({ toStatus: "pending", expectedFromStatus: "executing", expectedPayload: intent.payload }),
  };
}

test("precheck refusal: 403, intent stays pending, no claim, no effect", async () => {
  const intent = await seed("shell_exec");
  const effects = { n: 0 };
  const res = await approveAndDispatchExecutionIntent(wire(intent, { effects }));
  assert.deepEqual([res.ok, res.status, res.httpStatus, res.stage, res.refusal?.ruleId, res.refusal?.verdict],
    [false, "refused", 403, "precheck", "R-RISK-ROUND-UP", "BLOCK"]);
  assert.equal(effects.n, 0);
  assert.equal((await repo.getAgentExecutionIntent(WS, intent.intentId)).status, "pending");
});

test("precheck passes for a mapped tool (it never itself grants or executes)", () => {
  const r = gtd.precheckGovernedTool({ intentId: "x", toolName: "n8n_webhook_trigger", payload: { agentId: "a" } });
  assert.equal(r, null);
});

test("payload changed after precheck: claim refuses, no effect", async () => {
  const intent = await seed();
  const effects = { n: 0 };
  const deps = wire(intent, { effects });
  const precheck = deps.precheck;
  deps.precheck = () => {
    const r = precheck();
    repo.__mutateAgentExecutionIntentPayloadForTests(WS, intent.intentId, (p) => ({ ...p, email: "attacker@evil.test" }));
    return r;
  };
  await assert.rejects(approveAndDispatchExecutionIntent(deps), (e) => e instanceof repo.AgentExecutionIntentConcurrencyError);
  assert.equal(effects.n, 0);
  assert.equal((await repo.getAgentExecutionIntent(WS, intent.intentId)).status, "pending");
});

test("policy changed after precheck: binding re-check refuses after claim, no effect, GUARD_REFUSED", async () => {
  const intent = await seed();
  const effects = { n: 0 };
  // Precheck saw a mapped tool; at dispatch time the policy no longer maps it.
  const res = await approveAndDispatchExecutionIntent(wire(intent, { effects, policyTool: "now_unmapped_tool" }));
  assert.deepEqual([res.status, res.stage, res.refusal?.ruleId], ["refused", "dispatch", "R-RISK-ROUND-UP"]);
  assert.equal(effects.n, 0);
  const row = await repo.getAgentExecutionIntent(WS, intent.intentId);
  assert.deepEqual([row.status, row.failureCode], ["failed", "GUARD_REFUSED:R-RISK-ROUND-UP"]);
});

test("two concurrent approves: exactly one dispatch", async () => {
  const intent = await seed();
  const effects = { n: 0 };
  const results = await Promise.allSettled([
    approveAndDispatchExecutionIntent(wire(intent, { effects })),
    approveAndDispatchExecutionIntent(wire(intent, { effects })),
  ]);
  assert.equal(effects.n, 1);
  assert.equal(results.filter((r) => r.status === "fulfilled" && r.value.ok).length, 1);
  assert.equal((await repo.getAgentExecutionIntent(WS, intent.intentId)).status, "executed");
});

test("ledger write failure before the effect: no effect, claim reverted to pending", async () => {
  const intent = await seed();
  const effects = { n: 0 };
  const res = await approveAndDispatchExecutionIntent(wire(intent, { effects, recordAttempt: async () => { throw new Error("ledger down"); } }));
  assert.deepEqual([res.ok, res.reason, res.claimReverted], [false, "ledger_unavailable", true]);
  assert.equal(effects.n, 0);
  assert.equal((await repo.getAgentExecutionIntent(WS, intent.intentId)).status, "pending");
});

test("terminal transitions are conditional on executing (no double settle)", async () => {
  const intent = await seed();
  const deps = wire(intent, { effects: { n: 0 } });
  await deps.markExecuting();
  await deps.markExecuted("r1");
  await assert.rejects(deps.markFailed("LATE"), (e) => e instanceof repo.AgentExecutionIntentConcurrencyError);
  // The route binds deps; the sequence lives in createApproveHandler (5c1871c).
  const src =
    (await readFile(path.join(projectRoot, "src/app/api/agents/execution-intents/[intentId]/approve/route.ts"), "utf8")) +
    (await readFile(path.join(projectRoot, "src/server/agents/execution-intent-approve-handler.ts"), "utf8"));
  assert.match(src, /toStatus: "executed",\s*expectedFromStatus: "executing"/);
  assert.match(src, /toStatus: "failed",\s*expectedFromStatus: fromStatus/);
  assert.match(src, /fromStatus = "executing"/);
  assert.match(src, /precheck: \(\) =>/);
});
