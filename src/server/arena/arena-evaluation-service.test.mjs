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

const servicePath = path.join(
  projectRoot,
  "src/server/arena/arena-evaluation-service.ts",
);
const storePath = path.join(
  projectRoot,
  "src/server/arena/arena-verdict-store.ts",
);

const { createArenaEvaluationService } = await jiti.import(servicePath);
const { createArenaVerdictStore } = await jiti.import(storePath);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeVerdict(overrides = {}) {
  return {
    candidateId: "svc-cand-1",
    kind: "mission",
    decision: "promising",
    score: 80,
    netValueCents: 45000,
    roiMultiple: 10,
    executable: true,
    reasons: ["Score: 80."],
    ...overrides,
  };
}

function makeCandidate(overrides = {}) {
  return {
    id: "svc-cand-1",
    kind: "mission",
    title: "Test Mission",
    workspaceId: "ws-test",
    skillId: "board.consult",
    agentId: "joris",
    autonomyLevel: 1,
    riskLevel: "low",
    assumedRevenueInfluencedCents: 50_000,
    estimatedCostCents: 5_000,
    ...overrides,
  };
}

// Stub evaluateCandidate that returns a fixed verdict for a given candidate.
function makeStubEvaluate(verdictOverrides = {}) {
  return (candidate) => makeVerdict({ candidateId: candidate.id, ...verdictOverrides });
}

// ---------------------------------------------------------------------------
// Test 1: evaluateAndStore stores a verdict
// ---------------------------------------------------------------------------

test("evaluateAndStore stores the verdict and returns a StoredArenaVerdict", () => {
  const store = createArenaVerdictStore();
  const svc = createArenaEvaluationService({
    store,
    evaluateCandidate: makeStubEvaluate(),
  });

  const record = svc.evaluateAndStore(makeCandidate());
  assert.ok(record !== null);
  assert.equal(record.candidateId, "svc-cand-1");
  assert.ok(typeof record.storedAt === "string");
  assert.equal(record.verdict.decision, "promising");
  assert.equal(store.size(), 1);
});

// ---------------------------------------------------------------------------
// Test 2: getVerdict retrieves a stored verdict
// ---------------------------------------------------------------------------

test("getVerdict returns the stored verdict after evaluateAndStore", () => {
  const store = createArenaVerdictStore();
  const svc = createArenaEvaluationService({
    store,
    evaluateCandidate: makeStubEvaluate(),
  });

  svc.evaluateAndStore(makeCandidate());
  const fetched = svc.getVerdict("svc-cand-1");

  assert.ok(fetched !== null);
  assert.equal(fetched.verdict.score, 80);
});

// ---------------------------------------------------------------------------
// Test 3: listVerdicts returns all stored verdicts
// ---------------------------------------------------------------------------

test("listVerdicts returns all stored verdicts", () => {
  const store = createArenaVerdictStore();
  const svc = createArenaEvaluationService({
    store,
    evaluateCandidate: makeStubEvaluate(),
  });

  svc.evaluateAndStore(makeCandidate({ id: "c1" }));
  svc.evaluateAndStore(makeCandidate({ id: "c2" }));

  const all = svc.listVerdicts();
  assert.equal(all.length, 2);
});

// ---------------------------------------------------------------------------
// Test 4: clearVerdicts empties the store
// ---------------------------------------------------------------------------

test("clearVerdicts empties all stored verdicts", () => {
  const store = createArenaVerdictStore();
  const svc = createArenaEvaluationService({
    store,
    evaluateCandidate: makeStubEvaluate(),
  });

  svc.evaluateAndStore(makeCandidate({ id: "c1" }));
  svc.evaluateAndStore(makeCandidate({ id: "c2" }));
  svc.clearVerdicts();

  assert.equal(svc.listVerdicts().length, 0);
  assert.equal(svc.getVerdict("c1"), null);
});

// ---------------------------------------------------------------------------
// Test 5: not-evaluable verdict is stored (all decisions are stored)
// ---------------------------------------------------------------------------

