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
} = await jiti.import(routerPath);

const { PREMIUM_MODEL_ID, ECONOMY_MODEL_ID } = await jiti.import(configPath);

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
