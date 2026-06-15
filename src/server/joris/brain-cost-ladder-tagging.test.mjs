#!/usr/bin/env node

// Cost Ladder shadow tagging (Option A) — brain side. Proves that intent → task
// class tagging makes the ladder's decision OBSERVABLE (`via: "cost-ladder"`)
// without changing the provider actually called: high-value judgment intents
// stay premium and non-degradable, non-critical intents defer to the base
// router, structured intents stay deterministic, the conversational rails are
// untouched, and no network call is made (the LLM seam is injected). The ladder
// stays display_only — nothing here dispatches a model or forces a free model.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

process.env.NODE_ENV = "development";

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});

const { runJorisCommand, taskClassForIntent } = await jiti.import(
  path.join(projectRoot, "src/server/joris/brain.ts"),
);
const { chooseModel, resetLadderBudget } = await jiti.import(
  path.join(projectRoot, "src/server/ai/model-router.ts"),
);
const { PREMIUM_MODEL_ID, ECONOMY_MODEL_ID } = await jiti.import(
  path.join(projectRoot, "src/server/ai/model-config.ts"),
);

const FIXED_NOW = Date.parse("2026-06-14T08:00:00.000Z");

test("intent → task class map: high-value judgment intents are premium-mandatory", () => {
  // client_audit is the only premium-floor class — never downgraded.
  assert.equal(taskClassForIntent("board.consult"), "client_audit");
  assert.equal(taskClassForIntent("opportunity.score"), "client_audit");
});

test("intent → task class map: non-critical intents get the conservative `general` class", () => {
  for (const intent of [
    "chat",
    "calendar.book",
    "calendar.remind",
    "brief.generate",
    "memory.capture",
    "task.create",
    "mission.plan",
    "mission.draft",
    "governance.audit",
  ]) {
    assert.equal(taskClassForIntent(intent), "general", `${intent} must map to general`);
  }
});

test("board.consult's mapped class forces premium via the ladder, even in economy mode (non-degradable)", () => {
  resetLadderBudget();
  // Economy is explicitly requested and the base message would route economy;
  // the client_audit floor must still win and the decision must be ladder-governed.
  const decision = chooseModel({
    message: "Reformule cette phrase simplement.",
    requestedMode: "economy",
    taskClass: taskClassForIntent("board.consult"),
    agentId: "joris",
    nowMs: FIXED_NOW,
  });
  assert.equal(decision.modelId, PREMIUM_MODEL_ID);
  assert.equal(decision.via, "cost-ladder");
});

test("a non-critical intent defers to the base router but the ladder is observable", () => {
  resetLadderBudget();
  const decision = chooseModel({
    message: "Salut, ça va?", // base → economy/default
    taskClass: taskClassForIntent("chat"),
    agentId: "joris",
    nowMs: FIXED_NOW,
  });
  assert.equal(decision.modelId, ECONOMY_MODEL_ID, "general defers to the base model (unchanged)");
  assert.equal(decision.via, "cost-ladder", "the ladder still produced the (observed) decision");
});

test("board.consult through the brain stays premium end-to-end (fallback path, no network)", async () => {
  resetLadderBudget();
  // The fallback path (no provider) surfaces the routed model in the result.
  // No network: the reply generator is injected and returns ok:false.
  const deps = { generateReply: async () => ({ ok: false, reason: "no provider configured" }) };

  const result = await runJorisCommand(
    "Consulte le board sur notre stratégie de pricing.",
    undefined,
    deps,
  );

  assert.equal(result.intent, "board.consult");
  assert.equal(result.generation, "fallback");
  assert.equal(result.modelId, PREMIUM_MODEL_ID);
});

test("a structured intent stays deterministic and the rails are unchanged (no LLM, no network)", async () => {
  resetLadderBudget();
  let replyCalls = 0;
  const deps = {
    generateReply: async () => {
      replyCalls += 1;
      return { ok: true, text: "SHOULD_NOT_BE_USED", modelId: "mock" };
    },
  };

  const result = await runJorisCommand("Planifie la mission lancement", undefined, deps);

  assert.equal(result.intent, "mission.plan");
  assert.equal(replyCalls, 0, "structured intent must not call the LLM reply generator");
  assert.equal(result.generation, undefined, "structured intent must not be labelled LLM-generated");
});
