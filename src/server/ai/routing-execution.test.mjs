#!/usr/bin/env node
// Contract tests for selection vs execution.
// Fixtures prove the routing contract. They do not perform a real provider call.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});

const { chooseModel, resetLadderBudget } = await jiti.import(
  path.join(projectRoot, "src/server/ai/model-router.ts"),
);
const { createInMemoryBudgetStore } = await jiti.import(
  path.join(projectRoot, "src/server/ai/cost-ladder.ts"),
);
const { clearCallAccountingLog, getCallAccountingLog, reservationNotImplemented, DURABLE_BUDGET_IMPLEMENTED } =
  await jiti.import(path.join(projectRoot, "src/server/ai/call-accounting.ts"));
const { generateStructuredJson } = await jiti.import(
  path.join(projectRoot, "src/server/ai/llm-json-provider.ts"),
);
const { PREMIUM_MODEL_ID, ECONOMY_MODEL_ID, LONG_CONTEXT_MODEL_ID } = await jiti.import(
  path.join(projectRoot, "src/server/ai/model-config.ts"),
);

const FIXED_NOW = Date.parse("2026-06-14T08:00:00.000Z");
const FREE_MODEL = {
  id: "qwen/qwen3-coder:free",
  name: "Qwen3 Coder (free)",
  provider: "qwen",
  contextLength: 1048576,
  enabled: true,
  recommended: true,
};

function anthropicOk(json, usage) {
  return async (_url, init) => ({
    ok: true,
    status: 200,
    json: async () => ({
      content: [{ type: "text", text: JSON.stringify(json) }],
      ...(usage ? { usage } : {}),
    }),
    body: init?.body,
  });
}

test("selection records an estimate and does not debit the budget store", () => {
  resetLadderBudget();
  clearCallAccountingLog();
  const store = createInMemoryBudgetStore();
  store.add("relay", "2026-06-14", 5);
  const before = store.spendOf("relay", "2026-06-14");

  const decision = chooseModel({
    message: "Prépare le comité pour la négociation.",
    taskClass: "general",
    agentId: "relay",
    budgetStore: store,
    nowMs: FIXED_NOW,
    workspaceId: "ws-a",
  });

  assert.equal(store.spendOf("relay", "2026-06-14"), before);
  assert.equal(decision.modelId, PREMIUM_MODEL_ID);
  assert.equal(decision.accountingEffect, "none");
  assert.equal(decision.estimate.kind, "estimation");
  assert.equal(decision.estimate.relativeWeight, 5);
  assert.equal(decision.estimate.monetaryUsd, null);
  assert.notEqual(decision.estimate.relativeWeight, decision.estimate.monetaryUsd);
  store.add("relay", "2026-06-14", 95);
  const downgraded = chooseModel({
    message: "Prépare le comité pour la négociation.",
    taskClass: "general",
    agentId: "relay",
    budgetStore: store,
    freeCatalog: [FREE_MODEL],
    dailyBudget: 100,
    nowMs: FIXED_NOW,
    workspaceId: "ws-a",
  });
  assert.equal(store.spendOf("relay", "2026-06-14"), 100);
  assert.equal(downgraded.modelId, FREE_MODEL.id);
  assert.equal(downgraded.execution, "refused");
  const events = getCallAccountingLog("ws-a");
  assert.equal(events.length, 2);
  assert.equal(events.every((event) => event.kind === "estimation"), true);
  assert.equal(events.every((event) => event.monetaryUsd === null), true);
  assert.equal(events.every((event) => event.networkRequestSent === false), true);
});

test("an unavailable free model is not rewritten as a paid model or as zero dollars", () => {
  resetLadderBudget();
  const decision = chooseModel({
    message: "classe ce libellé",
    taskClass: "classification",
    agentId: "relay",
    freeCatalog: [FREE_MODEL],
    unavailableModelIds: [FREE_MODEL.id],
    nowMs: FIXED_NOW,
    workspaceId: "ws-a",
  });
  assert.equal(decision.modelId, FREE_MODEL.id);
  assert.equal(decision.execution, "refused");
  assert.notEqual(decision.modelId, ECONOMY_MODEL_ID);
  assert.equal(decision.estimate.relativeWeight, 0);
  assert.equal(decision.estimate.monetaryUsd, null);
  assert.equal(decision.estimate.unit, "relative_weight_not_dollars");
  assert.doesNotMatch(decision.reason, /zéro coût/i);
  assert.match(decision.reason, /aucune substitution payante/i);
});

