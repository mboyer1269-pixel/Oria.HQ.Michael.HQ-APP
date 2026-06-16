#!/usr/bin/env node

// src/server/agents/execution-intent-approval.test.mjs
//
// Verifies the CEO approval orchestration: Sentinelle BLOCK never dispatches;
// the ledger is recorded before and after the n8n call; status transitions land
// correctly; a rate-limited dispatch stays retryable (pending). fetch is always
// injected -- no real network call.

import assert from "node:assert/strict";
import path from "node:path";
import test, { describe } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

// Local-fallback repo (no Supabase).
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});

const { approveAndDispatchExecutionIntent } = await jiti.import(
  path.join(__dirname, "execution-intent-approval-service.ts"),
);
const repo = await jiti.import(path.join(__dirname, "execution-intent-repository.ts"));
const { buildAgentExecutionIntent } = await jiti.import(
  path.join(projectRoot, "src/features/agents/execution-intent.ts"),
);
const { n8nWebhookTriggerTool } = await jiti.import(
  path.join(__dirname, "tools/n8n-webhook-trigger.ts"),
);

const {
  createAgentExecutionIntent,
  getAgentExecutionIntent,
  transitionAgentExecutionIntent,
  __clearAgentExecutionIntentsForTests,
} = repo;

function decision(outcome) {
  return {
    outcome,
    zone: outcome === "BLOCK" ? "red" : "green",
    executionTier: outcome === "BLOCK" ? "red" : "green",
    agentId: "hermes",
    actionId: "task.create",
    reasonCode: "allowed_by_policy",
    reason: outcome === "BLOCK" ? "hard blocked" : "eligible",
    requiresLedger: true,
    requiresSentinel: true,
    requiresHumanApproval: false,
  };
}

function spyDeps(order, { evalOutcome = "ALLOW", dispatchResult } = {}) {
  return {
    evaluate: () => {
      order.push("evaluate");
      return decision(evalOutcome);
    },
    markExecuting: async () => void order.push("markExecuting"),
    recordAttempt: async () => void order.push("recordAttempt"),
    dispatch: async () => {
      order.push("dispatch");
      return dispatchResult ?? { ok: true, actionRef: "ref1", output: { received: true } };
    },
    recordResult: async (_ok, phase) => void order.push(`recordResult:${phase}`),
    markExecuted: async (ref) => void order.push(`markExecuted:${ref}`),
    markFailed: async (code) => void order.push(`markFailed:${code}`),
    revertToPending: async () => void order.push("revertToPending"),
  };
}

describe("approveAndDispatchExecutionIntent (orchestration)", () => {
  test("ALLOW: ledger attempt BEFORE dispatch, result after, then executed", async () => {
    const order = [];
    const res = await approveAndDispatchExecutionIntent(spyDeps(order));

    assert.equal(res.ok, true);
    assert.equal(res.status, "executed");
    assert.equal(res.actionRef, "ref1");

    const attemptIdx = order.indexOf("recordAttempt");
    const dispatchIdx = order.indexOf("dispatch");
    const resultIdx = order.indexOf("recordResult:success");
    assert.ok(attemptIdx >= 0 && dispatchIdx >= 0 && resultIdx >= 0);
    assert.ok(attemptIdx < dispatchIdx, "attempt ledger BEFORE dispatch");
    assert.ok(resultIdx > dispatchIdx, "result ledger AFTER dispatch");
    assert.ok(order.includes("markExecuted:ref1"));
  });

  test("BLOCK: never dispatches, marks failed, returns 403", async () => {
    const order = [];
    const res = await approveAndDispatchExecutionIntent(spyDeps(order, { evalOutcome: "BLOCK" }));

    assert.equal(res.ok, false);
    assert.equal(res.status, "blocked");
    assert.equal(res.httpStatus, 403);
    assert.equal(order.includes("dispatch"), false, "no dispatch on BLOCK");
    assert.ok(order.includes("recordResult:blocked"));
    assert.ok(order.includes("markFailed:SENTINELLE_BLOCK"));
  });

  test("rate-limited: reverts to pending (retryable), returns 429", async () => {
    const order = [];
    const res = await approveAndDispatchExecutionIntent(
      spyDeps(order, { dispatchResult: { ok: false, rateLimited: true, error: "rl" } }),
    );
    assert.equal(res.ok, false);
    assert.equal(res.status, "pending");
    assert.equal(res.httpStatus, 429);
    assert.ok(order.includes("recordResult:rate_limited"));
    assert.ok(order.includes("revertToPending"));
    assert.equal(order.some((s) => s.startsWith("markExecuted")), false);
  });

  test("dispatch failure: marks failed, returns 502", async () => {
    const order = [];
    const res = await approveAndDispatchExecutionIntent(
      spyDeps(order, { dispatchResult: { ok: false, error: "boom" } }),
    );
    assert.equal(res.ok, false);
    assert.equal(res.status, "failed");
    assert.equal(res.httpStatus, 502);
    assert.ok(order.includes("markFailed:DISPATCH_FAILED"));
  });
});

