#!/usr/bin/env node

// src/server/ventures/prepared-action-repository.test.mjs

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

test("Prepared action repository", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const repoMod = await jiti.import(path.join(__dirname, "prepared-action-repository.ts"));
  const featureDir = path.join(projectRoot, "src/features/ventures");
  const paMod = await jiti.import(path.join(featureDir, "prepared-action.ts"));
  const cashMod = await jiti.import(path.join(featureDir, "cash-action-packet.ts"));
  const hermesMod = await jiti.import(path.join(featureDir, "hermes-outreach-plan.ts"));

  const {
    listPreparedActionsForWorkspace,
    createPreparedAction,
    getPreparedActionPersistenceMode,
    PreparedActionRepositoryError,
    __clearPreparedActionsForTests,
  } = repoMod;
  const { buildPreparedAction } = paMod;
  const { buildCashActionPacket } = cashMod;
  const { buildHermesOutreachPlanFromCashActionPacket } = hermesMod;

  const USER = "11111111-1111-1111-1111-111111111111";

  function makeAction(overrides = {}) {
    const packet = buildCashActionPacket({
      packetId: overrides.packetId ?? "packet-001",
      ventureId: "venture-001",
      agentId: "agent-001",
      targetBuyer: "Heads of RevOps at 20-100 person B2B SaaS companies",
      buyerType: "smb",
      painHypothesis: "They reconcile pipeline by hand every Friday and lose 3 hours to it.",
      offer: "A done-for-you weekly pipeline reconciliation, delivered every Friday.",
      pricePointCents: 49_000,
      callToAction: "Reply 'pilot' to start a paid 2-week pilot this Friday.",
      outreachDraft: "Hi {name}, saw your team reconciles pipeline manually — want a Friday report?",
      expectedCashSignal: "email_reply",
      requiredEvidence: ["email_reply"],
      expectedCashImpactCents: 49_000,
      expectedCostCents: 7_000,
      createdAt: "2026-06-02T00:00:00.000Z",
    });
    const hermesPlan = buildHermesOutreachPlanFromCashActionPacket(packet);
    return buildPreparedAction({
      preparedActionId: overrides.preparedActionId ?? "packet-001_prepared",
      ventureId: packet.ventureId,
      cashActionPacketId: packet.packetId,
      packet,
      council: {
        readiness: "ready_for_ceo",
        verdictDecision: "needs_ceo_decision",
        recommendedManualAction: "CEO manually adapts and sends the outreach draft.",
      },
      hermesPlan,
      priority: overrides.priority ?? "high",
      priorityScore: overrides.priorityScore ?? 42,
      status: overrides.status ?? "ready_for_ceo_review",
      createdAt: overrides.createdAt ?? "2026-06-02T00:00:00.000Z",
    });
  }

  function installSupabaseClientFactory(factory) {
    globalThis.__preparedActionRepositoryClientFactory = factory;
  }
  function clearSupabaseClientFactory() {
    delete globalThis.__preparedActionRepositoryClientFactory;
  }

  function makeSupabaseMock({ insertError = null, listData = [], listError = null, onInsert } = {}) {
    const builder = {
      _selectResult: { data: listData, error: listError },
      select() { return this; },
      eq() { return this; },
      order() { return this; },
      limit() { return this; },
      insert(row) {
        if (onInsert) onInsert(row);
        return Promise.resolve({ data: null, error: insertError });
      },
      then(resolve) {
        return Promise.resolve(this._selectResult).then(resolve);
      },
    };
    return { from() { return builder; }, __builder: builder };
  }

  t.beforeEach(() => {
    clearSupabaseClientFactory();
    __clearPreparedActionsForTests();
  });
  t.afterEach(() => {
    clearSupabaseClientFactory();
    __clearPreparedActionsForTests();
  });

  // -------------------------------------------------------------------------
  // Local-fallback path
  // -------------------------------------------------------------------------

  await t.test("a fresh workspace is empty", async () => {
    assert.deepEqual(await listPreparedActionsForWorkspace("ws1"), []);
  });

  await t.test("create then list (in-memory), most-recent first", async () => {
    await createPreparedAction("ws1", USER, makeAction({ preparedActionId: "a" }));
    await createPreparedAction("ws1", USER, makeAction({
      preparedActionId: "b",
      createdAt: "2026-06-03T00:00:00.000Z",
    }));

    const list = await listPreparedActionsForWorkspace("ws1");
    assert.equal(list.length, 2);
    assert.equal(list[0].preparedActionId, "b", "most-recent first");
  });

  await t.test("workspace isolation: no cross-workspace leakage", async () => {
    await createPreparedAction("ws1", USER, makeAction({ preparedActionId: "p1" }));
    await createPreparedAction("ws2", USER, makeAction({ preparedActionId: "p2" }));

    assert.equal((await listPreparedActionsForWorkspace("ws1")).length, 1);
    assert.equal((await listPreparedActionsForWorkspace("ws2")).length, 1);
    assert.equal((await listPreparedActionsForWorkspace("ws3")).length, 0);
  });

  await t.test("round-trips a prepared action with its bundle", async () => {
    await createPreparedAction("ws1", USER, makeAction());
    const [got] = await listPreparedActionsForWorkspace("ws1");
    assert.equal(got.preparedActionId, "packet-001_prepared");
    assert.equal(got.packet.packetId, "packet-001");
    assert.equal(got.hermesPlan.cashActionPacketId, "packet-001");
    assert.equal(got.council.readiness, "ready_for_ceo");
    assert.equal(got.requiresCeoApproval, true);
    assert.equal(got.noExecutionAuthorized, true);
  });

  await t.test("rejects a forged action that authorizes execution", async () => {
    const forged = { ...makeAction(), noExecutionAuthorized: false };
    await assert.rejects(
      () => createPreparedAction("ws1", USER, forged),
      /no_execution_authorized must be true/i,
    );
    assert.equal((await listPreparedActionsForWorkspace("ws1")).length, 0, "forged action must not persist");
  });

  await t.test("persistence mode reports local outside production", async () => {
    assert.equal(getPreparedActionPersistenceMode(), "local");
  });

  await t.test("production without Supabase or local fallback refuses to persist (loud)", async () => {
    const prev = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      await assert.rejects(() => createPreparedAction("ws1", USER, makeAction()), /unavailable/i);
      await assert.rejects(() => listPreparedActionsForWorkspace("ws1"), /unavailable/i);
      assert.equal(getPreparedActionPersistenceMode(), "unavailable");
    } finally {
      process.env.NODE_ENV = prev;
    }
    const created = await createPreparedAction("ws1", USER, makeAction());
    assert.ok(created);
  });

  // -------------------------------------------------------------------------
  // Supabase path (injected client)
  // -------------------------------------------------------------------------

  await t.test("Supabase: create inserts a snake_case row scoped by workspace + owner", async () => {
    let inserted = null;
    installSupabaseClientFactory(() => makeSupabaseMock({ onInsert: (row) => { inserted = row; } }));

    const created = await createPreparedAction("ws-sb", USER, makeAction({ preparedActionId: "pa_sb" }));
    assert.equal(created.preparedActionId, "pa_sb");
    assert.ok(inserted, "insert must be called");
    assert.equal(inserted.workspace_id, "ws-sb");
    assert.equal(inserted.created_by_user_id, USER);
    assert.equal(inserted.status, "ready_for_ceo_review");
    assert.equal(inserted.requires_ceo_approval, true);
    assert.equal(inserted.no_execution_authorized, true);
    assert.equal(inserted.id, undefined, "DB assigns the id");

    clearSupabaseClientFactory();
    assert.equal((await listPreparedActionsForWorkspace("ws-sb")).length, 0, "no in-memory leak");
  });

  await t.test("Supabase: insert error surfaces a sanitized repository error", async () => {
    installSupabaseClientFactory(() => makeSupabaseMock({ insertError: new Error("connection string secret token") }));
    await assert.rejects(
      () => createPreparedAction("ws-sb", USER, makeAction()),
      (err) =>
        err instanceof PreparedActionRepositoryError &&
        /create/i.test(err.message) &&
        !err.message.includes("secret") &&
        !err.message.includes("token"),
    );
  });

  await t.test("Supabase: list error surfaces a sanitized repository error", async () => {
    installSupabaseClientFactory(() => makeSupabaseMock({ listError: new Error("read boom") }));
    await assert.rejects(
      () => listPreparedActionsForWorkspace("ws-sb"),
      (err) => err instanceof PreparedActionRepositoryError && /list/i.test(err.message),
    );
  });
});
