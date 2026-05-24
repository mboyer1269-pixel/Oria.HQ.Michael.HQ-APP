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

// Null repository — bypasses all persistence for pure in-memory tests.
const nullRepo = null;

// ---------------------------------------------------------------------------
// Test 1: evaluateAndStore stores a verdict
// ---------------------------------------------------------------------------

test("evaluateAndStore stores the verdict and returns a StoredArenaVerdict", async () => {
  const store = createArenaVerdictStore();
  const svc = createArenaEvaluationService({
    store,
    evaluateCandidate: makeStubEvaluate(),
    repository: nullRepo,
  });

  const record = await svc.evaluateAndStore(makeCandidate());
  assert.ok(record !== null);
  assert.equal(record.candidateId, "svc-cand-1");
  assert.ok(typeof record.storedAt === "string");
  assert.equal(record.verdict.decision, "promising");
  assert.equal(store.size(), 1);
});

// ---------------------------------------------------------------------------
// Test 2: getVerdict retrieves a stored verdict
// ---------------------------------------------------------------------------

test("getVerdict returns the stored verdict after evaluateAndStore", async () => {
  const store = createArenaVerdictStore();
  const svc = createArenaEvaluationService({
    store,
    evaluateCandidate: makeStubEvaluate(),
    repository: nullRepo,
  });

  await svc.evaluateAndStore(makeCandidate());
  const fetched = await svc.getVerdict("svc-cand-1");

  assert.ok(fetched !== null);
  assert.equal(fetched.verdict.score, 80);
});

// ---------------------------------------------------------------------------
// Test 3: listVerdicts returns all stored verdicts
// ---------------------------------------------------------------------------

test("listVerdicts returns all stored verdicts", async () => {
  const store = createArenaVerdictStore();
  const svc = createArenaEvaluationService({
    store,
    evaluateCandidate: makeStubEvaluate(),
    repository: nullRepo,
  });

  await svc.evaluateAndStore(makeCandidate({ id: "c1" }));
  await svc.evaluateAndStore(makeCandidate({ id: "c2" }));

  const all = await svc.listVerdicts();
  assert.equal(all.length, 2);
});

// ---------------------------------------------------------------------------
// Test 4: clearVerdicts empties the store
// ---------------------------------------------------------------------------

test("clearVerdicts empties all stored verdicts", async () => {
  const store = createArenaVerdictStore();
  const svc = createArenaEvaluationService({
    store,
    evaluateCandidate: makeStubEvaluate(),
    repository: nullRepo,
  });

  await svc.evaluateAndStore(makeCandidate({ id: "c1" }));
  await svc.evaluateAndStore(makeCandidate({ id: "c2" }));
  svc.clearVerdicts();

  assert.equal((await svc.listVerdicts()).length, 0);
  assert.equal(await svc.getVerdict("c1"), null);
});

// ---------------------------------------------------------------------------
// Test 5: not-evaluable verdict is stored (all decisions are stored)
// ---------------------------------------------------------------------------

test("not-evaluable verdict is stored without error", async () => {
  const store = createArenaVerdictStore();
  const svc = createArenaEvaluationService({
    store,
    evaluateCandidate: makeStubEvaluate({ decision: "not-evaluable", score: 0, netValueCents: null, roiMultiple: null, executable: false }),
    repository: nullRepo,
  });

  const record = await svc.evaluateAndStore(makeCandidate());
  assert.equal(record.verdict.decision, "not-evaluable");
  assert.equal(store.size(), 1);
});

// ---------------------------------------------------------------------------
// Test 6: service does not mutate the verdict produced by the evaluator
// ---------------------------------------------------------------------------

test("service does not mutate the verdict produced by the evaluator", async () => {
  const store = createArenaVerdictStore();
  let capturedVerdict = null;

  const svc = createArenaEvaluationService({
    store,
    evaluateCandidate: (candidate) => {
      capturedVerdict = makeVerdict({ candidateId: candidate.id, score: 77 });
      return capturedVerdict;
    },
    repository: nullRepo,
  });

  await svc.evaluateAndStore(makeCandidate());

  assert.ok(capturedVerdict !== null);
  assert.equal(capturedVerdict.score, 77);

  const stored = await svc.getVerdict("svc-cand-1");
  assert.ok(stored !== null);
  assert.ok(stored.verdict !== capturedVerdict, "stored verdict must not be the same reference as the evaluator output");
});

// ---------------------------------------------------------------------------
// Test 7: no DB / ledger / calendar / external call in service module
// ---------------------------------------------------------------------------

