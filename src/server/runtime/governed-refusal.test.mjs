#!/usr/bin/env node
// Lot 1: structured refusals. Three outcome classes stay distinct:
// policy refusal (GUARD_REFUSED:<ruleId>), technical failure, uncertain external result.
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
const guard = await jiti.import("@/server/runtime/execution-guard");
const { dispatchGovernedTool } = await jiti.import("@/server/runtime/governed-tool-dispatch");
const { approveAndDispatchExecutionIntent } = await jiti.import("@/server/agents/execution-intent-approval-service");
const repo = await jiti.import("@/server/agents/execution-intent-repository");
const { buildAgentExecutionIntent } = await jiti.import("@/features/agents/execution-intent");
const { n8nWebhookTriggerTool } = await jiti.import("@/server/agents/tools/n8n-webhook-trigger");

const noop = () => "ran";

test("guard: ruleVersion equals core.md rules-version", async () => {
  const core = await readFile(path.join(projectRoot, ".agents/rules/core.md"), "utf8");
  const m = core.match(/rules-version:\s*(\d+)/);
  assert.ok(m);
  assert.equal(guard.GOVERNED_RULES_VERSION, Number(m[1]));
});

test("guard: missing approval -> REQUIRE_APPROVAL (approvable)", () => {
  const v = guard.guardGovernedAction({ agentId: "a", action: "merge", payloadHash: "h" }, noop);
  assert.deepEqual([v.allowed, v.verdict, v.ruleId, v.ruleVersion, v.action], [false, "REQUIRE_APPROVAL", "R-NO-MERGE", guard.GOVERNED_RULES_VERSION, "merge"]);
});

test("guard: unknown action, hash mismatch, wrong-action approval -> BLOCK (never approvable)", () => {
  const unknown = guard.guardGovernedAction({ agentId: "a", action: "ship", payloadHash: "h",
    approvedDecision: { status: "approved", action: "ship", payloadHash: "h" } }, noop);
  assert.deepEqual([unknown.verdict, unknown.ruleId], ["BLOCK", "R-RISK-ROUND-UP"]);
  const tampered = guard.guardGovernedAction({ agentId: "a", action: "merge", payloadHash: "new",
    approvedDecision: { status: "approved", action: "merge", payloadHash: "old" } }, noop);
  assert.equal(tampered.verdict, "BLOCK");
  const other = guard.guardGovernedAction({ agentId: "a", action: "deploy", payloadHash: "h",
    approvedDecision: { status: "approved", action: "merge", payloadHash: "h" } }, noop);
  assert.equal(other.verdict, "BLOCK");
});

test("guard: match -> ALLOW and executes once", () => {
  const v = guard.guardGovernedAction({ agentId: "a", action: "merge", payloadHash: "h",
    approvedDecision: { status: "approved", action: "merge", payloadHash: "h" } }, noop);
  assert.deepEqual([v.allowed, v.verdict, v.result], [true, "ALLOW", "ran"]);
});

test("dispatch: refusal carries a structured refusal and no request leaves", async () => {
  let calls = 0;
  const r = await dispatchGovernedTool(
    { workspaceId: "ws-x", intentId: "missing", toolName: "shell_exec", agentId: "a", payload: { agentId: "a" } },
    async () => { calls += 1; return { ok: true }; });
  assert.equal(calls, 0);
  assert.equal(r.ok, false);
  assert.deepEqual(
    { verdict: r.refusal?.verdict, ruleId: r.refusal?.ruleId, action: r.refusal?.action, intentId: r.refusal?.intentId },
    { verdict: "BLOCK", ruleId: "R-RISK-ROUND-UP", action: "shell_exec", intentId: "missing" });
  assert.equal(r.refusal.ruleVersion, guard.GOVERNED_RULES_VERSION);
  assert.equal(typeof r.refusal.reason, "string");
});

function deps(order, dispatchResult) {
  return {
    evaluate: () => ({ outcome: "ALLOW", reason: "ok" }),
    markExecuting: async () => void order.push("markExecuting"),
    recordAttempt: async () => void order.push("recordAttempt"),
    dispatch: async () => { order.push("dispatch"); return dispatchResult; },
    recordResult: async (_ok, phase, details) => void order.push({ phase, details }),
    markExecuted: async () => void order.push("markExecuted"),
    markFailed: async (code) => void order.push(`markFailed:${code}`),
    revertToPending: async () => void order.push("revertToPending"),
    revertClaim: async () => void order.push("revertClaim"),
  };
}
const REFUSAL = { verdict: "BLOCK", ruleId: "R-RISK-ROUND-UP", ruleVersion: 1, reason: "unknown", action: "shell_exec", intentId: "i1" };

test("service: policy refusal -> status refused, 403, GUARD_REFUSED:<ruleId>, ledger phase refused with rule", async () => {
  const order = [];
  const res = await approveAndDispatchExecutionIntent(deps(order, { ok: false, error: "x", refusal: REFUSAL }));
  assert.deepEqual([res.ok, res.status, res.httpStatus], [false, "refused", 403]);
  assert.deepEqual(res.refusal, REFUSAL);
  assert.ok(order.includes("markFailed:GUARD_REFUSED:R-RISK-ROUND-UP"));
  assert.ok(!order.includes("markFailed:DISPATCH_FAILED"));
  const rec = order.find((o) => typeof o === "object");
  assert.equal(rec.phase, "refused");
  assert.deepEqual(rec.details?.refusal, REFUSAL);
});

