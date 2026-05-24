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
    "server-only": path.join(projectRoot, "src/__server-only-noop.js"),
  },
});

const repoPath = path.join(
  projectRoot,
  "src/server/arena/arena-verdict-repository.ts",
);

const {
  ArenaVerdictRepositoryError,
  recordArenaVerdict,
  getArenaVerdictByCandidateId,
  listArenaVerdicts,
  clearLocalArenaVerdictStore,
} = await jiti.import(repoPath);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRecord(overrides = {}) {
  return {
    candidateId: "repo-cand-1",
    verdict: {
      candidateId: "repo-cand-1",
      kind: "mission",
      decision: "promising",
      score: 80,
      netValueCents: 45000,
      roiMultiple: 9,
      executable: true,
      reasons: ["Score: 80."],
    },
    storedAt: new Date().toISOString(),
    expiresAt: null,
    ...overrides,
  };
}

function installSupabaseClientFactory(factory) {
  globalThis.__arenaVerdictRepositoryClientFactory = factory;
}

function clearSupabaseClientFactory() {
  delete globalThis.__arenaVerdictRepositoryClientFactory;
}

test.afterEach(() => {
  clearSupabaseClientFactory();
  clearLocalArenaVerdictStore();
});

// ---------------------------------------------------------------------------
// Test 1: recordArenaVerdict stores in local fallback
// ---------------------------------------------------------------------------

test("recordArenaVerdict stores a verdict in the local fallback store", async () => {
  clearLocalArenaVerdictStore();
  clearSupabaseClientFactory();
  const record = makeRecord({ candidateId: "t1-cand" });
  await recordArenaVerdict("ws-test", record);

  const fetched = await getArenaVerdictByCandidateId("ws-test", "t1-cand");
  assert.ok(fetched !== null, "stored record must be retrievable");
  assert.equal(fetched.candidateId, "t1-cand");
});

// ---------------------------------------------------------------------------
// Test 2: getArenaVerdictByCandidateId retrieves the stored record
// ---------------------------------------------------------------------------

test("getArenaVerdictByCandidateId returns the stored record", async () => {
  clearLocalArenaVerdictStore();
  clearSupabaseClientFactory();
  const record = makeRecord({ candidateId: "t2-cand" });
  await recordArenaVerdict("ws-test", record);

  const fetched = await getArenaVerdictByCandidateId("ws-test", "t2-cand");
  assert.ok(fetched !== null);
  assert.equal(fetched.verdict.decision, "promising");
  assert.equal(fetched.verdict.score, 80);
  assert.equal(fetched.storedAt, record.storedAt);
  assert.equal(fetched.expiresAt, null);
});

// ---------------------------------------------------------------------------
// Test 3: getArenaVerdictByCandidateId returns null for unknown candidateId
// ---------------------------------------------------------------------------

test("getArenaVerdictByCandidateId returns null for an unknown candidateId", async () => {
  clearLocalArenaVerdictStore();
  clearSupabaseClientFactory();
  const result = await getArenaVerdictByCandidateId("ws-test", "does-not-exist");
  assert.equal(result, null);
});

// ---------------------------------------------------------------------------
// Test 4: listArenaVerdicts returns all verdicts for a workspace
// ---------------------------------------------------------------------------

test("listArenaVerdicts returns all verdicts for the given workspace", async () => {
  clearLocalArenaVerdictStore();
  clearSupabaseClientFactory();
  await recordArenaVerdict("ws-list", makeRecord({ candidateId: "l1" }));
  await recordArenaVerdict("ws-list", makeRecord({ candidateId: "l2" }));
  await recordArenaVerdict("ws-list", makeRecord({ candidateId: "l3" }));

  const results = await listArenaVerdicts("ws-list");
  assert.equal(results.length, 3);
});

// ---------------------------------------------------------------------------
// Test 5: listArenaVerdicts filters by workspaceId
// ---------------------------------------------------------------------------

test("listArenaVerdicts does not return verdicts from other workspaces", async () => {
  clearLocalArenaVerdictStore();
  clearSupabaseClientFactory();
  await recordArenaVerdict("ws-alpha", makeRecord({ candidateId: "shared-candidate" }));
  await recordArenaVerdict("ws-beta", makeRecord({ candidateId: "shared-candidate" }));

  const alphaResults = await listArenaVerdicts("ws-alpha");
  const betaResults = await listArenaVerdicts("ws-beta");

  assert.equal(alphaResults.length, 1, "ws-alpha must have exactly 1 result");
  assert.equal(betaResults.length, 1, "ws-beta must have exactly 1 result");
  assert.equal(alphaResults[0].candidateId, "shared-candidate");
  assert.equal(betaResults[0].candidateId, "shared-candidate");
});

// ---------------------------------------------------------------------------
// Test 6: clearLocalArenaVerdictStore clears all entries
// ---------------------------------------------------------------------------

test("clearLocalArenaVerdictStore empties the local fallback store", async () => {
  clearSupabaseClientFactory();
  await recordArenaVerdict("ws-clear", makeRecord({ candidateId: "c1" }));
  await recordArenaVerdict("ws-clear", makeRecord({ candidateId: "c2" }));

  clearLocalArenaVerdictStore();

  const after = await listArenaVerdicts("ws-clear");
  assert.equal(after.length, 0);
});

