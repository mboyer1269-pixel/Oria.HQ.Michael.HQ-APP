#!/usr/bin/env node

// src/server/ventures/venture-repository.test.mjs

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

test("Venture repository tests", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const repoMod = await jiti.import(path.join(__dirname, "venture-repository.ts"));
  const {
    listVenturesForWorkspace,
    getVentureById,
    createVenture,
    updateVenture,
    VentureRepositoryError,
    __clearVenturesForTests,
  } = repoMod;

  const draftMod = await jiti.import(
    path.join(projectRoot, "src/features/ventures/draft.ts"),
  );
  const { createLocalDraftVentureCard } = draftMod;

  // A neutral, non-historical card. Optional overrides let a test attach a
  // decision or an assigned agent without referencing any real venture name.
  function makeCard(overrides = {}) {
    const base = createLocalDraftVentureCard({
      name: "Neutral Persistence Sample",
      description: "Carte de test neutre pour le repository.",
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
      id: `venture-local-draft-${overrides.idSuffix ?? "a"}`,
      now: "2026-05-31T00:00:00.000Z",
    });
    const rest = { ...overrides };
    delete rest.idSuffix;
    return { ...base, ...rest };
  }

  // -------------------------------------------------------------------------
  // Supabase client mock + factory injection (mirrors governance-decision repo)
  // -------------------------------------------------------------------------

  function installSupabaseClientFactory(factory) {
    globalThis.__ventureRepositoryClientFactory = factory;
  }
  function clearSupabaseClientFactory() {
    delete globalThis.__ventureRepositoryClientFactory;
  }

  // A minimal chainable, thenable query builder. select/eq/order/limit return
  // `this`. insert returns a promise. update marks the op so awaiting the
  // builder resolves to the update result. Otherwise awaiting resolves to the
  // select result { data, error }.
  function makeSupabaseMock({
    insertError = null,
    updateError = null,
    listData = [],
    listError = null,
    onInsert,
    onUpdate,
  } = {}) {
    const builder = {
      _selectResult: { data: listData, error: listError },
      _isUpdate: false,
      select() { return this; },
      eq() { return this; },
      order() { return this; },
      limit() { return this; },
      insert(row) {
        if (onInsert) onInsert(row);
        return Promise.resolve({ data: null, error: insertError });
      },
      update(row) {
        if (onUpdate) onUpdate(row);
        this._isUpdate = true;
        return this;
      },
      then(resolve) {
        const result = this._isUpdate
          ? { data: null, error: updateError }
          : this._selectResult;
        return Promise.resolve(result).then(resolve);
      },
    };
    return { from() { return builder; }, __builder: builder };
  }

  t.beforeEach(() => {
    clearSupabaseClientFactory();
    __clearVenturesForTests();
  });
  t.afterEach(() => {
    clearSupabaseClientFactory();
    __clearVenturesForTests();
  });

  // -------------------------------------------------------------------------
  // Local-fallback path (no Supabase client)
  // -------------------------------------------------------------------------

  await t.test("ships no canonical seed: a fresh workspace is empty", async () => {
    assert.deepEqual(await listVenturesForWorkspace("ws1"), []);
  });

  await t.test("create then get/list (in-memory)", async () => {
    const card = makeCard({ idSuffix: "1" });
    const created = await createVenture("ws1", card);
    assert.equal(created.id, card.id);
    assert.notEqual(created, card, "returns a mapped copy, not the same reference");

    const got = await getVentureById("ws1", card.id);
    assert.ok(got);
    assert.equal(got.id, card.id);

    const list = await listVenturesForWorkspace("ws1");
    assert.equal(list.length, 1);
    assert.equal(list[0].id, card.id);
  });

  await t.test("update replaces an existing venture (in-memory)", async () => {
    const card = makeCard({ idSuffix: "1" });
    await createVenture("ws1", card);

    const updated = await updateVenture("ws1", {
      ...card,
      status: "scored",
      updatedAt: "2026-06-01T00:00:00.000Z",
    });
    assert.equal(updated.status, "scored");

    const got = await getVentureById("ws1", card.id);
    assert.equal(got.status, "scored");
    assert.equal((await listVenturesForWorkspace("ws1")).length, 1, "update does not duplicate");
  });

  await t.test("update of an unknown id fails loudly (in-memory)", async () => {
    await assert.rejects(
      () => updateVenture("ws1", makeCard({ idSuffix: "missing" })),
      (err) => err instanceof VentureRepositoryError && /update/i.test(err.message),
    );
  });

  await t.test("workspace isolation: no cross-workspace leakage", async () => {
    await createVenture("ws1", makeCard({ idSuffix: "1" }));
    await createVenture("ws2", makeCard({ idSuffix: "2" }));

    assert.equal((await listVenturesForWorkspace("ws1")).length, 1);
    assert.equal((await listVenturesForWorkspace("ws2")).length, 1);
    assert.equal((await listVenturesForWorkspace("ws3")).length, 0);

    // A venture is never readable from another workspace.
    assert.equal(await getVentureById("ws2", "venture-local-draft-1"), null);
    assert.equal(await getVentureById("ws1", "venture-local-draft-2"), null);
  });

  await t.test("update cannot reach across workspaces", async () => {
    await createVenture("ws1", makeCard({ idSuffix: "1" }));
    // Same id, different workspace → must not find/update the ws1 row.
    await assert.rejects(
      () => updateVenture("ws2", makeCard({ idSuffix: "1" })),
      (err) => err instanceof VentureRepositoryError && /update/i.test(err.message),
    );
    // Original ws1 row is untouched.
    const got = await getVentureById("ws1", "venture-local-draft-1");
    assert.ok(got);
    assert.equal(got.status, "candidate");
  });

  await t.test("status and source are preserved through a round-trip", async () => {
    const card = makeCard({ idSuffix: "1", status: "shortlisted", source: "agent_suggested" });
    await createVenture("ws1", card);
    const got = await getVentureById("ws1", card.id);
    assert.equal(got.status, "shortlisted");
    assert.equal(got.source, "agent_suggested");
  });

  await t.test("autonomy profile is preserved (risky domains stay approval-gated)", async () => {
    const card = makeCard({ idSuffix: "1" });
    await createVenture("ws1", card);
    const got = await getVentureById("ws1", card.id);

    assert.ok(Array.isArray(got.autonomyProfile.rules));
    assert.equal(got.autonomyProfile.rules.length, card.autonomyProfile.rules.length);
    for (const domain of ["spending", "dataMutation", "legalCommitment"]) {
      const rule = got.autonomyProfile.rules.find((r) => r.domain === domain);
      assert.ok(rule, `expected a rule for risky domain "${domain}"`);
      assert.equal(rule.requiresApproval, true, `risky domain "${domain}" must require approval`);
    }
  });

  await t.test("decisions are preserved through a round-trip", async () => {
    const card = makeCard({
      idSuffix: "1",
      decisions: [
        {
          id: "decision-sample-promote",
          type: "promote",
          summary: "CEO approuve le passage en validation contrôlée.",
          decidedBy: "ceo",
          decidedAt: "2026-05-31T00:00:00.000Z",
          noExecutionAuthorized: true,
          humanOnTheLoop: true,
        },
      ],
    });
    await createVenture("ws1", card);
    const got = await getVentureById("ws1", card.id);
    assert.equal(got.decisions.length, 1);
    assert.equal(got.decisions[0].type, "promote");
    assert.equal(got.decisions[0].noExecutionAuthorized, true);
    assert.equal(got.decisions[0].humanOnTheLoop, true);
  });

  await t.test("no historical venture names appear in a stored card", async () => {
    const card = makeCard({ idSuffix: "1" });
    await createVenture("ws1", card);
    const got = await getVentureById("ws1", card.id);
    const blob = JSON.stringify(got);
    for (const forbidden of FORBIDDEN_HISTORICAL_NAMES) {
      assert.equal(blob.includes(forbidden), false, `stored card must not reference "${forbidden}"`);
    }
  });

  await t.test("production without Supabase or local fallback refuses to persist (loud)", async () => {
    const card = makeCard({ idSuffix: "1" });
    const prevNodeEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      await assert.rejects(() => createVenture("ws1", card), /unavailable/i);
      await assert.rejects(() => listVenturesForWorkspace("ws1"), /unavailable/i);
      await assert.rejects(() => getVentureById("ws1", card.id), /unavailable/i);
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
    }
    // Back in non-production, persistence works again.
    const created = await createVenture("ws1", card);
    assert.equal(created.id, card.id);
  });

  // -------------------------------------------------------------------------
  // Supabase path (injected client)
  // -------------------------------------------------------------------------

  await t.test("Supabase: create inserts a snake_case row scoped by workspace", async () => {
    let inserted = null;
    installSupabaseClientFactory(() =>
      makeSupabaseMock({ onInsert: (row) => { inserted = row; } }),
    );

    const card = makeCard({ idSuffix: "sb1", status: "candidate", source: "human_created" });
    const created = await createVenture("ws-sb", card);

    assert.equal(created.id, card.id);
    assert.ok(inserted, "insert must be called on the Supabase client");
    assert.equal(inserted.workspace_id, "ws-sb");
    assert.equal(inserted.status, "candidate");
    assert.equal(inserted.source, "human_created");
    assert.equal(inserted.target_customer, card.targetCustomer);
    assert.ok(Array.isArray(inserted.assigned_agents));
    assert.ok(Array.isArray(inserted.decisions));

    // No in-memory leak when Supabase is the backend.
    clearSupabaseClientFactory();
    assert.equal((await listVenturesForWorkspace("ws-sb")).length, 0);
  });

  await t.test("Supabase: list maps rows back to cards, scoped by workspace", async () => {
    const row = {
      id: "venture-local-draft-sb1",
      workspace_id: "ws-sb",
      name: "Neutral Persistence Sample",
      description: "desc",
      source: "human_created",
      status: "candidate",
      target_customer: "tc",
      problem: "p",
      offer: "o",
      primary_channel: "pc",
      score: null,
      validation_plan: null,
      autonomy_profile: { rules: [{ domain: "spending", requiresApproval: true, riskTier: "forbidden" }] },
      assigned_agents: [],
      decisions: [],
      created_at: "2026-05-31T00:00:00.000Z",
      updated_at: "2026-05-31T00:00:00.000Z",
    };
    installSupabaseClientFactory(() => makeSupabaseMock({ listData: [row] }));

    const list = await listVenturesForWorkspace("ws-sb");
    assert.equal(list.length, 1);
    assert.equal(list[0].id, "venture-local-draft-sb1");
    assert.equal(list[0].status, "candidate");
    assert.equal(list[0].score, undefined, "null score maps to absent score");
  });

  await t.test("Supabase: insert error surfaces a sanitized repository error", async () => {
    const leaky = new Error("connection string secret token");
    installSupabaseClientFactory(() => makeSupabaseMock({ insertError: leaky }));

    await assert.rejects(
      () => createVenture("ws-sb", makeCard({ idSuffix: "sb1" })),
      (err) =>
        err instanceof VentureRepositoryError &&
        /create/i.test(err.message) &&
        !err.message.includes("secret") &&
        !err.message.includes("token"),
    );
  });

  await t.test("Supabase: list error surfaces a sanitized repository error", async () => {
    installSupabaseClientFactory(() => makeSupabaseMock({ listError: new Error("read boom") }));
    await assert.rejects(
      () => listVenturesForWorkspace("ws-sb"),
      (err) => err instanceof VentureRepositoryError && /list/i.test(err.message),
    );
  });

  await t.test("Supabase: update issues a scoped update", async () => {
    let updatedRow = null;
    installSupabaseClientFactory(() =>
      makeSupabaseMock({ onUpdate: (row) => { updatedRow = row; } }),
    );
    const updated = await updateVenture("ws-sb", makeCard({ idSuffix: "sb1", status: "scored" }));
    assert.equal(updated.status, "scored");
    assert.ok(updatedRow);
    assert.equal(updatedRow.workspace_id, "ws-sb");
    assert.equal(updatedRow.status, "scored");
  });
});