test("service: technical failure stays DISPATCH_FAILED / 502", async () => {
  const order = [];
  const res = await approveAndDispatchExecutionIntent(deps(order, { ok: false, error: "500" }));
  assert.deepEqual([res.status, res.httpStatus], ["failed", 502]);
  assert.ok(order.includes("markFailed:DISPATCH_FAILED"));
});

test("service: uncertain external result is not marked failed nor reverted; stays executing", async () => {
  const order = [];
  const res = await approveAndDispatchExecutionIntent(deps(order, { ok: false, error: "aborted", outcomeUncertain: true }));
  assert.deepEqual([res.ok, res.status, res.outcome], [false, "executing", "uncertain"]);
  assert.equal(order.some((o) => typeof o === "string" && (o.startsWith("markFailed") || o === "revertToPending" || o === "markExecuted")), false);
  assert.equal(order.find((o) => typeof o === "object").phase, "uncertain");
});

test("service: a throw from dispatch is uncertain (stays executing, no markFailed/revert/resend)", async () => {
  const order = [];
  const d = deps(order, null);
  let calls = 0;
  d.dispatch = async () => { calls += 1; throw new Error("socket hang up"); };
  const res = await approveAndDispatchExecutionIntent(d);
  assert.deepEqual([res.ok, res.status, res.outcome, calls], [false, "executing", "uncertain", 1]);
  assert.equal(order.some((o) => typeof o === "string" && (o.startsWith("markFailed") || o === "revertToPending" || o === "markExecuted")), false);
  assert.equal(order.find((o) => typeof o === "object").phase, "uncertain");
});

test("n8n tool: a thrown fetch or an HTTP 5xx is outcomeUncertain; an HTTP 4xx is not", async () => {
  const ORIGINAL = process.env;
  process.env = { ...ORIGINAL, AGENT_WEBHOOK_SIGNING_SECRET: "k", N8N_SECRET: "s", N8N_WEBHOOK_URL: "https://hooks.n8n.cloud/webhook/x" };
  delete process.env.NODE_ENV;
  try {
    const payload = buildAgentExecutionIntent({ intentId: "u1", workspaceId: "ws1", agentId: "hermes", skillId: "task.create",
      toolName: "n8n_webhook_trigger", autonomyLevel: 2, createdAt: "2026-06-10T00:00:00.000Z",
      payload: { agentId: "hermes", skillId: "task.create", client: "Acme", email: "a@b.com", actionType: "send_email", missionId: "m1", data: {} } }).payload;
    const base = { isAllowed: async () => true, now: () => 1 };
    const thrown = await n8nWebhookTriggerTool.handler(payload, { workspaceId: "ws1", idempotencyKey: "oria1:ws1:u1:test",
      deps: { ...base, fetchImpl: async () => { const e = new Error("aborted"); e.name = "AbortError"; throw e; } } });
    assert.deepEqual([thrown.ok, thrown.outcomeUncertain], [false, true]);
    const http500 = await n8nWebhookTriggerTool.handler(payload, { workspaceId: "ws1", idempotencyKey: "oria1:ws1:u1:test",
      deps: { ...base, fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }) } });
    assert.deepEqual([http500.ok, http500.outcomeUncertain], [false, true]);
    const http400 = await n8nWebhookTriggerTool.handler(payload, { workspaceId: "ws1", idempotencyKey: "oria1:ws1:u1:test",
      deps: { ...base, fetchImpl: async () => ({ ok: false, status: 400, json: async () => ({}) }) } });
    assert.equal(http400.ok, false);
    assert.notEqual(http400.outcomeUncertain, true);
  } finally { process.env = ORIGINAL; }
});

test("route: refusal body is structured and ledger metadata carries rule/version/reason/action/requestId/payloadHash", async () => {
  // Behavioural: real approve route handler (harness loaded last, on its own jiti instance).
  const h = await import("../../../proofs/approval-route-harness.mjs");
  const id = await h.createIntent("governed-refusal-route");
  const n8n = h.installN8n();
  h.tamperAfterClaim(id);
  let r;
  try { r = await h.approve(id); } finally { h.clearHook(); n8n.restore(); }
  assert.equal(r.status, 403, JSON.stringify(r.body));
  assert.equal(r.body.status, "refused");
  assert.ok(r.body.ruleVersion !== undefined && r.body.ruleVersion !== null && r.body.ruleVersion !== "", "body.ruleVersion");
  assert.equal(r.body.ruleVersion, guard.GOVERNED_RULES_VERSION);
  for (const k of ["verdict", "ruleId", "reason", "action"]) {
    assert.equal(typeof r.body[k], "string", `body.${k}`);
    assert.ok(r.body[k].length > 0, `body.${k} empty`);
  }
  assert.equal(n8n.calls.length, 0);
  const refused = h.ledgerFor(id).filter((e) => e.metadata.phase === "refused");
  assert.equal(refused.length, 1);
  const m = refused[0].metadata;
  for (const k of ["verdict", "ruleId", "ruleVersion", "reason", "action"]) assert.equal(m[k], r.body[k], `ledger.${k}`);
  assert.equal(typeof m.requestId, "string");
  assert.ok(m.requestId.length > 0);
  assert.match(m.approvedDigest, /^[0-9a-f]{64}$/, "payload hash recorded as approvedDigest");
  assert.equal((await h.getIntent(id)).failureCode, `GUARD_REFUSED:${r.body.ruleId}`);
});
void repo;
