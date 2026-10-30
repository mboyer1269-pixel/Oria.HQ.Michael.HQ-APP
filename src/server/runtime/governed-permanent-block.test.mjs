// Permanent policy refusals are distinct from unknown actions; approvals grant no exception.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const jiti = createJiti(import.meta.url, { alias: {
  "@": path.join(root, "src"),
  "server-only": path.join(root, "src/scripts/smoke/server-only-stub.mjs"),
} });
const guard = await jiti.import("@/server/runtime/execution-guard");
const { precheckGovernedTool, dispatchGovernedTool } = await jiti.import("@/server/runtime/governed-tool-dispatch");
const { hashExecutionIntentPayload } = await jiti.import("@/server/agents/execution-intent-payload-hash");

const blocked = [
  ["ledger_mutate", "R-LEDGER-APPEND-ONLY"],
  ["permission_grant", "R-NO-AGENT-ESCALATION"],
];
for (const [action, ruleId] of blocked) {
  for (const status of [undefined, "pending", "rejected", "approved"]) {
    test(`${action}: ${status ?? "absent"} decision cannot override permanent refusal`, () => {
      let executed = 0;
      const verdict = guard.guardGovernedAction({
        agentId: "a", action, payloadHash: "h",
        approvedDecision: status ? { status, action, payloadHash: "h" } : undefined,
      }, () => { executed++; });
      assert.deepEqual([verdict.allowed, verdict.verdict, verdict.ruleId, verdict.executed, executed],
        [false, "BLOCK", ruleId, false, 0]);
      assert.match(verdict.reason, /cannot authorize/);
      assert.equal(guard.GOVERNED_ACTION_RULES[action], ruleId);
      assert.ok(!guard.NON_ACTION_RULE_IDS.includes(ruleId));
    });
  }

  test(`${action}: permanent refusal does not inspect approval`, () => {
    const request = { agentId: "a", action, payloadHash: "" };
    Object.defineProperty(request, "approvedDecision", { get() { throw Error("approval inspected"); } });
    const verdict = guard.guardGovernedAction(request, () => { throw Error("executed"); });
    assert.deepEqual([verdict.verdict, verdict.ruleId], ["BLOCK", ruleId]);
  });

  test(`${action}: advisory and legacy dispatch refuse before repository access`, async () => {
    const payload = { agentId: "a", data: {} };
    const payloadHash = hashExecutionIntentPayload(payload);
    const advisory = precheckGovernedTool({ intentId: "i", toolName: action, payload });
    assert.deepEqual([advisory?.verdict, advisory?.ruleId], ["BLOCK", ruleId]);
    let executed = 0;
    let consumed = 0;
    let loaded = 0;
    const result = await dispatchGovernedTool({
      workspaceId: "w", intentId: "i", toolName: action, agentId: "a", payload,
      attemptToken: "attempt:test", decisionId: "d",
    }, async () => { executed++; return { ok: true }; }, {
      loadIntent: async () => { loaded++; return { status: "executing", toolName: action, agentId: "a",
        actionRef: "attempt:test", payload }; },
      consumeDecision: async () => {
        consumed++;
        return { workspaceId: "w", intentId: "i", decisionId: "d", payloadHash };
      },
    });
    assert.equal(loaded, 0);
    assert.equal(consumed, 0);
    assert.equal(executed, 0);
    assert.deepEqual([result.ok, result.refusal?.verdict, result.refusal?.ruleId],
      [false, "BLOCK", ruleId]);
    assert.equal(result.refusal.reason, advisory.reason);
  });
}

test("unknown actions remain fail-closed with no execution even with exact approval", () => {
  for (const action of ["unknown_action", "git_push", "ledger_append", "LEDGER_MUTATE", "permission_grant ", "__proto__", "constructor", ""]) {
    let executed = 0;
    const verdict = guard.guardGovernedAction({ agentId: "a", action, payloadHash: "h",
      approvedDecision: { status: "approved", action, payloadHash: "h" },
    }, () => { executed++; });
    assert.deepEqual([verdict.verdict, verdict.ruleId, verdict.executed, executed],
      ["BLOCK", "R-RISK-ROUND-UP", false, 0], action);
  }
});

test("legacy dispatch refuses unknown and unhashable actions before repository access", async () => {
  const circular = { agentId: "a" };
  circular.self = circular;
  for (const [toolName, payload, ruleId] of [
    ["unknown_action", { agentId: "a" }, "R-RISK-ROUND-UP"],
    ["n8n_webhook_trigger", circular, "R-NO-EXTERNAL-CONTACT"],
  ]) {
    const calls = [];
    const result = await dispatchGovernedTool({ workspaceId: "w", intentId: "i", agentId: "a",
      toolName, payload, attemptToken: "attempt:test", decisionId: "d",
    }, async () => { calls.push("execute"); return { ok: true }; }, {
      loadIntent: async () => { calls.push("load"); return null; },
      consumeDecision: async () => { calls.push("consume"); return null; },
    });
    assert.deepEqual(calls, []);
    assert.deepEqual([result.ok, result.refusal?.verdict, result.refusal?.ruleId], [false, "BLOCK", ruleId]);
  }
});

test("legacy advisory pass cannot bypass the binding payload check after a load-time race", async () => {
  const payload = { agentId: "a", data: { value: "reviewed" } };
  const storedPayload = structuredClone(payload);
  const hash = hashExecutionIntentPayload(storedPayload);
  const calls = [];
  const result = await dispatchGovernedTool({ workspaceId: "w", intentId: "i", agentId: "a",
    toolName: "n8n_webhook_trigger", payload, attemptToken: "attempt:test", decisionId: "d",
  }, async () => { calls.push("execute"); return { ok: true }; }, {
    loadIntent: async () => {
      calls.push("load");
      payload.data.value = "changed after precheck";
      return { status: "executing", toolName: "n8n_webhook_trigger", agentId: "a",
        actionRef: "attempt:test", payload: storedPayload };
    },
    consumeDecision: async () => {
      calls.push("consume");
      return { workspaceId: "w", intentId: "i", decisionId: "d", payloadHash: hash };
    },
  });
  assert.deepEqual(calls, ["load", "consume"]);
  assert.deepEqual([result.ok, result.refusal?.verdict, result.refusal?.ruleId],
    [false, "BLOCK", "R-NO-EXTERNAL-CONTACT"]);
  assert.match(result.refusal.reason, /payload hash does not match/);
});