test("not-evaluable verdict is stored without error", () => {
  const store = createArenaVerdictStore();
  const svc = createArenaEvaluationService({
    store,
    evaluateCandidate: makeStubEvaluate({ decision: "not-evaluable", score: 0, netValueCents: null, roiMultiple: null, executable: false }),
  });

  const record = svc.evaluateAndStore(makeCandidate());
  assert.equal(record.verdict.decision, "not-evaluable");
  assert.equal(store.size(), 1);
});

// ---------------------------------------------------------------------------
// Test 6: service does not mutate the verdict produced by the evaluator
// ---------------------------------------------------------------------------

test("service does not mutate the verdict produced by the evaluator", () => {
  const store = createArenaVerdictStore();
  let capturedVerdict = null;

  const svc = createArenaEvaluationService({
    store,
    evaluateCandidate: (candidate) => {
      capturedVerdict = makeVerdict({ candidateId: candidate.id, score: 77 });
      return capturedVerdict;
    },
  });

  svc.evaluateAndStore(makeCandidate());

  // The original verdict produced by the evaluator must be untouched.
  assert.ok(capturedVerdict !== null);
  assert.equal(capturedVerdict.score, 77);

  // The stored copy is a separate object.
  const stored = svc.getVerdict("svc-cand-1");
  assert.ok(stored !== null);
  assert.ok(stored.verdict !== capturedVerdict, "stored verdict must not be the same reference as the evaluator output");
});

// ---------------------------------------------------------------------------
// Test 7: no DB / ledger / calendar / external call in service module
// ---------------------------------------------------------------------------

test("arena-evaluation-service module has no DB, ledger, calendar, or external call surface", async () => {
  const mod = await jiti.import(servicePath);
  const exportedKeys = Object.keys(mod);

  const forbidden = ["supabase", "ledger", "calendar", "fetch", "http", "axios", "prisma", "sql"];
  for (const key of exportedKeys) {
    for (const f of forbidden) {
      assert.ok(
        !key.toLowerCase().includes(f),
        `Export "${key}" suggests forbidden surface "${f}"`,
      );
    }
  }

  assert.ok("createArenaEvaluationService" in mod);
  assert.ok("defaultArenaEvaluationService" in mod);
});

// ---------------------------------------------------------------------------
// Test 8: injected store is the one actually used
// ---------------------------------------------------------------------------

test("service uses the injected store, not the default store", () => {
  const storeA = createArenaVerdictStore();
  const storeB = createArenaVerdictStore();

  const svcA = createArenaEvaluationService({ store: storeA, evaluateCandidate: makeStubEvaluate() });
  const svcB = createArenaEvaluationService({ store: storeB, evaluateCandidate: makeStubEvaluate() });

  svcA.evaluateAndStore(makeCandidate({ id: "from-a" }));

  // storeB must be empty — storeA's data must not leak.
  assert.equal(storeB.size(), 0, "storeB must be unaffected by svcA writes");
  assert.equal(storeA.size(), 1);
  assert.ok(svcB.getVerdict("from-a") === null, "svcB must not see svcA verdict");
});

// ---------------------------------------------------------------------------
// Integration test: service composes real evaluateCandidate + real store
// ---------------------------------------------------------------------------

test("service with real evaluateCandidate produces a deterministic verdict", async () => {
  const arenaPath = path.join(projectRoot, "src/server/arena/roi-arena.ts");
  const { evaluateCandidate: realEvaluate } = await jiti.import(arenaPath);

  const store = createArenaVerdictStore();
  const svc = createArenaEvaluationService({ store, evaluateCandidate: realEvaluate });

  const record = svc.evaluateAndStore(makeCandidate());

  assert.ok(record !== null);
  assert.equal(record.verdict.kind, "mission");
  assert.ok(record.verdict.score >= 70, `expected promising score, got ${record.verdict.score}`);
  assert.equal(record.verdict.executable, true);

  // Idempotent: same candidate evaluated again overwrites with same result.
  const record2 = svc.evaluateAndStore(makeCandidate());
  assert.equal(record2.verdict.score, record.verdict.score);
  assert.equal(store.size(), 1);
});
