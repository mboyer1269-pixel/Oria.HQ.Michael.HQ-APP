#!/usr/bin/env node

// src/server/ventures/venture-save-service.test.mjs
//
// PR149 — manual venture save flow. Tests the persistence wrapper that the
// owner-gated server action delegates to (auth lives in the action; this is the
// testable core). Mirrors the venture-repository test harness.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

// Force the local-fallback path deterministically: with no Supabase config the
// repository resolves a null client. serverEnv reads process.env eagerly at
// import, so these must be cleared before the module is imported below.
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const FORBIDDEN_HISTORICAL_NAMES = [
  "MCL",
  "Suivia",
  "NOORKI",
  "Dad School",
  "DADZCO",
  "MUMZCO",
  "APPAREL",
];

// Functions that must NOT exist on the save surface in PR149 (no edit/kill/
// archive/delete/promote yet).
const FORBIDDEN_ACTION_EXPORTS = [
  "deleteVenture",
  "killVenture",
  "archiveVenture",
  "editVenture",
  "promoteVenture",
  "removeVenture",
];

test("Venture save service (PR149)", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const serviceMod = await jiti.import(path.join(__dirname, "venture-save-service.ts"));
  const { saveVentureDraft, saveVentureSuggestionAsCandidate } = serviceMod;
  const { ventureSuggestionSeed } = await jiti.import(
    path.join(projectRoot, "src/features/ventures/suggestion-seed.ts"),
  );

  const repoMod = await jiti.import(path.join(__dirname, "venture-repository.ts"));
  const {
    getVentureById,
    listVenturesForWorkspace,
    getVenturePersistenceMode,
    __clearVenturesForTests,
  } = repoMod;

  let idCounter = 0;
  function makeInput(overrides = {}) {
    idCounter += 1;
    return {
      name: "Neutral Save Sample",
      description: "Carte de test neutre pour le save service.",
      targetCustomer: "Équipes ops cherchant une automatisation simple.",
      problem: "Tâches répétitives sans outil adapté.",
      offer: "Workflow léger qui automatise une étape.",
      primaryChannel: "Outreach direct après approbation CEO.",
      hypothesis: "2 équipes paieront pour gagner du temps.",
      validationWindowDays: 30,
      budgetCapCents: 0,
      firstSuccessMetric: "2 entretiens qualifiés réalisés",
      firstKillMetric: "qualified_interviews",
      firstKillThreshold: "< 2 en 30 jours",
      id: `venture-local-draft-save-${idCounter}`,
      now: "2026-05-31T00:00:00.000Z",
      ...overrides,
    };
  }

  function installSupabaseClientFactory(factory) {
    globalThis.__ventureRepositoryClientFactory = factory;
  }
  function clearSupabaseClientFactory() {
    delete globalThis.__ventureRepositoryClientFactory;
  }

  function makeSupabaseMock({ insertError = null, listData = [] } = {}) {
    const builder = {
      _selectResult: { data: listData, error: null },
      select() { return this; },
      eq() { return this; },
      order() { return this; },
      limit() { return this; },
      insert() { return Promise.resolve({ data: null, error: insertError }); },
      then(resolve) { return Promise.resolve(this._selectResult).then(resolve); },
    };
    return { from() { return builder; } };
  }

  t.beforeEach(() => {
    clearSupabaseClientFactory();
    __clearVenturesForTests();
  });
  t.afterEach(() => {
    clearSupabaseClientFactory();
    __clearVenturesForTests();
  });

  await t.test("save succeeds through the repository (local fallback)", async () => {
    const result = await saveVentureDraft({ workspaceId: "ws1", input: makeInput({ id: "venture-local-draft-save-ok" }) });
    assert.equal(result.status, "saved");
    assert.equal(result.storageMode, "local");
    assert.equal(result.card.status, "candidate");
    assert.equal(result.card.source, "human_created");

    // Actually persisted: loadable back through the repository.
    const got = await getVentureById("ws1", "venture-local-draft-save-ok");
    assert.ok(got);
    assert.equal(got.id, "venture-local-draft-save-ok");
    assert.equal((await listVenturesForWorkspace("ws1")).length, 1);
  });

  await t.test("save suggestion persists a candidate through the repository", async () => {
    const suggestion = ventureSuggestionSeed[0];
    const result = await saveVentureSuggestionAsCandidate({
      workspaceId: "ws-suggestion",
      suggestion,
      id: "venture-from-suggestion-service-ok",
      now: "2026-06-01T00:00:00.000Z",
    });

    assert.equal(result.status, "saved");
    assert.equal(result.storageMode, "local");
    assert.equal(result.card.status, "candidate");
    assert.equal(result.card.source, "agent_suggested");
    assert.equal(result.card.score, undefined);
    assert.equal(result.card.validationPlan, undefined);
    assert.equal(result.card.decisions.length, 1);
    assert.equal(result.card.decisions[0].type, "save_suggestion");
    assert.equal(result.card.decisions[0].decidedBy, "ceo");
    assert.equal(result.card.decisions[0].humanOnTheLoop, true);
    assert.equal(result.card.decisions[0].noExecutionAuthorized, true);

    const got = await getVentureById("ws-suggestion", "venture-from-suggestion-service-ok");
    assert.ok(got);
    assert.equal(got.name, suggestion.name);
    assert.equal((await listVenturesForWorkspace("ws-suggestion")).length, 1);
  });

  await t.test("save suggestion is idempotent within a workspace", async () => {
    const suggestion = ventureSuggestionSeed[0];
    const first = await saveVentureSuggestionAsCandidate({
      workspaceId: "ws-suggestion-idempotent",
      suggestion,
      id: `venture-from-suggestion-${suggestion.id}-first`,
      now: "2026-06-01T00:00:00.000Z",
    });
    const second = await saveVentureSuggestionAsCandidate({
      workspaceId: "ws-suggestion-idempotent",
      suggestion,
      id: `venture-from-suggestion-${suggestion.id}-second`,
      now: "2026-06-01T00:01:00.000Z",
    });

    assert.equal(first.status, "saved");
    assert.equal(second.status, "saved");
    assert.equal(second.card.id, first.card.id);
    assert.equal((await listVenturesForWorkspace("ws-suggestion-idempotent")).length, 1);
  });

  await t.test("save suggestion failure does not mark the card as saved", async () => {
    installSupabaseClientFactory(() => makeSupabaseMock({ insertError: new Error("secret boom") }));
    const result = await saveVentureSuggestionAsCandidate({
      workspaceId: "ws-suggestion-fail",
      suggestion: ventureSuggestionSeed[0],
      id: "venture-from-suggestion-service-fail",
      now: "2026-06-01T00:00:00.000Z",
    });

    assert.equal(result.status, "error");
    assert.ok(result.card);
    assert.equal(result.card.status, "candidate");
    clearSupabaseClientFactory();
    assert.equal(await getVentureById("ws-suggestion-fail", "venture-from-suggestion-service-fail"), null);
    assert.equal((await listVenturesForWorkspace("ws-suggestion-fail")).length, 0);
  });

  await t.test("reports supabase storage mode when Supabase is the backend", async () => {
    installSupabaseClientFactory(() => makeSupabaseMock());
    const result = await saveVentureDraft({ workspaceId: "ws-sb", input: makeInput() });
    assert.equal(result.status, "saved");
    assert.equal(result.storageMode, "supabase");
  });

  await t.test("failure path does NOT mark the card as saved", async () => {
    installSupabaseClientFactory(() => makeSupabaseMock({ insertError: new Error("secret boom") }));
    const result = await saveVentureDraft({ workspaceId: "ws-sb", input: makeInput({ id: "venture-local-draft-save-fail" }) });

    assert.equal(result.status, "error");
    assert.ok(result.card, "the unsaved card is returned so the UI can show it");
    // No leak / no silent save: nothing landed in the local store.
    clearSupabaseClientFactory();
    assert.equal(await getVentureById("ws-sb", "venture-local-draft-save-fail"), null);
    assert.equal((await listVenturesForWorkspace("ws-sb")).length, 0);
  });

  await t.test("production without persistence fails as error, not a false save", async () => {
    const prev = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      const result = await saveVentureDraft({ workspaceId: "ws1", input: makeInput() });
      assert.equal(result.status, "error");
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  await t.test("empty repository ships no canonical seed (demo-only UI is honest)", async () => {
    assert.deepEqual(await listVenturesForWorkspace("ws-empty"), []);
  });

  await t.test("no historical venture names in a saved card", async () => {
    const result = await saveVentureDraft({ workspaceId: "ws1", input: makeInput() });
    const blob = JSON.stringify(result.card);
    for (const forbidden of FORBIDDEN_HISTORICAL_NAMES) {
      assert.equal(blob.includes(forbidden), false, `saved card must not reference "${forbidden}"`);
    }
  });

  await t.test("getVenturePersistenceMode reflects the active backend", async () => {
    assert.equal(getVenturePersistenceMode(), "local");

    installSupabaseClientFactory(() => makeSupabaseMock());
    assert.equal(getVenturePersistenceMode(), "supabase");
    clearSupabaseClientFactory();

    const prev = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      assert.equal(getVenturePersistenceMode(), "unavailable");
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  await t.test("introduces no edit/kill/archive/delete/promote on the save surface", () => {
    for (const name of FORBIDDEN_ACTION_EXPORTS) {
      assert.equal(serviceMod[name], undefined, `save service must not export "${name}"`);
      assert.equal(repoMod[name], undefined, `repository must not export "${name}"`);
    }
  });
});
