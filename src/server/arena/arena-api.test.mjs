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

// Import route handlers directly — no running server needed.
const evaluateRoutePath = path.join(projectRoot, "src/app/api/arena/evaluate/route.ts");
const verdictsRoutePath = path.join(projectRoot, "src/app/api/arena/verdicts/route.ts");
const candidateIdRoutePath = path.join(
  projectRoot,
  "src/app/api/arena/verdicts/[candidateId]/route.ts",
);

const { POST: evaluatePOST } = await jiti.import(evaluateRoutePath);
const { GET: verdictsGET } = await jiti.import(verdictsRoutePath);
const { GET: verdictByIdGET } = await jiti.import(candidateIdRoutePath);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body) {
  return new Request("http://localhost/api/arena/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeCandidate(overrides = {}) {
  return {
    id: `test-api-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    kind: "mission",
    title: "API Test Mission",
    workspaceId: "ws-api-test",
    skillId: "board.consult",
    agentId: "joris",
    autonomyLevel: 1,
    riskLevel: "low",
    assumedRevenueInfluencedCents: 50_000,
    estimatedCostCents: 5_000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test 1: POST evaluate with valid mission → 200 + verdict stored
// ---------------------------------------------------------------------------

test("POST /api/arena/evaluate with valid mission returns 200 and verdict", async () => {
  const candidate = makeCandidate();
  const res = await evaluatePOST(makeRequest({ candidate }));

  assert.equal(res.status, 200);
  const data = await res.json();

  assert.equal(data.candidateId, candidate.id);
  assert.ok(typeof data.verdict === "object");
  assert.ok(typeof data.verdict.decision === "string");
  assert.ok(typeof data.verdict.score === "number");
  assert.ok(typeof data.storedAt === "string");
  // expiresAt is null for defaultArenaEvaluationService (no TTL)
  assert.equal(data.expiresAt, null);
});

// ---------------------------------------------------------------------------
// Test 2: POST evaluate with missing ROI data → 200 + not-evaluable
// ---------------------------------------------------------------------------

test("POST /api/arena/evaluate with missing ROI data returns 200 not-evaluable", async () => {
  const candidate = makeCandidate({
    assumedRevenueInfluencedCents: undefined,
    estimatedCostCents: undefined,
  });
  const res = await evaluatePOST(makeRequest({ candidate }));

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.verdict.decision, "not-evaluable");
  assert.equal(data.verdict.netValueCents, null);
});

// ---------------------------------------------------------------------------
// Test 3: POST evaluate with invalid payload → 400
// ---------------------------------------------------------------------------

test("POST /api/arena/evaluate with invalid payload returns 400", async () => {
  // Missing required fields
  const res = await evaluatePOST(makeRequest({ candidate: { kind: "mission" } }));

  assert.equal(res.status, 400);
  const data = await res.json();
  assert.ok(typeof data.error === "string");
  assert.ok("issues" in data);
});

// ---------------------------------------------------------------------------
// Test 4: GET verdicts returns array
// ---------------------------------------------------------------------------

test("GET /api/arena/verdicts returns a verdicts array", async () => {
  // Seed at least one verdict
  const candidate = makeCandidate();
  await evaluatePOST(makeRequest({ candidate }));

  const res = await verdictsGET();
  assert.equal(res.status, 200);

  const data = await res.json();
  assert.ok(Array.isArray(data.verdicts));
  assert.ok(typeof data.total === "number");
  assert.ok(data.total >= 1);
  // Our candidate must be in the list
  const found = data.verdicts.some((v) => v.candidateId === candidate.id);
  assert.ok(found, `Expected candidate ${candidate.id} in verdicts list`);
});

// ---------------------------------------------------------------------------
// Test 5: GET /api/arena/verdicts/[candidateId] returns 200 for known verdict
// ---------------------------------------------------------------------------

test("GET /api/arena/verdicts/[candidateId] returns 200 for a stored verdict", async () => {
  const candidate = makeCandidate();
  await evaluatePOST(makeRequest({ candidate }));

  const res = await verdictByIdGET(
    new Request(`http://localhost/api/arena/verdicts/${candidate.id}`),
    { params: Promise.resolve({ candidateId: candidate.id }) },
  );

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.candidateId, candidate.id);
  assert.ok(typeof data.verdict === "object");
});

// ---------------------------------------------------------------------------
// Test 6: GET /api/arena/verdicts/[candidateId] returns 404 for unknown id
// ---------------------------------------------------------------------------

test("GET /api/arena/verdicts/[candidateId] returns 404 for unknown candidateId", async () => {
  const res = await verdictByIdGET(
    new Request("http://localhost/api/arena/verdicts/does-not-exist-ever"),
    { params: Promise.resolve({ candidateId: "does-not-exist-ever" }) },
  );

  assert.equal(res.status, 404);
  const data = await res.json();
  assert.ok(typeof data.error === "string");
});

// ---------------------------------------------------------------------------
// Test 7: response contains no DB / ledger / calendar surface
// ---------------------------------------------------------------------------

test("evaluate response contains no DB, ledger, calendar or write surface", async () => {
  const candidate = makeCandidate();
  const res = await evaluatePOST(makeRequest({ candidate }));
  const data = await res.json();

  const forbidden = ["supabase", "ledger", "calendar", "write", "persist", "sql"];
  const keys = Object.keys(data).concat(Object.keys(data.verdict ?? {}));
  for (const key of keys) {
    for (const f of forbidden) {
      assert.ok(
        !key.toLowerCase().includes(f),
        `Response key "${key}" suggests forbidden surface "${f}"`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// Test 8: effectful skill returns not-evaluable
// ---------------------------------------------------------------------------

test("POST /api/arena/evaluate with effectful skill returns not-evaluable", async () => {
  const candidate = makeCandidate({ skillId: "calendar.book", agentId: "joris" });
  const res = await evaluatePOST(makeRequest({ candidate }));

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.verdict.decision, "not-evaluable");
  assert.equal(data.verdict.executable, false);
  assert.ok(typeof data.verdict.guardReason === "string" && data.verdict.guardReason.length > 0);
});
