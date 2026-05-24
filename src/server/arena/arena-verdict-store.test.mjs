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
  },
});

const storePath = path.join(
  projectRoot,
  "src/server/arena/arena-verdict-store.ts",
);
const { createArenaVerdictStore } = await jiti.import(storePath);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeVerdict(overrides = {}) {
  return {
    candidateId: "cand-1",
    kind: "mission",
    decision: "promising",
    score: 80,
    netValueCents: 45000,
    roiMultiple: 10,
    executable: true,
    reasons: ["Score: 80. ROI multiple: 10.00.", "Net value: 45000 cents."],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test 1: store() then get() returns the stored verdict
// ---------------------------------------------------------------------------

test("store() then get() returns the stored verdict", () => {
  const store = createArenaVerdictStore();
  const verdict = makeVerdict();
  const record = store.store(verdict);

  assert.equal(record.candidateId, "cand-1");
  assert.equal(record.verdict.decision, "promising");
  assert.equal(record.expiresAt, null);
  assert.ok(typeof record.storedAt === "string");

  const fetched = store.get("cand-1");
  assert.ok(fetched !== null);
  assert.equal(fetched.verdict.score, 80);
});

// ---------------------------------------------------------------------------
// Test 2: store() overwrites same candidateId
// ---------------------------------------------------------------------------

test("store() overwrites the same candidateId", () => {
  const store = createArenaVerdictStore();
  store.store(makeVerdict({ score: 60, decision: "marginal" }));
  store.store(makeVerdict({ score: 80, decision: "promising" }));

  assert.equal(store.size(), 1);
  const fetched = store.get("cand-1");
  assert.ok(fetched !== null);
  assert.equal(fetched.verdict.score, 80);
  assert.equal(fetched.verdict.decision, "promising");
});

// ---------------------------------------------------------------------------
// Test 3: list() returns all non-expired verdicts
// ---------------------------------------------------------------------------

test("list() returns all non-expired verdicts", () => {
  const store = createArenaVerdictStore();
  store.store(makeVerdict({ candidateId: "a", score: 80 }));
  store.store(makeVerdict({ candidateId: "b", score: 60 }));
  store.store(makeVerdict({ candidateId: "c", score: 70 }));

  const all = store.list();
  assert.equal(all.length, 3);
  // First must be most recently stored (c)
  assert.equal(all[0].candidateId, "c");
});

// ---------------------------------------------------------------------------
// Test 4: clear() empties the store
// ---------------------------------------------------------------------------

test("clear() empties the store", () => {
  const store = createArenaVerdictStore();
  store.store(makeVerdict({ candidateId: "a" }));
  store.store(makeVerdict({ candidateId: "b" }));
  store.clear();

  assert.equal(store.size(), 0);
  assert.equal(store.list().length, 0);
  assert.equal(store.get("a"), null);
});

// ---------------------------------------------------------------------------
// Test 5: size() reflects non-expired entries
// ---------------------------------------------------------------------------

test("size() reflects non-expired entries only", () => {
  const store = createArenaVerdictStore();
  assert.equal(store.size(), 0);
  store.store(makeVerdict({ candidateId: "x" }));
  assert.equal(store.size(), 1);
  store.store(makeVerdict({ candidateId: "y" }));
  assert.equal(store.size(), 2);
  store.store(makeVerdict({ candidateId: "x" })); // overwrite
  assert.equal(store.size(), 2);
});

// ---------------------------------------------------------------------------
// Test 6: ttlMs expires verdicts
// ---------------------------------------------------------------------------

test("ttlMs causes verdicts to expire", () => {
  let fakeNow = 1_000_000;
  const store = createArenaVerdictStore({ ttlMs: 500, now: () => fakeNow });
  store.store(makeVerdict());

  // Before expiry
  assert.ok(store.get("cand-1") !== null);

  // Advance past TTL
  fakeNow += 501;
  assert.equal(store.get("cand-1"), null);
});

// ---------------------------------------------------------------------------
// Test 7: get() purges an expired entry
// ---------------------------------------------------------------------------

test("get() purges expired entry from the store", () => {
  let fakeNow = 2_000_000;
  const store = createArenaVerdictStore({ ttlMs: 100, now: () => fakeNow });
  store.store(makeVerdict());
  assert.equal(store.size(), 1);

  fakeNow += 200;
  const result = store.get("cand-1");
  assert.equal(result, null);
  // Entry should be purged — size() must be 0
  assert.equal(store.size(), 0);
});

// ---------------------------------------------------------------------------
// Test 8: list() purges expired entries before returning
// ---------------------------------------------------------------------------

test("list() purges expired entries before returning", () => {
  let fakeNow = 3_000_000;
  const store = createArenaVerdictStore({ ttlMs: 200, now: () => fakeNow });
  store.store(makeVerdict({ candidateId: "old" }));

  fakeNow += 100;
  store.store(makeVerdict({ candidateId: "new" }));

  fakeNow += 110; // old is expired (total +210), new is still alive (+110)
  const all = store.list();

  assert.equal(all.length, 1);
  assert.equal(all[0].candidateId, "new");
});

// ---------------------------------------------------------------------------
// Test 9: maxEntries evicts the oldest record
// ---------------------------------------------------------------------------

test("maxEntries evicts the oldest record when exceeded", () => {
  let fakeNow = 4_000_000;
  const store = createArenaVerdictStore({ maxEntries: 2, now: () => fakeNow });

  store.store(makeVerdict({ candidateId: "first" }));
  fakeNow += 10;
  store.store(makeVerdict({ candidateId: "second" }));
  fakeNow += 10;
  store.store(makeVerdict({ candidateId: "third" })); // triggers eviction of "first"

  assert.equal(store.size(), 2);
  assert.equal(store.get("first"), null, "oldest entry must be evicted");
  assert.ok(store.get("second") !== null);
  assert.ok(store.get("third") !== null);
});

// ---------------------------------------------------------------------------
// Test 10: invalid candidateId is rejected with a thrown error
// ---------------------------------------------------------------------------

test("empty candidateId throws a controlled error", () => {
  const store = createArenaVerdictStore();
  assert.throws(
    () => store.store(makeVerdict({ candidateId: "" })),
    /candidateId must be a non-empty string/,
  );
});

// ---------------------------------------------------------------------------
// Test 11: store does not mutate the original verdict object
// ---------------------------------------------------------------------------

test("store() does not mutate the original verdict object", () => {
  const store = createArenaVerdictStore();
  const verdict = makeVerdict({ score: 75 });
  const originalScore = verdict.score;

  const record = store.store(verdict);
  // Mutate the stored copy
  record.verdict.score = 0;

  // Original must be untouched
  assert.equal(verdict.score, originalScore);
  // But also the stored record should reflect the mutation to the returned copy,
  // and get() should return the stored (shallow-copied) value.
  // The key invariant: original verdict object is not the same reference.
  assert.ok(record.verdict !== verdict, "stored verdict must be a copy, not the original reference");
});

// ---------------------------------------------------------------------------
// Test 12: module contains no DB / ledger / calendar / external call surface
// ---------------------------------------------------------------------------

test("arena-verdict-store module has no DB, ledger, calendar, or external call surface", async () => {
  const storeModule = await jiti.import(storePath);
  const exportedKeys = Object.keys(storeModule);

  const forbidden = ["supabase", "ledger", "calendar", "fetch", "http", "axios", "prisma", "sql"];
  for (const key of exportedKeys) {
    for (const f of forbidden) {
      assert.ok(
        !key.toLowerCase().includes(f),
        `Export "${key}" suggests forbidden surface "${f}"`,
      );
    }
  }

  // The module must export createArenaVerdictStore and defaultArenaVerdictStore
  assert.ok("createArenaVerdictStore" in storeModule);
  assert.ok("defaultArenaVerdictStore" in storeModule);
});
