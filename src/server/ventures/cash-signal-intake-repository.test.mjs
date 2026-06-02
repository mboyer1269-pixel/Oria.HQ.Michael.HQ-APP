#!/usr/bin/env node

// src/server/ventures/cash-signal-intake-repository.test.mjs

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

test("Cash signal intake repository", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const repoMod = await jiti.import(path.join(__dirname, "cash-signal-intake-repository.ts"));
  const intakeMod = await jiti.import(
    path.join(projectRoot, "src/features/ventures/cash-signal-intake.ts"),
  );
  const {
    listCashSignalIntakesForWorkspace,
    createCashSignalIntake,
    getCashSignalIntakePersistenceMode,
    CashSignalIntakeRepositoryError,
    __clearCashSignalIntakesForTests,
  } = repoMod;
  const { buildCashSignalIntake } = intakeMod;

  const USER = "11111111-1111-1111-1111-111111111111";

  function makeIntake(overrides = {}) {
    return buildCashSignalIntake({
      signalId: "signal:packet-001",
      packetId: "packet-001",
      ventureId: "venture-001",
      sourceAgentId: "agent-sales",
      signalType: "stripe_charge",
      referenceId: "ch_test_001",
      isVerified: true,
      amountCents: 49_000,
      summary: "ACME paid the $490 pilot via Stripe charge ch_test_001.",
      capturedAt: "2026-06-02T00:00:00.000Z",
      ...overrides,
    });
  }

  function installSupabaseClientFactory(factory) {
    globalThis.__cashSignalIntakeRepositoryClientFactory = factory;
  }
  function clearSupabaseClientFactory() {
    delete globalThis.__cashSignalIntakeRepositoryClientFactory;
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
    __clearCashSignalIntakesForTests();
  });
  t.afterEach(() => {
    clearSupabaseClientFactory();
    __clearCashSignalIntakesForTests();
  });

  // -------------------------------------------------------------------------
  // Local-fallback path
  // -------------------------------------------------------------------------

  await t.test("a fresh workspace is empty", async () => {
    assert.deepEqual(await listCashSignalIntakesForWorkspace("ws1"), []);
  });

  await t.test("create then list (in-memory), most-recent first", async () => {
    const created = await createCashSignalIntake("ws1", USER, makeIntake({ signalId: "signal:a", referenceId: "ch_a" }));
    assert.equal(created.referenceId, "ch_a");
    assert.notEqual(created, undefined);

    await createCashSignalIntake("ws1", USER, makeIntake({
      signalId: "signal:b",
      referenceId: "ch_b",
      capturedAt: "2026-06-03T00:00:00.000Z",
    }));

    const list = await listCashSignalIntakesForWorkspace("ws1");
    assert.equal(list.length, 2);
    assert.equal(list[0].referenceId, "ch_b", "most-recent first");
  });

  await t.test("workspace isolation: no cross-workspace leakage", async () => {
    await createCashSignalIntake("ws1", USER, makeIntake({ signalId: "signal:1", referenceId: "ch_1" }));
    await createCashSignalIntake("ws2", USER, makeIntake({ signalId: "signal:2", referenceId: "ch_2" }));

    assert.equal((await listCashSignalIntakesForWorkspace("ws1")).length, 1);
    assert.equal((await listCashSignalIntakesForWorkspace("ws2")).length, 1);
    assert.equal((await listCashSignalIntakesForWorkspace("ws3")).length, 0);
  });

  await t.test("round-trips a verified financial signal with its amount", async () => {
    await createCashSignalIntake("ws1", USER, makeIntake({ signalType: "signed_loi", referenceId: "loi-1", summary: "ACME signed a 6-month LOI for the paid pilot." }));
    const [got] = await listCashSignalIntakesForWorkspace("ws1");
    assert.equal(got.signalType, "signed_loi");
    assert.equal(got.amountCents, 49_000);
    assert.equal(got.evidenceRef.kind, "signed_loi");
    assert.equal(got.evidenceRef.isVerified, true);
  });

  await t.test("round-trips a non-cash market signal without amount", async () => {
    await createCashSignalIntake("ws1", USER, makeIntake({
      signalType: "email_reply",
      referenceId: "msg-1",
      isVerified: false,
      amountCents: undefined,
      summary: "Buyer replied asking for pricing on the pilot.",
    }));
    const [got] = await listCashSignalIntakesForWorkspace("ws1");
    assert.equal(got.signalType, "email_reply");
    assert.equal("amountCents" in got, false);
  });

  await t.test("rejects fake cash: a positive amount on a non-financial signal", async () => {
    // Hand-forge an intake that bypasses the feature validator, simulating a
    // malicious caller. The mapping (and the DB CHECK) must reject it.
    const forged = {
      signalId: "signal:evil",
      packetId: "packet-001",
      ventureId: "venture-001",
      sourceAgentId: "agent-rogue",
      signalType: "manual_note",
      referenceId: "note-evil",
      isVerified: true,
      amountCents: 999_999,
      summary: "Trust me, we definitely got paid for this somehow.",
      capturedAt: "2026-06-02T00:00:00.000Z",
      evidenceRef: {
        kind: "manual_note",
        referenceId: "note-evil",
        isVerified: true,
        source: "cash-signal:agent-rogue",
        capturedAt: "2026-06-02T00:00:00.000Z",
        summary: "Trust me, we definitely got paid for this somehow.",
      },
    };
    await assert.rejects(
      () => createCashSignalIntake("ws1", USER, forged),
      /verified financial signal/i,
    );
    assert.equal((await listCashSignalIntakesForWorkspace("ws1")).length, 0, "forged cash must not persist");
  });

  await t.test("persistence mode reports local outside production", async () => {
    assert.equal(getCashSignalIntakePersistenceMode(), "local");
  });

  await t.test("production without Supabase or local fallback refuses to persist (loud)", async () => {
    const prev = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      await assert.rejects(() => createCashSignalIntake("ws1", USER, makeIntake()), /unavailable/i);
      await assert.rejects(() => listCashSignalIntakesForWorkspace("ws1"), /unavailable/i);
      assert.equal(getCashSignalIntakePersistenceMode(), "unavailable");
    } finally {
      process.env.NODE_ENV = prev;
    }
    const created = await createCashSignalIntake("ws1", USER, makeIntake());
    assert.ok(created);
  });

  // -------------------------------------------------------------------------
  // Supabase path (injected client)
  // -------------------------------------------------------------------------

  await t.test("Supabase: create inserts a snake_case row scoped by workspace + owner", async () => {
    let inserted = null;
    installSupabaseClientFactory(() => makeSupabaseMock({ onInsert: (row) => { inserted = row; } }));

    const created = await createCashSignalIntake("ws-sb", USER, makeIntake({ referenceId: "ch_sb" }));
    assert.equal(created.referenceId, "ch_sb");
    assert.ok(inserted, "insert must be called");
    assert.equal(inserted.workspace_id, "ws-sb");
    assert.equal(inserted.captured_by_user_id, USER);
    assert.equal(inserted.signal_type, "stripe_charge");
    assert.equal(inserted.amount_cents, 49_000);
    assert.equal(inserted.id, undefined, "DB assigns the id");

    clearSupabaseClientFactory();
    assert.equal((await listCashSignalIntakesForWorkspace("ws-sb")).length, 0, "no in-memory leak");
  });

  await t.test("Supabase: list maps rows back to intakes, scoped by workspace", async () => {
    const row = {
      id: "11111111-2222-3333-4444-555555555555",
      workspace_id: "ws-sb",
      captured_by_user_id: USER,
      signal_id: "signal:sb",
      packet_id: "packet-001",
      venture_id: "venture-001",
      source_agent_id: "agent-sales",
      signal_type: "stripe_charge",
      reference_id: "ch_sb",
      is_verified: true,
      amount_cents: 49_000,
      summary: "ACME paid the $490 pilot via Stripe charge ch_sb.",
      captured_at: "2026-06-02T00:00:00.000Z",
      evidence_ref: {
        kind: "stripe_charge",
        referenceId: "ch_sb",
        isVerified: true,
        source: "cash-signal:agent-sales",
        capturedAt: "2026-06-02T00:00:00.000Z",
        summary: "ACME paid the $490 pilot via Stripe charge ch_sb.",
      },
      created_at: "2026-06-02T00:00:00.000Z",
    };
    installSupabaseClientFactory(() => makeSupabaseMock({ listData: [row] }));

    const list = await listCashSignalIntakesForWorkspace("ws-sb");
    assert.equal(list.length, 1);
    assert.equal(list[0].signalId, "signal:sb");
    assert.equal(list[0].amountCents, 49_000);
  });

  await t.test("Supabase: insert error surfaces a sanitized repository error", async () => {
    installSupabaseClientFactory(() => makeSupabaseMock({ insertError: new Error("connection string secret token") }));
    await assert.rejects(
      () => createCashSignalIntake("ws-sb", USER, makeIntake()),
      (err) =>
        err instanceof CashSignalIntakeRepositoryError &&
        /create/i.test(err.message) &&
        !err.message.includes("secret") &&
        !err.message.includes("token"),
    );
  });

  await t.test("Supabase: list error surfaces a sanitized repository error", async () => {
    installSupabaseClientFactory(() => makeSupabaseMock({ listError: new Error("read boom") }));
    await assert.rejects(
      () => listCashSignalIntakesForWorkspace("ws-sb"),
      (err) => err instanceof CashSignalIntakeRepositoryError && /list/i.test(err.message),
    );
  });
});
