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

const ladderPath = path.join(projectRoot, "src/server/ai/cost-ladder.ts");
const {
  parseFreeModelCatalog,
  parseFreeModelCatalogText,
  eligibleFreeModels,
  selectFreeModel,
  decideLadder,
  dayKeyOf,
  createInMemoryBudgetStore,
  recordLadderCost,
  getLadderCostLog,
  clearLadderCostLog,
  setLadderCostSink,
  resetLadderCostSink,
  RUNG_COST_WEIGHT,
  TASK_CLASS_TARGET,
  TASK_CLASS_HARD_FLOOR,
} = await jiti.import(ladderPath);

// One enabled+recommended model, plus a not-recommended and a disabled one.
const FREE_CATALOG = [
  {
    id: "qwen/qwen3-coder:free",
    name: "Qwen3 Coder (free)",
    provider: "qwen",
    contextLength: 1048576,
    enabled: true,
    recommended: true,
  },
  {
    id: "meta/llama-3.3-70b:free",
    name: "Llama 3.3 (free)",
    provider: "meta",
    contextLength: 131072,
    enabled: true,
    recommended: false,
  },
  {
    id: "x/disabled:free",
    name: "Disabled (free)",
    provider: "x",
    contextLength: 999999,
    enabled: false,
    recommended: true,
  },
];

test("parseFreeModelCatalog maps the config shape and tolerates junk", () => {
  const parsed = parseFreeModelCatalog({
    models: [
      { id: "a:free", name: "A", provider: "p", context_length: 100, enabled: true, recommended: true },
    ],
  });
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].id, "a:free");
  assert.equal(parsed[0].contextLength, 100);
  assert.equal(parsed[0].enabled, true);
  assert.equal(parsed[0].recommended, true);

  assert.deepEqual(parseFreeModelCatalog(null), []);
  assert.deepEqual(parseFreeModelCatalog({}), []);
  assert.deepEqual(parseFreeModelCatalog({ models: "nope" }), []);

  const skipped = parseFreeModelCatalog({ models: [null, {}, { id: "ok", enabled: true, recommended: true }] });
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0].id, "ok");
  assert.equal(skipped[0].name, "ok"); // name defaults to id
});

test("parseFreeModelCatalogText tolerates a UTF-8 BOM and bad text", () => {
  const json = JSON.stringify({
    models: [{ id: "a:free", name: "A", provider: "p", context_length: 100, enabled: true, recommended: true }],
  });
  // PowerShell-generated snapshots are prefixed with a BOM (U+FEFF).
  const withBom = String.fromCharCode(0xfeff) + json;
  const parsed = parseFreeModelCatalogText(withBom);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].id, "a:free");

  assert.deepEqual(parseFreeModelCatalogText("not json at all"), []);
  assert.deepEqual(parseFreeModelCatalogText(""), []);
});

test("eligibleFreeModels keeps only enabled+recommended, sorted by context", () => {
  const eligible = eligibleFreeModels(FREE_CATALOG);
  assert.equal(eligible.length, 1);
  assert.equal(eligible[0].id, "qwen/qwen3-coder:free");
  assert.equal(selectFreeModel(FREE_CATALOG).id, "qwen/qwen3-coder:free");
  assert.equal(selectFreeModel([]), undefined);
});

test("a cheap class targets the free rung, overriding a premium base route", () => {
  const d = decideLadder({
    taskClass: "classification",
    baseRung: "premium",
    freeCatalog: FREE_CATALOG,
    currentSpend: 0,
  });
  assert.equal(d.rung, "free");
  assert.equal(d.freeModel.id, "qwen/qwen3-coder:free");
  assert.equal(d.estimatedCost, 0);
  assert.equal(d.budgetBound, false);
});

test("client_audit is forced premium even with an exhausted budget", () => {
  const d = decideLadder({
    taskClass: "client_audit",
    baseRung: "economy",
    freeCatalog: FREE_CATALOG,
    currentSpend: 9999,
    dailyBudget: 100,
  });
  assert.equal(d.rung, "premium");
  assert.equal(d.floorBound, true);
  assert.equal(d.budgetBound, false);
  assert.equal(d.estimatedCost, 5);
  assert.match(d.reason, /premium/i);
});

test("general follows the base route, but budget pressure pulls it to free", () => {
  const under = decideLadder({
    taskClass: "general",
    baseRung: "premium",
    freeCatalog: FREE_CATALOG,
    currentSpend: 0,
    dailyBudget: 100,
  });
  assert.equal(under.rung, "premium");
  assert.equal(under.budgetBound, false);

  const over = decideLadder({
    taskClass: "general",
    baseRung: "premium",
    freeCatalog: FREE_CATALOG,
    currentSpend: 100,
    dailyBudget: 100,
  });
  assert.equal(over.rung, "free");
  assert.equal(over.budgetBound, true);
  assert.equal(over.freeModel.id, "qwen/qwen3-coder:free");
});

test("a free target with no eligible model degrades honestly to economy", () => {
  const d = decideLadder({
    taskClass: "draft",
    baseRung: "economy",
    freeCatalog: [],
    currentSpend: 0,
  });
  assert.equal(d.rung, "economy");
  assert.equal(d.freeModel, undefined);
  assert.equal(d.estimatedCost, RUNG_COST_WEIGHT.economy);
  assert.match(d.reason, /aucun modèle free/i);
});

test("task class floor maps lock the profit lever", () => {
  assert.equal(TASK_CLASS_TARGET.client_audit, "premium");
  assert.equal(TASK_CLASS_HARD_FLOOR.client_audit, "premium");
  assert.equal(TASK_CLASS_HARD_FLOOR.classification, "free");
});

test("dayKeyOf buckets by UTC day, deterministically", () => {
  assert.equal(dayKeyOf(Date.parse("2026-06-14T23:59:00.000Z")), "2026-06-14");
  assert.equal(dayKeyOf(Date.parse("2026-06-15T00:00:01.000Z")), "2026-06-15");
});

test("in-memory budget store is scoped per agent and per day", () => {
  const store = createInMemoryBudgetStore();
  assert.equal(store.spendOf("relay", "2026-06-14"), 0);
  store.add("relay", "2026-06-14", 5);
  store.add("relay", "2026-06-14", 2);
  assert.equal(store.spendOf("relay", "2026-06-14"), 7);
  assert.equal(store.spendOf("relay", "2026-06-15"), 0); // next day resets
  assert.equal(store.spendOf("scout", "2026-06-14"), 0); // other agent isolated
});

test("cost sink records bounded events and is swappable", () => {
  clearLadderCostLog();
  recordLadderCost({
    agentId: "relay",
    taskClass: "draft",
    rung: "free",
    modelId: "qwen/qwen3-coder:free",
    estimatedCost: 0,
    floorBound: false,
    budgetBound: false,
    timestamp: "2026-06-14T00:00:00.000Z",
  });
  const log = getLadderCostLog();
  assert.equal(log.length, 1);
  assert.equal(log[0].rung, "free");
  assert.equal(log[0].agentId, "relay");

  const captured = [];
  setLadderCostSink((event) => captured.push(event));
  recordLadderCost({
    agentId: "scout",
    taskClass: "client_audit",
    rung: "premium",
    modelId: "claude-sonnet-4-6",
    estimatedCost: 5,
    floorBound: true,
    budgetBound: false,
    timestamp: "2026-06-14T00:00:00.000Z",
  });
  assert.equal(captured.length, 1);
  assert.equal(captured[0].rung, "premium");
  resetLadderCostSink();
});