// ---------------------------------------------------------------------------
// Test 7: recordArenaVerdict upserts (same candidateId+workspace overwrites)
// ---------------------------------------------------------------------------

test("recordArenaVerdict overwrites an existing entry for the same workspace+candidate", async () => {
  clearLocalArenaVerdictStore();
  clearSupabaseClientFactory();
  const first = makeRecord({ candidateId: "upsert-cand", verdict: { ...makeRecord().verdict, score: 55, decision: "marginal" } });
  const second = makeRecord({ candidateId: "upsert-cand", verdict: { ...makeRecord().verdict, score: 80, decision: "promising" } });

  await recordArenaVerdict("ws-upsert", first);
  await recordArenaVerdict("ws-upsert", second);

  const all = await listArenaVerdicts("ws-upsert");
  assert.equal(all.length, 1, "upsert must not create a duplicate entry");
  assert.equal(all[0].verdict.decision, "promising", "second write must overwrite the first");
});

// ---------------------------------------------------------------------------
// Test 8: field mapping round-trips correctly
// ---------------------------------------------------------------------------

test("stored verdict round-trips all fields correctly through the local fallback", async () => {
  clearLocalArenaVerdictStore();
  clearSupabaseClientFactory();
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  const record = makeRecord({
    candidateId: "roundtrip-cand",
    storedAt: "2026-01-01T00:00:00.000Z",
    expiresAt,
  });

  await recordArenaVerdict("ws-roundtrip", record);
  const fetched = await getArenaVerdictByCandidateId("ws-roundtrip", "roundtrip-cand");

  assert.ok(fetched !== null);
  assert.equal(fetched.candidateId, "roundtrip-cand");
  assert.equal(fetched.storedAt, "2026-01-01T00:00:00.000Z");
  assert.equal(fetched.expiresAt, expiresAt);
  assert.equal(fetched.verdict.score, 80);
});

// ---------------------------------------------------------------------------
// Test 9: module exports only expected surface (no DB, no ledger, no calendar)
// ---------------------------------------------------------------------------

test("arena-verdict-repository exports only expected surface", async () => {
  const mod = await jiti.import(repoPath);
  const exportedKeys = Object.keys(mod);

  const expected = new Set([
    "ArenaVerdictRepositoryError",
    "recordArenaVerdict",
    "getArenaVerdictByCandidateId",
    "listArenaVerdicts",
    "clearLocalArenaVerdictStore",
  ]);

  for (const key of exportedKeys) {
    assert.ok(expected.has(key), `Unexpected export: "${key}"`);
  }

  const forbidden = ["ledger", "calendar", "http", "axios", "prisma", "sql"];
  for (const key of exportedKeys) {
    for (const f of forbidden) {
      assert.ok(!key.toLowerCase().includes(f), `Export "${key}" suggests forbidden surface "${f}"`);
    }
  }
});

// ---------------------------------------------------------------------------
// Test 10: Supabase errors are surfaced as repository errors
// ---------------------------------------------------------------------------

test("recordArenaVerdict throws on Supabase error without leaking internals", async () => {
  clearLocalArenaVerdictStore();

  const failingError = new Error("stack trace secret token leak");
  installSupabaseClientFactory(() => ({
    from() {
      return {
        upsert() {
          return Promise.resolve({ data: null, error: failingError });
        },
        select() {
          return this;
        },
        eq() {
          return this;
        },
        order() {
          return Promise.resolve({ data: [], error: null });
        },
        maybeSingle() {
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  }));

  await assert.rejects(
    () => recordArenaVerdict("ws-supabase", makeRecord({ candidateId: "repo-error" })),
    (error) =>
      error instanceof ArenaVerdictRepositoryError &&
      /record/i.test(error.message) &&
      !error.message.includes("secret") &&
      !error.message.includes("stack"),
  );
  clearSupabaseClientFactory();
});

test("getArenaVerdictByCandidateId throws on Supabase error", async () => {
  installSupabaseClientFactory(() => ({
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        maybeSingle() {
          return Promise.resolve({ data: null, error: new Error("get failed") });
        },
        order() {
          return Promise.resolve({ data: [], error: null });
        },
        upsert() {
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  }));

  await assert.rejects(
    () => getArenaVerdictByCandidateId("ws-supabase", "repo-error"),
    (error) => error instanceof ArenaVerdictRepositoryError && /get/i.test(error.message),
  );
  clearSupabaseClientFactory();
});

test("listArenaVerdicts throws on Supabase error and uses workspace_id/candidate_id upsert conflict", async () => {
  let recordedConflict = null;

  installSupabaseClientFactory(() => ({
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        order() {
          return Promise.resolve({ data: null, error: new Error("list failed") });
        },
        maybeSingle() {
          return Promise.resolve({ data: null, error: null });
        },
        upsert(row, options) {
          recordedConflict = options?.onConflict ?? null;
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  }));

  await assert.rejects(
    () => listArenaVerdicts("ws-supabase"),
    (error) => error instanceof ArenaVerdictRepositoryError && /list/i.test(error.message),
  );

  await recordArenaVerdict("ws-supabase", makeRecord({ candidateId: "conflict-cand" }));
  assert.equal(recordedConflict, "workspace_id,candidate_id");

  clearSupabaseClientFactory();
});
