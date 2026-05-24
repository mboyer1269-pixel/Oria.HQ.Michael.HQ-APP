#!/usr/bin/env node

// PR9 — Auth-focused API tests.
// In the test environment (no Supabase env vars), requireOwnerApiSession()
// returns 401 for all requests. These tests verify that auth guard is in
// place on all arena routes — no unauthenticated access is permitted.

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

const { POST: evaluatePOST } = await jiti.import(evaluateRoutePath);
const { GET: verdictsGET } = await jiti.import(verdictsRoutePath);
const { GET: verdictByIdGET } = await jiti.import(candidateIdRoutePath);

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
// Test 4: GET /api/arena/verdicts returns 401 for unauthenticated request
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
// Test 5: GET /api/arena/verdicts 401 body must not leak verdict data
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
// Test 6: GET /api/arena/verdicts/[candidateId] returns 401 for unknown candidateId
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
// Test 7: GET /api/arena/verdicts/[candidateId] 401 must not leak verdict data
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
// Test 8: all three routes return JSON content-type on 401
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