test("arena-evaluation-service module has no DB, ledger, calendar, or external call surface", async () => {
  const mod = await jiti.import(servicePath);
  const exportedKeys = Object.keys(mod);

  const forbidden = ["ledger", "calendar", "fetch", "http", "axios", "prisma", "sql"];
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

test("service uses the injected store, not the default store", async () => {
  const storeA = createArenaVerdictStore();
  const storeB = createArenaVerdictStore();

  const svcA = createArenaEvaluationService({ store: storeA, evaluateCandidate: makeStubEvaluate(), repository: nullRepo });
  const svcB = createArenaEvaluationService({ store: storeB, evaluateCandidate: makeStubEvaluate(), repository: nullRepo });

  await svcA.evaluateAndStore(makeCandidate({ id: "from-a" }));

  assert.equal(storeB.size(), 0, "storeB must be unaffected by svcA writes");
  assert.equal(storeA.size(), 1);
  assert.ok(await svcB.getVerdict("from-a") === null, "svcB must not see svcA verdict");
});

// ---------------------------------------------------------------------------
// Test 9: integration — service with real evaluateCandidate
// ---------------------------------------------------------------------------

test("service with real evaluateCandidate produces a deterministic verdict", async () => {
  const arenaPath = path.join(projectRoot, "src/server/arena/roi-arena.ts");
  const { evaluateCandidate: realEvaluate } = await jiti.import(arenaPath);

  const store = createArenaVerdictStore();
  const svc = createArenaEvaluationService({ store, evaluateCandidate: realEvaluate, repository: nullRepo });

  const record = await svc.evaluateAndStore(makeCandidate());

  assert.ok(record !== null);
  assert.equal(record.verdict.kind, "mission");
  assert.ok(record.verdict.score >= 70, `expected promising score, got ${record.verdict.score}`);
  assert.equal(record.verdict.executable, true);

  const record2 = await svc.evaluateAndStore(makeCandidate());
  assert.equal(record2.verdict.score, record.verdict.score);
  assert.equal(store.size(), 1);
});

// ---------------------------------------------------------------------------
// Test 10: injected repository receives the verdict after evaluateAndStore
// ---------------------------------------------------------------------------

test("evaluateAndStore calls repository.recordArenaVerdict with the verdict", async () => {
  const store = createArenaVerdictStore();
  const recorded = [];

  const stubRepo = {
    async recordArenaVerdict(workspaceId, record) {
      recorded.push({ workspaceId, candidateId: record.candidateId });
    },
    async getArenaVerdictByCandidateId() { return null; },
    async listArenaVerdicts() { return []; },
  };

  const svc = createArenaEvaluationService({
    store,
    evaluateCandidate: makeStubEvaluate(),
    repository: stubRepo,
  });

  await svc.evaluateAndStore(makeCandidate({ id: "repo-test", workspaceId: "ws-repo" }));

  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].candidateId, "repo-test");
  assert.equal(recorded[0].workspaceId, "ws-repo");
});

// ---------------------------------------------------------------------------
// Test 11: getVerdict uses repository when workspaceId is provided
// ---------------------------------------------------------------------------

test("getVerdict reads from repository when workspaceId is given", async () => {
  const store = createArenaVerdictStore();

  const repoRecord = {
    candidateId: "repo-get-cand",
    verdict: makeVerdict({ candidateId: "repo-get-cand", score: 60, decision: "marginal" }),
    storedAt: new Date().toISOString(),
    expiresAt: null,
  };

  const stubRepo = {
    async recordArenaVerdict() {},
    async getArenaVerdictByCandidateId(workspaceId, candidateId) {
      if (workspaceId === "ws-repo" && candidateId === "repo-get-cand") return repoRecord;
      return null;
    },
    async listArenaVerdicts() { return []; },
  };

  const svc = createArenaEvaluationService({
    store,
    evaluateCandidate: makeStubEvaluate(),
    repository: stubRepo,
  });

  const result = await svc.getVerdict("repo-get-cand", "ws-repo");
  assert.ok(result !== null);
  assert.equal(result.verdict.decision, "marginal");
  assert.equal(result.verdict.score, 60);
});

// ---------------------------------------------------------------------------
// Test 12: listVerdicts uses repository when workspaceId is provided
// ---------------------------------------------------------------------------

test("listVerdicts reads from repository when workspaceId is given", async () => {
  const store = createArenaVerdictStore();

  const repoRecords = [
    { candidateId: "r1", verdict: makeVerdict({ candidateId: "r1" }), storedAt: new Date().toISOString(), expiresAt: null },
    { candidateId: "r2", verdict: makeVerdict({ candidateId: "r2" }), storedAt: new Date().toISOString(), expiresAt: null },
  ];

  const stubRepo = {
    async recordArenaVerdict() {},
    async getArenaVerdictByCandidateId() { return null; },
    async listArenaVerdicts(workspaceId) {
      if (workspaceId === "ws-list-repo") return repoRecords;
      return [];
    },
  };

  const svc = createArenaEvaluationService({
    store,
    evaluateCandidate: makeStubEvaluate(),
    repository: stubRepo,
  });

  const results = await svc.listVerdicts("ws-list-repo");
  assert.equal(results.length, 2);
  assert.equal(results[0].candidateId, "r1");
});

// ---------------------------------------------------------------------------
// Test 13: null repository skips persistence (no error thrown)
// ---------------------------------------------------------------------------

test("null repository does not throw — service falls back to in-memory only", async () => {
  const store = createArenaVerdictStore();
  const svc = createArenaEvaluationService({
    store,
    evaluateCandidate: makeStubEvaluate(),
    repository: null,
  });

  const record = await svc.evaluateAndStore(makeCandidate({ id: "no-repo" }));
  assert.equal(record.candidateId, "no-repo");
  assert.equal(store.size(), 1);
});