test("long-context Gemini is kept and refused instead of becoming gpt-4o-mini", () => {
  resetLadderBudget();
  const decision = chooseModel({
    message: "Résume ce document du vault.",
    taskClass: "general",
    agentId: "joris",
    nowMs: FIXED_NOW,
  });
  assert.equal(decision.modelId, LONG_CONTEXT_MODEL_ID);
  assert.equal(decision.execution, "refused");
  assert.notEqual(decision.modelId, ECONOMY_MODEL_ID);
  assert.match(decision.refusalReason, /refus/i);
});

test("refusal of an unsupported model sends zero network requests", async () => {
  let calls = 0;
  const fetchFn = async () => {
    calls += 1;
    throw new Error("network must not be used");
  };
  process.env.ANTHROPIC_API_KEY = "synthetic";
  process.env.OPENAI_API_KEY = "synthetic";
  const result = await generateStructuredJson({
    providerPreference: "auto",
    modelId: LONG_CONTEXT_MODEL_ID,
    workspaceId: "ws-a",
    systemPrompt: "sys",
    userPrompt: "user",
    fetchFns: { anthropic: fetchFn, openai: fetchFn },
  });
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  assert.equal(calls, 0);
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "model_unsupported");
  assert.equal(result.executedModelId, null);
  assert.equal(result.cost.kind, "refused");
  assert.equal(result.cost.networkRequestSent, false);
  assert.equal(result.cost.monetaryUsd, null);
  assert.match(result.fallbackReason, /n'est pas opérationnel|sans substitution/i);
});

test("a local or subscription id is refused and not described as operational", async () => {
  let calls = 0;
  const result = await generateStructuredJson({
    providerPreference: "auto",
    modelId: "local-subscription-runtime",
    systemPrompt: "sys",
    userPrompt: "user",
    fetchFns: {
      anthropic: async () => {
        calls += 1;
        throw new Error("network");
      },
      openai: async () => {
        calls += 1;
        throw new Error("network");
      },
    },
  });
  assert.equal(calls, 0);
  assert.equal(result.ok, false);
  assert.match(result.fallbackReason, /Aucun abonnement ni modèle local n'est opérationnel/);
});

test("implicit paid fallback is blocked, and a second workspace cannot reuse another workspace's authorization", async () => {
  process.env.ANTHROPIC_API_KEY = "synthetic";
  process.env.OPENAI_API_KEY = "synthetic";
  let openaiCalls = 0;
  const fetchFns = {
    anthropic: async () => ({ ok: false, status: 503, json: async () => ({}) }),
    openai: async () => {
      openaiCalls += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: JSON.stringify({ reply: "x" }) } }] }),
      };
    },
  };
  const blocked = await generateStructuredJson({
    providerPreference: "auto",
    workspaceId: "ws-b",
    paidFallback: { authorized: true, workspaceId: "ws-a" },
    systemPrompt: "sys",
    userPrompt: "user",
    fetchFns,
  });
  assert.equal(blocked.ok, false);
  assert.equal(openaiCalls, 0);
  assert.equal(blocked.cost.kind, "failed_maybe_billed");
  assert.equal(blocked.cost.monetaryUsd, null);

  const allowed = await generateStructuredJson({
    providerPreference: "auto",
    workspaceId: "ws-a",
    paidFallback: { authorized: true, workspaceId: "ws-a" },
    systemPrompt: "sys",
    userPrompt: "user",
    fetchFns,
  });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.fallbackUsed, true);
  assert.equal(allowed.providerUsed, "openai");
  assert.equal(openaiCalls, 1);
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
});

test("workspace journals do not share selection events", () => {
  clearCallAccountingLog();
  chooseModel({
    message: "Salut",
    requestedMode: "economy",
    workspaceId: "ws-a",
    agentId: "a",
  });
  chooseModel({
    message: "Salut",
    requestedMode: "economy",
    workspaceId: "ws-b",
    agentId: "b",
  });
  const a = getCallAccountingLog("ws-a");
  const b = getCallAccountingLog("ws-b");
  assert.equal(a.length, 1);
  assert.equal(b.length, 1);
  assert.equal(a[0].workspaceId, "ws-a");
  assert.equal(b[0].workspaceId, "ws-b");
  assert.equal(a[0].agentId, "a");
  assert.notEqual(a[0].agentId, b[0].agentId);
});

