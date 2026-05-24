#!/usr/bin/env node

// PR10.1 — Arena API authenticated path tests.
// The existing 401 coverage stays in place; these tests add a success-path
// proof with an authenticated owner and the active workspace context.

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

const evaluateRoutePath = path.join(projectRoot, "src/app/api/arena/evaluate/route.ts");
const verdictsRoutePath = path.join(projectRoot, "src/app/api/arena/verdicts/route.ts");
const candidateIdRoutePath = path.join(
  projectRoot,
  "src/app/api/arena/verdicts/[candidateId]/route.ts",
);
const batchRoutePath = path.join(projectRoot, "src/app/api/arena/batch/route.ts");

const { POST: evaluatePOST } = await jiti.import(evaluateRoutePath);
const { GET: verdictsGET } = await jiti.import(verdictsRoutePath);
const { GET: verdictByIdGET } = await jiti.import(candidateIdRoutePath);
const { POST: batchPOST } = await jiti.import(batchRoutePath);
const { DEFAULT_WORKSPACE_SLUG } = await jiti.import(
  path.join(projectRoot, "src/core/workspaces/registry.ts"),
);
const {
  clearLocalArenaVerdictStore,
} = await jiti.import(path.join(projectRoot, "src/server/arena/arena-verdict-repository.ts"));
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvaluateRequest(body = {}) {
  return new Request("http://localhost/api/arena/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeCandidate(overrides = {}) {
  return {
    id: "auth-test-cand",
    kind: "mission",
    title: "Auth Test Mission",
    workspaceId: "ws-auth-test",
    autonomyLevel: 1,
    riskLevel: "low",
    assumedRevenueInfluencedCents: 50_000,
    estimatedCostCents: 5_000,
    ...overrides,
  };
}

function makeBatchRequest(body = {}) {
  return new Request("http://localhost/api/arena/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeBatchCandidates() {
  return [
    makeCandidate({
      id: "batch-high",
      title: "Batch High",
      assumedRevenueInfluencedCents: 120_000,
      estimatedCostCents: 10_000,
    }),
    makeCandidate({
      id: "batch-mid",
      title: "Batch Mid",
      kind: "idea",
      assumedRevenueInfluencedCents: 70_000,
      estimatedCostCents: 35_000,
    }),
    makeCandidate({
      id: "batch-effectful",
      title: "Batch Effectful",
      kind: "agent-action",
      skillId: "calendar.book",
      agentId: "joris",
      assumedRevenueInfluencedCents: 80_000,
      estimatedCostCents: 10_000,
    }),
  ];
}

function allowOwnerApiSession() {
  globalThis.__ownerApiSessionTestResult = null;
}

function clearOwnerApiSession() {
  delete globalThis.__ownerApiSessionTestResult;
}

let arenaServiceHarness = null;

function createArenaServiceHarness() {
  const store = new Map();
  const calls = [];

  const service = {
    async evaluateAndStore(candidate) {
      calls.push(candidate);
      const record = {
        candidateId: candidate.id,
        verdict: {
          candidateId: candidate.id,
          kind: candidate.kind,
          decision: "promising",
          score: 80,
          netValueCents: 45000,
          roiMultiple: 9,
          executable: true,
          reasons: ["Mock verdict."],
        },
        storedAt: "2026-05-24T18:00:00.000Z",
        expiresAt: null,
      };

      if (!store.has(candidate.workspaceId)) {
        store.set(candidate.workspaceId, new Map());
      }
      store.get(candidate.workspaceId).set(candidate.id, record);
      return record;
    },
    async getVerdict(candidateId, workspaceId) {
      if (workspaceId) {
        return store.get(workspaceId)?.get(candidateId) ?? null;
      }

      for (const workspaceRecords of store.values()) {
        const record = workspaceRecords.get(candidateId);
        if (record) return record;
      }

      return null;
    },
    async listVerdicts(workspaceId) {
      return [...(store.get(workspaceId)?.values() ?? [])];
    },
  };

  globalThis.__arenaEvaluationServiceTestOverride = service;

  return {
    calls,
    service,
    seed(workspaceId, record) {
      if (!store.has(workspaceId)) {
        store.set(workspaceId, new Map());
      }
      store.get(workspaceId).set(record.candidateId, record);
    },
  };
}

test.afterEach(() => {
  clearOwnerApiSession();
  clearLocalArenaVerdictStore();
  if (arenaServiceHarness) {
    delete globalThis.__arenaEvaluationServiceTestOverride;
    arenaServiceHarness = null;
  }
});

// ---------------------------------------------------------------------------
// Test 1: POST /api/arena/evaluate returns 401 for unauthenticated request
// ---------------------------------------------------------------------------

test("POST /api/arena/evaluate returns 401 for unauthenticated request", async () => {
  const res = await evaluatePOST(
    makeEvaluateRequest({ candidate: makeCandidate() }),
  );
  assert.equal(res.status, 401);
  const data = await res.json();
  assert.ok(typeof data.error === "string", "401 body must include an error field");
});

// ---------------------------------------------------------------------------
// Test 2: POST /api/arena/evaluate returns 401 even with invalid payload
// ---------------------------------------------------------------------------

test("POST /api/arena/evaluate returns 401 before schema validation for unauthenticated request", async () => {
  const res = await evaluatePOST(
    makeEvaluateRequest({ candidate: { kind: "mission" } }),
  );
  // Auth guard runs before schema validation — must be 401, not 400.
  assert.equal(res.status, 401);
});

// ---------------------------------------------------------------------------
// Test 3: POST /api/arena/evaluate returns 401 with empty body
// ---------------------------------------------------------------------------

test("POST /api/arena/evaluate with empty body returns 401 for unauthenticated request", async () => {
  const res = await evaluatePOST(
    new Request("http://localhost/api/arena/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }),
  );
  assert.equal(res.status, 401);
});

// ---------------------------------------------------------------------------
// Test 4: POST /api/arena/evaluate succeeds for authenticated owner
// ---------------------------------------------------------------------------

test("POST /api/arena/evaluate returns 200 for authenticated owner and overwrites client workspaceId", async () => {
  arenaServiceHarness = createArenaServiceHarness();
  allowOwnerApiSession();
  const candidateId = "auth-success-candidate";

  const res = await evaluatePOST(
    makeEvaluateRequest({
      candidate: makeCandidate({
        id: candidateId,
        workspaceId: "client-workspace",
      }),
    }),
  );

  assert.equal(res.status, 200);

  const body = await res.json();
  assert.equal(body.candidateId, candidateId);
  assert.ok(body.verdict);
  assert.equal(arenaServiceHarness.calls[0].workspaceId, DEFAULT_WORKSPACE_SLUG);

  const stored = await verdictByIdGET(
    new Request(`http://localhost/api/arena/verdicts/${candidateId}`),
    { params: Promise.resolve({ candidateId }) },
  );
  assert.equal(stored.status, 200);
});

// ---------------------------------------------------------------------------
// Test 5: GET /api/arena/verdicts returns 401 for unauthenticated request
// ---------------------------------------------------------------------------

test("GET /api/arena/verdicts returns 401 for unauthenticated request", async () => {
  const res = await verdictsGET(
    new Request("http://localhost/api/arena/verdicts"),
  );
  assert.equal(res.status, 401);
  const data = await res.json();
  assert.ok(typeof data.error === "string");
});

// ---------------------------------------------------------------------------
// Test 6: GET /api/arena/verdicts succeeds for authenticated owner
// ---------------------------------------------------------------------------

test("GET /api/arena/verdicts returns 200 and is workspace-scoped for authenticated owner", async () => {
  arenaServiceHarness = createArenaServiceHarness();
  allowOwnerApiSession();
  const currentCandidateId = "auth-list-candidate";
  const otherWorkspaceCandidateId = "other-workspace-candidate";

  arenaServiceHarness.seed(DEFAULT_WORKSPACE_SLUG, {
    candidateId: currentCandidateId,
    verdict: {
      candidateId: currentCandidateId,
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
  });

  arenaServiceHarness.seed("other-workspace", {
    candidateId: otherWorkspaceCandidateId,
    verdict: {
      candidateId: otherWorkspaceCandidateId,
      kind: "mission",
      decision: "promising",
      score: 75,
      netValueCents: 40000,
      roiMultiple: 8,
      executable: true,
      reasons: ["Score: 75."],
    },
    storedAt: new Date().toISOString(),
    expiresAt: null,
  });

  const res = await verdictsGET(new Request("http://localhost/api/arena/verdicts"));
  assert.equal(res.status, 200);

  const body = await res.json();
  assert.equal(body.total, 1);
  assert.equal(body.verdicts.length, 1);
  assert.equal(body.verdicts[0].candidateId, currentCandidateId);
});

// ---------------------------------------------------------------------------
// Test 7: GET /api/arena/verdicts 401 body must not leak verdict data
// ---------------------------------------------------------------------------

test("GET /api/arena/verdicts 401 response does not expose verdict data", async () => {
  const res = await verdictsGET(
    new Request("http://localhost/api/arena/verdicts"),
  );
  assert.equal(res.status, 401);
  const data = await res.json();
  assert.ok(!("verdicts" in data), "401 response must not include verdicts array");
  assert.ok(!("total" in data), "401 response must not include total field");
});

// ---------------------------------------------------------------------------
// Test 8: GET /api/arena/verdicts/[candidateId] succeeds for authenticated owner
// ---------------------------------------------------------------------------

test("GET /api/arena/verdicts/[candidateId] returns 200 for authenticated owner and hides other workspaces", async () => {
  arenaServiceHarness = createArenaServiceHarness();
  allowOwnerApiSession();
  const candidateId = "auth-get-candidate";

  arenaServiceHarness.seed("other-workspace", {
    candidateId,
    verdict: {
      candidateId,
      kind: "mission",
      decision: "promising",
      score: 78,
      netValueCents: 42000,
      roiMultiple: 8.4,
      executable: true,
      reasons: ["Score: 78."],
    },
    storedAt: new Date().toISOString(),
    expiresAt: null,
  });

  arenaServiceHarness.seed(DEFAULT_WORKSPACE_SLUG, {
    candidateId,
    verdict: {
      candidateId,
      kind: "mission",
      decision: "promising",
      score: 81,
      netValueCents: 46000,
      roiMultiple: 9.2,
      executable: true,
      reasons: ["Score: 81."],
    },
    storedAt: new Date().toISOString(),
    expiresAt: null,
  });

  const res = await verdictByIdGET(
    new Request(`http://localhost/api/arena/verdicts/${candidateId}`),
    { params: Promise.resolve({ candidateId }) },
  );

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.candidateId, candidateId);
  assert.equal(body.verdict.score, 81);
});

// ---------------------------------------------------------------------------
// Test 9: GET /api/arena/verdicts/[candidateId] returns 401 for unknown candidateId
// ---------------------------------------------------------------------------

test("GET /api/arena/verdicts/[candidateId] returns 401 for unauthenticated request", async () => {
  const res = await verdictByIdGET(
    new Request("http://localhost/api/arena/verdicts/some-id"),
    { params: Promise.resolve({ candidateId: "some-id" }) },
  );
  assert.equal(res.status, 401);
  const data = await res.json();
  assert.ok(typeof data.error === "string");
});

// ---------------------------------------------------------------------------
// Test 10: GET /api/arena/verdicts/[candidateId] 401 must not leak verdict data
// ---------------------------------------------------------------------------

test("GET /api/arena/verdicts/[candidateId] 401 response does not expose verdict data", async () => {
  const res = await verdictByIdGET(
    new Request("http://localhost/api/arena/verdicts/any-id"),
    { params: Promise.resolve({ candidateId: "any-id" }) },
  );
  assert.equal(res.status, 401);
  const data = await res.json();
  assert.ok(!("verdict" in data), "401 response must not include verdict object");
  assert.ok(!("candidateId" in data), "401 response must not include candidateId");
});

// ---------------------------------------------------------------------------
// Test 11: all three routes return JSON content-type on 401
// ---------------------------------------------------------------------------

test("all arena routes return application/json content-type on 401", async () => {
  const responses = await Promise.all([
    evaluatePOST(makeEvaluateRequest({ candidate: makeCandidate() })),
    verdictsGET(new Request("http://localhost/api/arena/verdicts")),
    verdictByIdGET(
      new Request("http://localhost/api/arena/verdicts/x"),
      { params: Promise.resolve({ candidateId: "x" }) },
    ),
  ]);

  for (const res of responses) {
    assert.equal(res.status, 401);
    const ct = res.headers.get("content-type") ?? "";
    assert.ok(ct.includes("application/json"), `Expected application/json, got "${ct}"`);
  }
});

// ---------------------------------------------------------------------------
// Test 12: POST /api/arena/batch returns 401 for unauthenticated request
// ---------------------------------------------------------------------------

test("POST /api/arena/batch returns 401 for unauthenticated request", async () => {
  const res = await batchPOST(makeBatchRequest({ candidates: makeBatchCandidates(), limit: 3 }));
  assert.equal(res.status, 401);
});

// ---------------------------------------------------------------------------
// Test 13: POST /api/arena/batch returns 200 for authenticated owner
// ---------------------------------------------------------------------------

test("POST /api/arena/batch returns 200 for authenticated owner and stores results by default", async () => {
  arenaServiceHarness = createArenaServiceHarness();
  allowOwnerApiSession();

  const candidates = [
    ...makeBatchCandidates(),
    makeCandidate({
      id: "batch-extra",
      title: "Batch Extra",
      assumedRevenueInfluencedCents: 140_000,
      estimatedCostCents: 12_000,
    }),
  ];

  const res = await batchPOST(makeBatchRequest({ candidates, limit: 3 }));
  assert.equal(res.status, 200);

  const body = await res.json();
  assert.equal(body.total, candidates.length);
  assert.equal(body.verdicts.length, 3);
  assert.equal(body.topCandidateId, body.verdicts[0].candidateId);
  assert.equal(body.stored, true);
  assert.equal(arenaServiceHarness.calls.length, candidates.length);
  assert.equal(arenaServiceHarness.calls[0].workspaceId, DEFAULT_WORKSPACE_SLUG);

  const verdictsRes = await verdictsGET(new Request("http://localhost/api/arena/verdicts"));
  const verdictsBody = await verdictsRes.json();
  assert.equal(verdictsRes.status, 200);
  assert.equal(verdictsBody.total, candidates.length);
  assert.equal(verdictsBody.verdicts[0].candidateId, body.topCandidateId);
});

// ---------------------------------------------------------------------------
// Test 14: POST /api/arena/batch rejects invalid payloads
// ---------------------------------------------------------------------------

test("POST /api/arena/batch rejects empty and oversized payloads", async () => {
  allowOwnerApiSession();

  const emptyRes = await batchPOST(makeBatchRequest({ candidates: [] }));
  assert.equal(emptyRes.status, 400);

  const oversized = Array.from({ length: 101 }, (_, index) =>
    makeCandidate({ id: `oversized-${index}`, title: `Oversized ${index}` }),
  );
  const oversizedRes = await batchPOST(makeBatchRequest({ candidates: oversized }));
  assert.equal(oversizedRes.status, 400);
});

// ---------------------------------------------------------------------------
// Test 15: storeResults=false does not persist
// ---------------------------------------------------------------------------

test("POST /api/arena/batch with storeResults=false returns 200 without persisting", async () => {
  arenaServiceHarness = createArenaServiceHarness();
  allowOwnerApiSession();

  const res = await batchPOST(
    makeBatchRequest({
      candidates: makeBatchCandidates(),
      storeResults: false,
      limit: 3,
    }),
  );

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.stored, false);
  assert.equal(arenaServiceHarness.calls.length, 0);

  const verdictsRes = await verdictsGET(new Request("http://localhost/api/arena/verdicts"));
  const verdictsBody = await verdictsRes.json();
  assert.equal(verdictsRes.status, 200);
  assert.equal(verdictsBody.total, 0);
});

// ---------------------------------------------------------------------------
// Test 16: workspaceId client is overwritten by server workspace
// ---------------------------------------------------------------------------

test("POST /api/arena/batch overwrites client workspaceId and keeps workspaces isolated", async () => {
  arenaServiceHarness = createArenaServiceHarness();
  allowOwnerApiSession();

  const res = await batchPOST(
    makeBatchRequest({
      candidates: [
        makeCandidate({
          id: "batch-workspace",
          workspaceId: "client-workspace",
          assumedRevenueInfluencedCents: 110_000,
          estimatedCostCents: 5_000,
        }),
      ],
      limit: 1,
    }),
  );

  assert.equal(res.status, 200);
  assert.equal(arenaServiceHarness.calls[0].workspaceId, DEFAULT_WORKSPACE_SLUG);

  const verdictRes = await verdictByIdGET(
    new Request("http://localhost/api/arena/verdicts/batch-workspace"),
    { params: Promise.resolve({ candidateId: "batch-workspace" }) },
  );
  assert.equal(verdictRes.status, 200);
  const verdictBody = await verdictRes.json();
  assert.equal(verdictBody.candidateId, "batch-workspace");
});