describe("approval wired to the real repo + real n8n tool (fetch mocked)", () => {
  const ORIGINAL_ENV = process.env;

  function makeIntent() {
    return buildAgentExecutionIntent({
      intentId: "intent-1",
      workspaceId: "ws1",
      agentId: "hermes",
      skillId: "task.create",
      toolName: "n8n_webhook_trigger",
      autonomyLevel: 2,
      payload: {
        agentId: "hermes",
        skillId: "task.create",
        client: "Acme",
        email: "a@b.com",
        actionType: "send_email",
        missionId: "m1",
        data: {},
      },
      createdAt: "2026-06-10T00:00:00.000Z",
    });
  }

  function makeFetch(response) {
    const calls = [];
    const fn = async (url, init) => {
      calls.push({ url, init });
      return response;
    };
    fn.calls = calls;
    return fn;
  }

  test("end-to-end: pending -> executed, fetch called once, ledger ordered", async () => {
    __clearAgentExecutionIntentsForTests();
    process.env = {
      ...ORIGINAL_ENV,
      AGENT_WEBHOOK_SIGNING_SECRET: "k",
      N8N_SECRET: "s",
      N8N_WEBHOOK_URL: "https://hooks.n8n.cloud/webhook/x",
    };
    delete process.env.NODE_ENV;

    await createAgentExecutionIntent("ws1", "user", makeIntent());
    const intent = await getAgentExecutionIntent("ws1", "intent-1");

    const ledger = [];
    const fetchImpl = makeFetch({ ok: true, status: 200, json: async () => ({ ok: true }) });

    const res = await approveAndDispatchExecutionIntent({
      evaluate: () => decision("ALLOW"),
      markExecuting: () =>
        transitionAgentExecutionIntent("ws1", "intent-1", { toStatus: "executing", updatedAt: "t1" }),
      recordAttempt: async () => void ledger.push("attempt"),
      dispatch: () =>
        n8nWebhookTriggerTool.handler(intent.payload, {
          workspaceId: "ws1",
          deps: { fetchImpl, isAllowed: async () => true, now: () => 1 },
        }),
      recordResult: async (_ok, phase) => void ledger.push(`result:${phase}`),
      markExecuted: (ref) =>
        transitionAgentExecutionIntent("ws1", "intent-1", {
          toStatus: "executed",
          updatedAt: "t2",
          actionRef: ref,
        }),
      markFailed: (code) =>
        transitionAgentExecutionIntent("ws1", "intent-1", {
          toStatus: "failed",
          updatedAt: "t3",
          failureCode: code,
        }),
      revertToPending: () =>
        transitionAgentExecutionIntent("ws1", "intent-1", { toStatus: "pending", updatedAt: "t4" }),
    });

    assert.equal(res.ok, true);
    assert.equal(fetchImpl.calls.length, 1);
    assert.deepEqual(ledger, ["attempt", "result:success"]);

    const after = await getAgentExecutionIntent("ws1", "intent-1");
    assert.equal(after.status, "executed");
    assert.ok(after.actionRef);

    process.env = ORIGINAL_ENV;
    __clearAgentExecutionIntentsForTests();
  });

  test("end-to-end BLOCK: no fetch, intent ends failed", async () => {
    __clearAgentExecutionIntentsForTests();
    process.env = {
      ...ORIGINAL_ENV,
      AGENT_WEBHOOK_SIGNING_SECRET: "k",
      N8N_SECRET: "s",
      N8N_WEBHOOK_URL: "https://hooks.n8n.cloud/webhook/x",
    };

    await createAgentExecutionIntent("ws1", "user", makeIntent());
    const intent = await getAgentExecutionIntent("ws1", "intent-1");

    const fetchImpl = makeFetch({ ok: true, status: 200, json: async () => ({}) });
    const ledger = [];

    const res = await approveAndDispatchExecutionIntent({
      evaluate: () => decision("BLOCK"),
      markExecuting: () =>
        transitionAgentExecutionIntent("ws1", "intent-1", { toStatus: "executing", updatedAt: "t1" }),
      recordAttempt: async () => void ledger.push("attempt"),
      dispatch: () =>
        n8nWebhookTriggerTool.handler(intent.payload, {
          workspaceId: "ws1",
          deps: { fetchImpl, isAllowed: async () => true },
        }),
      recordResult: async (_ok, phase) => void ledger.push(`result:${phase}`),
      markExecuted: () => Promise.resolve(),
      markFailed: (code) =>
        transitionAgentExecutionIntent("ws1", "intent-1", {
          toStatus: "failed",
          updatedAt: "t2",
          failureCode: code,
        }),
      revertToPending: () => Promise.resolve(),
    });

    assert.equal(res.ok, false);
    assert.equal(res.status, "blocked");
    assert.equal(fetchImpl.calls.length, 0, "BLOCK must not reach n8n");

    const after = await getAgentExecutionIntent("ws1", "intent-1");
    assert.equal(after.status, "failed");
    assert.deepEqual(ledger, ["result:blocked"]);

    process.env = ORIGINAL_ENV;
    __clearAgentExecutionIntentsForTests();
  });
});