test("unknown monetary cost is distinct from zero after a completed call without usage", async () => {
  process.env.ANTHROPIC_API_KEY = "synthetic";
  delete process.env.OPENAI_API_KEY;
  const result = await generateStructuredJson({
    providerPreference: "anthropic",
    modelId: PREMIUM_MODEL_ID,
    systemPrompt: "sys",
    userPrompt: "user",
    fetchFns: { anthropic: anthropicOk({ reply: "ok" }) },
  });
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal(result.ok, true);
  assert.equal(result.cost.kind, "unknown_cost");
  assert.equal(result.cost.monetaryUsd, null);
  assert.notEqual(result.cost.monetaryUsd, 0);
  assert.equal(result.cost.networkRequestSent, true);
});

test("observed usage keeps token counts and a null monetary amount", async () => {
  process.env.ANTHROPIC_API_KEY = "synthetic";
  const result = await generateStructuredJson({
    providerPreference: "anthropic",
    modelId: PREMIUM_MODEL_ID,
    systemPrompt: "sys",
    userPrompt: "user",
    fetchFns: {
      anthropic: anthropicOk({ reply: "ok" }, { input_tokens: 11, output_tokens: 7 }),
    },
  });
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal(result.ok, true);
  assert.equal(result.cost.kind, "observed_usage");
  assert.equal(result.cost.inputTokens, 11);
  assert.equal(result.cost.outputTokens, 7);
  assert.equal(result.cost.monetaryUsd, null);
  assert.notEqual(result.cost.monetaryUsd, 0);
});

test("the executed model id is the id placed in the request, not the client default", async () => {
  process.env.ANTHROPIC_API_KEY = "synthetic";
  let sentModel = null;
  const result = await generateStructuredJson({
    providerPreference: "auto",
    modelId: PREMIUM_MODEL_ID,
    workspaceId: "ws-a",
    systemPrompt: "sys",
    userPrompt: "user",
    fetchFns: {
      anthropic: async (_url, init) => {
        sentModel = JSON.parse(init.body).model;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            content: [{ type: "text", text: JSON.stringify({ reply: "ok" }) }],
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
        };
      },
      openai: async () => {
        throw new Error("openai must not be called for a chosen Anthropic model");
      },
    },
  });
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal(result.ok, true);
  assert.equal(sentModel, PREMIUM_MODEL_ID);
  assert.equal(result.modelId, PREMIUM_MODEL_ID);
  assert.equal(result.executedModelId, PREMIUM_MODEL_ID);
  assert.notEqual(result.executedModelId, "claude-haiku-4-5-20251001");
  assert.equal(result.fallbackUsed, false);
});

test("reservation is not implemented and the durable budget is not claimed", () => {
  const reservation = reservationNotImplemented("ws-a");
  assert.equal(reservation.implemented, false);
  assert.equal(reservation.effect, "none");
  assert.equal(reservation.monetaryUsd, null);
  assert.equal(DURABLE_BUDGET_IMPLEMENTED, false);
});

test("an economy selection stays on gpt-4o-mini and can be executed as that id", async () => {
  const decision = chooseModel({
    message: "Reformule cette phrase simplement.",
    requestedMode: "economy",
    taskClass: "general",
    agentId: "joris",
    nowMs: FIXED_NOW,
    workspaceId: "ws-b",
  });
  assert.equal(decision.chosenModelId, ECONOMY_MODEL_ID);
  assert.equal(decision.execution, "callable");
  assert.equal(decision.executedModelId, null);

  process.env.OPENAI_API_KEY = "synthetic";
  delete process.env.ANTHROPIC_API_KEY;
  let sent = null;
  let anthropicCalls = 0;
  const result = await generateStructuredJson({
    providerPreference: "auto",
    modelId: decision.chosenModelId,
    workspaceId: "ws-b",
    systemPrompt: "sys",
    userPrompt: "user",
    fetchFns: {
      anthropic: async () => {
        anthropicCalls += 1;
        throw new Error("anthropic must not run for gpt-4o-mini");
      },
      openai: async (_url, init) => {
        sent = JSON.parse(init.body).model;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { content: JSON.stringify({ reply: "ok" }) } }],
            usage: { prompt_tokens: 3, completion_tokens: 4 },
          }),
        };
      },
    },
  });
  delete process.env.OPENAI_API_KEY;
  assert.equal(anthropicCalls, 0);
  assert.equal(sent, ECONOMY_MODEL_ID);
  assert.equal(result.executedModelId, ECONOMY_MODEL_ID);
  assert.equal(result.providerUsed, "openai");
});
