#!/usr/bin/env node

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

const routerPath = path.join(projectRoot, "src/server/ai/model-router.ts");
const configPath = path.join(projectRoot, "src/server/ai/model-config.ts");

const {
  chooseModel,
  classifyDifficulty,
  clearBrainRouteLog,
  getBrainRouteLog,
  resetLadderBudget,
} = await jiti.import(routerPath);

const { PREMIUM_MODEL_ID, ECONOMY_MODEL_ID } = await jiti.import(configPath);

const FREE_MODEL = {
  id: "qwen/qwen3-coder:free",
  name: "Qwen3 Coder (free)",
  provider: "qwen",
  contextLength: 1048576,
  enabled: true,
  recommended: true,
};
const FIXED_NOW = Date.parse("2026-06-14T08:00:00.000Z");

test("strategic message routes to premium brain via keyword tier", () => {
  clearBrainRouteLog();

  const decision = chooseModel({
    message: "On doit revoir notre stratégie de pricing pour le board.",
  });

  assert.equal(decision.modelId, PREMIUM_MODEL_ID);
  assert.equal(decision.via, "keyword");
  assert.match(decision.reason, /fort impact/i);
});

test("economy mode routes to economy brain", () => {
  clearBrainRouteLog();

  const decision = chooseModel({
    message: "Reformule cette phrase simplement.",
    requestedMode: "economy",
  });

  assert.equal(decision.modelId, ECONOMY_MODEL_ID);
  assert.equal(decision.mode, "economy");
  assert.equal(decision.via, "keyword");
});

test("unavailable primary model falls back to next candidate", () => {
  clearBrainRouteLog();

  const decision = chooseModel({
    message: "Prépare le comité pour la négociation.",
    unavailableModelIds: [PREMIUM_MODEL_ID],
  });

  assert.notEqual(decision.modelId, PREMIUM_MODEL_ID);
  assert.equal(decision.modelId, "gpt-4o");
  assert.match(decision.reason, /indisponible/i);

  clearBrainRouteLog();

  const economyFallback = chooseModel({
    message: "Salut, ça va?",
    requestedMode: "economy",
    unavailableModelIds: [ECONOMY_MODEL_ID],
  });

  assert.notEqual(economyFallback.modelId, ECONOMY_MODEL_ID);
});

test("ambiguous message uses semantic fallback classifier", () => {
  clearBrainRouteLog();

  const classification = classifyDifficulty(
    "Peux-tu analyser les trade-offs entre ces deux options avant qu'on décide?",
  );
  assert.equal(classification.domain, "analytical");

  const decision = chooseModel({
    message: "Peux-tu analyser les trade-offs entre ces deux options avant qu'on décide?",
  });

  assert.equal(decision.modelId, PREMIUM_MODEL_ID);
  assert.equal(decision.via, "semantic-fallback");
});

test("recordBrainRoute writes bounded metadata to in-memory log", () => {
  clearBrainRouteLog();

  const message = "Bonjour CEO";
  chooseModel({ message });

  const log = getBrainRouteLog();
  assert.equal(log.length, 1);
  assert.equal(log[0].inputChars, message.length);
  assert.equal(log[0].model, "gpt-4o-mini");
  assert.ok(log[0].provider);
  assert.ok(log[0].routeReason);
  assert.ok(log[0].timestamp);
  assert.equal("messagePreview" in log[0], false);
});

// --- Cost Ladder (P4) -------------------------------------------------------

test("without a task class, base routing is untouched (no cost-ladder via)", () => {
  resetLadderBudget();
  const decision = chooseModel({ message: "On doit revoir notre stratégie de pricing pour le board." });
  assert.equal(decision.modelId, PREMIUM_MODEL_ID);
  assert.notEqual(decision.via, "cost-ladder");
});

test("cost ladder forces premium for client_audit, even in economy mode", () => {
  resetLadderBudget();
  const decision = chooseModel({
    message: "Reformule cette phrase simplement.",
    requestedMode: "economy",
    taskClass: "client_audit",
    agentId: "relay",
    nowMs: FIXED_NOW,
  });
  assert.equal(decision.modelId, PREMIUM_MODEL_ID);
  assert.equal(decision.via, "cost-ladder");
  assert.match(decision.reason, /premium/i);
});

test("cost ladder routes a free-eligible class to the free model, overriding keywords", () => {
  resetLadderBudget();
  const decision = chooseModel({
    message: "On doit revoir notre stratégie de pricing pour le board.", // strategic → base premium
    taskClass: "classification",
    agentId: "relay",
    freeCatalog: [FREE_MODEL],
    nowMs: FIXED_NOW,
  });
  assert.equal(decision.modelId, FREE_MODEL.id);
  assert.equal(decision.model.provider, "openrouter");
  assert.equal(decision.via, "cost-ladder");
});

test("cost ladder budget guard downgrades general to free once the budget is spent", () => {
  resetLadderBudget();
  const base = {
    message: "Prépare le comité pour la négociation.", // strategic → base premium (cost 5)
    taskClass: "general",
    agentId: "relay",
    freeCatalog: [FREE_MODEL],
    dailyBudget: 5,
    nowMs: FIXED_NOW,
  };
  const first = chooseModel(base);
  assert.equal(first.modelId, PREMIUM_MODEL_ID); // budget not yet spent

  const second = chooseModel(base); // now over budget
  assert.equal(second.modelId, FREE_MODEL.id);
  assert.equal(second.via, "cost-ladder");
});

test("budget pressure never lowers client_audit below premium", () => {
  resetLadderBudget();
  const ctx = {
    message: "Reformule.",
    taskClass: "client_audit",
    agentId: "relay",
    dailyBudget: 1,
    nowMs: FIXED_NOW,
  };
  chooseModel(ctx); // spends premium weight, exhausts the tiny budget
  const second = chooseModel(ctx);
  assert.equal(second.modelId, PREMIUM_MODEL_ID); // floor beats budget
});
