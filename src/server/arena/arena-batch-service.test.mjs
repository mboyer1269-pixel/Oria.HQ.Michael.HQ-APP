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

const servicePath = path.join(projectRoot, "src/server/arena/arena-batch-service.ts");
const arenaPath = path.join(projectRoot, "src/server/arena/roi-arena.ts");

const {
  ArenaBatchServiceError,
  evaluateBatch,
  evaluateBatchAndMaybeStore,
} = await jiti.import(servicePath);
const { rankCandidates } = await jiti.import(arenaPath);

function makeCandidate(overrides = {}) {
  return {
    id: "cand-1",
    kind: "mission",
    title: "Candidate",
    workspaceId: "client-workspace",
    autonomyLevel: 1,
    riskLevel: "low",
    assumedRevenueInfluencedCents: 50_000,
    estimatedCostCents: 5_000,
    ...overrides,
  };
}

function makeMixedCandidates() {
  return [
    makeCandidate({
      id: "high",
      title: "High value mission",
      assumedRevenueInfluencedCents: 120_000,
      estimatedCostCents: 10_000,
    }),
    makeCandidate({
      id: "mid",
      title: "Mid value idea",
      kind: "idea",
      assumedRevenueInfluencedCents: 70_000,
      estimatedCostCents: 35_000,
    }),
    makeCandidate({
      id: "low",
      title: "Low value mission",
      assumedRevenueInfluencedCents: 30_000,
      estimatedCostCents: 25_000,
    }),
    makeCandidate({
      id: "effectful",
      title: "Effectful action",
      kind: "agent-action",
      skillId: "calendar.book",
      agentId: "joris",
      assumedRevenueInfluencedCents: 80_000,
      estimatedCostCents: 10_000,
    }),
  ];
}

function makeStoreStub() {
  const calls = [];
  return {
    calls,
    evaluationService: {
      async evaluateAndStore(candidate, context) {
        calls.push({ candidate, context });
        return {
          candidateId: candidate.id,
          verdict: {
            candidateId: candidate.id,
            kind: candidate.kind,
            decision: "promising",
            score: 80,
            netValueCents: 45000,
            roiMultiple: 9,
            executable: true,
            reasons: ["Stored."],
          },
          storedAt: "2026-01-01T00:00:00.000Z",
          expiresAt: null,
        };
      },
    },
  };
}

const fixedNow = () => "2026-01-01T00:00:00.000Z";

test("batch ranks mixed candidates in score order with not-evaluable last", () => {
  const candidates = makeMixedCandidates();
  const result = evaluateBatch(
    { workspaceId: "michael-hq", candidates, limit: 25 },
    { now: fixedNow },
  );
  const expected = rankCandidates(
    candidates.map((candidate) => ({ ...candidate, workspaceId: "michael-hq" })),
  ).slice(0, 25);

  assert.deepEqual(result.verdicts, expected);
  assert.equal(result.verdicts.at(-1)?.decision, "not-evaluable");
});

test("empty candidates throw a controlled error", () => {
  assert.throws(
    () => evaluateBatch({ workspaceId: "michael-hq", candidates: [] }),
    (error) => error instanceof ArenaBatchServiceError && /at least one/i.test(error.message),
  );
});

test("more than 100 candidates is rejected", () => {
  const candidates = Array.from({ length: 101 }, (_, index) =>
    makeCandidate({ id: `cand-${index}`, title: `Candidate ${index}` }),
  );

  assert.throws(
    () => evaluateBatch({ workspaceId: "michael-hq", candidates }),
    (error) => error instanceof ArenaBatchServiceError && /100/i.test(error.message),
  );
});

test("limit is applied to the returned verdicts", () => {
  const candidates = makeMixedCandidates();
  const result = evaluateBatch(
    { workspaceId: "michael-hq", candidates, limit: 2 },
    { now: fixedNow },
  );

  assert.equal(result.limit, 2);
  assert.equal(result.verdicts.length, 2);
});

test("storeResults=true stores every verdict via the evaluation service", async () => {
  const candidates = makeMixedCandidates();
  const stub = makeStoreStub();
  const result = await evaluateBatchAndMaybeStore(
    {
      workspaceId: "michael-hq",
      candidates,
      limit: 3,
      storeResults: true,
    },
    { evaluationService: stub.evaluationService, now: fixedNow },
  );

  assert.equal(result.stored, true);
  assert.equal(stub.calls.length, candidates.length);
  assert.equal(stub.calls[0].candidate.workspaceId, "michael-hq");
});

test("storeResults=false does not store verdicts", async () => {
  const candidates = makeMixedCandidates();
  const stub = makeStoreStub();
  const result = await evaluateBatchAndMaybeStore(
    {
      workspaceId: "michael-hq",
      candidates,
      limit: 3,
      storeResults: false,
    },
    { evaluationService: stub.evaluationService, now: fixedNow },
  );

  assert.equal(result.stored, false);
  assert.equal(stub.calls.length, 0);
});

test("client workspaceId is overwritten by the server workspace", async () => {
  const candidate = makeCandidate({
    id: "workspace-check",
    workspaceId: "client-workspace",
  });
  const stub = makeStoreStub();

  await evaluateBatchAndMaybeStore(
    {
      workspaceId: "server-workspace",
      candidates: [candidate],
      storeResults: true,
    },
    { evaluationService: stub.evaluationService, now: fixedNow },
  );

  assert.equal(stub.calls[0].candidate.workspaceId, "server-workspace");
});

test("same input produces deterministic output", () => {
  const candidates = makeMixedCandidates();
  const first = evaluateBatch(
    { workspaceId: "michael-hq", candidates, limit: 4 },
    { now: fixedNow },
  );
  const second = evaluateBatch(
    { workspaceId: "michael-hq", candidates, limit: 4 },
    { now: fixedNow },
  );

  assert.deepEqual(first, second);
});

test("effectful candidates are ranked as not-evaluable", () => {
  const result = evaluateBatch(
    {
      workspaceId: "michael-hq",
      candidates: [makeMixedCandidates()[3]],
      limit: 1,
    },
    { now: fixedNow },
  );

  assert.equal(result.verdicts[0].decision, "not-evaluable");
});

test("topCandidateId matches the first verdict in the leaderboard", () => {
  const candidates = makeMixedCandidates();
  const result = evaluateBatch(
    { workspaceId: "michael-hq", candidates, limit: 4 },
    { now: fixedNow },
  );

  assert.equal(result.topCandidateId, result.verdicts[0].candidateId);
});

test("batch ranking does not alter scores from the ROI engine", () => {
  const candidates = makeMixedCandidates().map((candidate) => ({
    ...candidate,
    workspaceId: "michael-hq",
  }));
  const result = evaluateBatch(
    { workspaceId: "michael-hq", candidates, limit: 4 },
    { now: fixedNow },
  );
  const expected = rankCandidates(candidates).slice(0, 4);

  assert.deepEqual(result.verdicts.map((verdict) => verdict.score), expected.map((verdict) => verdict.score));
  assert.deepEqual(result.verdicts.map((verdict) => verdict.decision), expected.map((verdict) => verdict.decision));
});
