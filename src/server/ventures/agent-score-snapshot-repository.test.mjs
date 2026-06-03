#!/usr/bin/env node

// src/server/ventures/agent-score-snapshot-repository.test.mjs

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

test("Agent score snapshot repository", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const repoMod = await jiti.import(path.join(__dirname, "agent-score-snapshot-repository.ts"));
  const featureDir = path.join(projectRoot, "src/features/ventures");
  const snapMod = await jiti.import(path.join(featureDir, "agent-score-snapshot.ts"));
  const scoreMod = await jiti.import(path.join(featureDir, "auto-agent-operator-score.ts"));

  const {
    listAgentScoreSnapshotsForWorkspace,
    listAgentScoreSnapshotsForAgent,
    createAgentScoreSnapshot,
    getAgentScoreSnapshotPersistenceMode,
    AgentScoreSnapshotRepositoryError,
    __clearAgentScoreSnapshotsForTests,
  } = repoMod;
  const { buildAgentScoreSnapshot } = snapMod;
  const { scoreAgentOperator } = scoreMod;

  const USER = "11111111-1111-1111-1111-111111111111";

  function makeSnapshot(agentId = "hermes", scoredAt = "2026-06-02T00:00:00.000Z") {
    return buildAgentScoreSnapshot({
      score: scoreAgentOperator(agentId, []),
      scoredAt,
      outcomeCount: 0,
    });
  }

  function installFactory(factory) {
    globalThis.__agentScoreSnapshotRepositoryClientFactory = factory;
  }
  function clearFactory() {
    delete globalThis.__agentScoreSnapshotRepositoryClientFactory;
  }
  function makeSupabaseMock({ insertError = null, listData = [], listError = null, onInsert } = {}) {
    const builder = {
      _selectResult: { data: listData, error: listError },
      select() { return this; },
      eq() { return this; },
      order() { return this; },
      insert(row) { if (onInsert) onInsert(row); return Promise.resolve({ data: null, error: insertError }); },
      then(resolve) { return Promise.resolve(this._selectResult).then(resolve); },
    };
    return { from() { return builder; } };
  }

  t.beforeEach(() => { clearFactory(); __clearAgentScoreSnapshotsForTests(); });
  t.afterEach(() => { clearFactory(); __clearAgentScoreSnapshotsForTests(); });

  await t.test("a fresh workspace is empty", async () => {
    assert.deepEqual(await listAgentScoreSnapshotsForWorkspace("ws1"), []);
  });

  await t.test("create then list (in-memory), most-recent first", async () => {
    await createAgentScoreSnapshot("ws1", USER, makeSnapshot("hermes", "2026-06-02T00:00:00.000Z"));
    await createAgentScoreSnapshot("ws1", USER, makeSnapshot("hermes", "2026-06-03T00:00:00.000Z"));
    const list = await listAgentScoreSnapshotsForWorkspace("ws1");
    assert.equal(list.length, 2);
    assert.equal(list[0].scoredAt, "2026-06-03T00:00:00.000Z", "most-recent first");
  });

  await t.test("per-agent listing filters by agent", async () => {
    await createAgentScoreSnapshot("ws1", USER, makeSnapshot("hermes", "2026-06-02T00:00:00.000Z"));
    await createAgentScoreSnapshot("ws1", USER, makeSnapshot("orient", "2026-06-02T00:00:00.000Z"));
    assert.equal((await listAgentScoreSnapshotsForAgent("ws1", "hermes")).length, 1);
    assert.equal((await listAgentScoreSnapshotsForAgent("ws1", "orient")).length, 1);
  });

  await t.test("workspace isolation", async () => {
    await createAgentScoreSnapshot("ws1", USER, makeSnapshot("hermes"));
    await createAgentScoreSnapshot("ws2", USER, makeSnapshot("hermes"));
    assert.equal((await listAgentScoreSnapshotsForWorkspace("ws1")).length, 1);
    assert.equal((await listAgentScoreSnapshotsForWorkspace("ws3")).length, 0);
  });

  await t.test("persistence mode reports local outside production", async () => {
    assert.equal(getAgentScoreSnapshotPersistenceMode(), "local");
  });

  await t.test("production without Supabase or local fallback refuses (loud)", async () => {
    const prev = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      await assert.rejects(() => createAgentScoreSnapshot("ws1", USER, makeSnapshot()), /unavailable/i);
      await assert.rejects(() => listAgentScoreSnapshotsForWorkspace("ws1"), /unavailable/i);
      assert.equal(getAgentScoreSnapshotPersistenceMode(), "unavailable");
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  await t.test("Supabase: create inserts a snake_case row scoped by workspace + owner", async () => {
    let inserted = null;
    installFactory(() => makeSupabaseMock({ onInsert: (row) => { inserted = row; } }));
    await createAgentScoreSnapshot("ws-sb", USER, makeSnapshot("hermes"));
    assert.ok(inserted);
    assert.equal(inserted.workspace_id, "ws-sb");
    assert.equal(inserted.created_by_user_id, USER);
    assert.equal(inserted.agent_id, "hermes");
    assert.equal(inserted.id, undefined, "DB assigns the id");
  });

  await t.test("Supabase: insert error surfaces a sanitized repository error", async () => {
    installFactory(() => makeSupabaseMock({ insertError: new Error("secret token leak") }));
    await assert.rejects(
      () => createAgentScoreSnapshot("ws-sb", USER, makeSnapshot()),
      (err) =>
        err instanceof AgentScoreSnapshotRepositoryError &&
        /create/i.test(err.message) &&
        !err.message.includes("secret"),
    );
  });

  await t.test("Supabase: list error surfaces a sanitized repository error", async () => {
    installFactory(() => makeSupabaseMock({ listError: new Error("read boom") }));
    await assert.rejects(
      () => listAgentScoreSnapshotsForWorkspace("ws-sb"),
      (err) => err instanceof AgentScoreSnapshotRepositoryError && /list/i.test(err.message),
    );
  });
});
