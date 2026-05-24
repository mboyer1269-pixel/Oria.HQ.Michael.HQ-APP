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

const evidencePath = path.join(projectRoot, "src/server/arena/arena-wra-evidence.ts");
const bucketsPath = path.join(projectRoot, "src/server/arena/arena-wra-buckets.ts");
const generatorPath = path.join(projectRoot, "src/server/arena/arena-candidate-generator.ts");

const { applyArenaWraEvidence } = await jiti.import(evidencePath);
const { buildArenaWraBuckets } = await jiti.import(bucketsPath);
const { generateArenaCandidatesFromMissions } = await jiti.import(generatorPath);

function makeMission(overrides = {}) {
  return {
    id: "mission-1",
    workspaceId: "source-workspace",
    modeId: "hq",
    title: "Mission Title",
    objective: "Mission objective",
    assignedAgentId: "joris",
    autonomyLevel: 2,
    status: "queued",
    riskLevel: "low",
    input: { scope: "test" },
    expectedOutput: "Expected output",
    requiresApproval: false,
    costBudgetCents: 10_000,
    createdAt: "2026-05-24T12:00:00.000Z",
    updatedAt: "2026-05-24T12:00:00.000Z",
    ...overrides,
  };
}

test("without evidence a mission remains not-evaluable and has no WRA bucket", () => {
  const candidates = generateArenaCandidatesFromMissions({
    missions: [makeMission()],
    workspaceId: "arena-workspace",
  });

  const result = buildArenaWraBuckets({ candidates });

  assert.equal(result.signals[0].arenaVerdict.decision, "not-evaluable");
  assert.equal(result.signals[0].bucket, null);
});

test("weak evidence with missing note or source defers the candidate", () => {
  const [candidate] = generateArenaCandidatesFromMissions({
    missions: [makeMission()],
    workspaceId: "arena-workspace",
  });

  const result = buildArenaWraBuckets({
    candidates: [applyArenaWraEvidence(candidate, {
      candidateId: candidate.id,
      assumedRevenueInfluencedCents: 8_000,
    })],
    evidenceByCandidateId: {
      [candidate.id]: {
        candidateId: candidate.id,
        assumedRevenueInfluencedCents: 8_000,
      },
    },
  });

  assert.equal(result.signals[0].bucket, "DEFER");
});

test("negative ROI kills the candidate", () => {
  const [candidate] = generateArenaCandidatesFromMissions({
    missions: [makeMission({ id: "mission-negative" })],
    workspaceId: "arena-workspace",
  });

  const enriched = applyArenaWraEvidence(candidate, {
    candidateId: candidate.id,
    assumedRevenueInfluencedCents: 30_000,
    estimatedCostCents: 50_000,
    note: "weekly seed",
    source: "manual",
  });

  const result = buildArenaWraBuckets({
    candidates: [enriched],
    evidenceByCandidateId: {
      [candidate.id]: {
        candidateId: candidate.id,
        assumedRevenueInfluencedCents: 30_000,
        estimatedCostCents: 50_000,
        note: "weekly seed",
        source: "manual",
      },
    },
  });

  assert.equal(result.signals[0].bucket, "KILL");
});

test("positive ROI with strong evidence and top rank is FOCUS", () => {
  const candidates = generateArenaCandidatesFromMissions({
    missions: [
      makeMission({ id: "mission-top", title: "Top", createdAt: "2026-05-24T12:00:00.000Z" }),
      makeMission({ id: "mission-second", title: "Second", createdAt: "2026-05-24T12:01:00.000Z" }),
    ],
    workspaceId: "arena-workspace",
  });

  const evidence = {
    "mission-top": {
      candidateId: "mission-top",
      assumedRevenueInfluencedCents: 90_000,
      estimatedCostCents: 10_000,
      note: "weekly seed",
      source: "manual",
    },
    "mission-second": {
      candidateId: "mission-second",
      assumedRevenueInfluencedCents: 30_000,
      estimatedCostCents: 10_000,
      note: "weekly seed",
      source: "manual",
    },
  };

  const enriched = candidates.map((candidate) => applyArenaWraEvidence(candidate, evidence[candidate.id]));
  const result = buildArenaWraBuckets({ candidates: enriched, evidenceByCandidateId: evidence });

  assert.equal(result.signals[0].bucket, "FOCUS");
  assert.equal(result.signals[1].bucket, "GO");
});

test("high risk and autonomy 5 never produce FOCUS automatically", () => {
  const [candidate] = generateArenaCandidatesFromMissions({
    missions: [makeMission({ id: "mission-risky", riskLevel: "high", autonomyLevel: 5 })],
    workspaceId: "arena-workspace",
  });

  const enriched = applyArenaWraEvidence(candidate, {
    candidateId: candidate.id,
    assumedRevenueInfluencedCents: 100_000,
    estimatedCostCents: 10_000,
    note: "weekly seed",
    source: "manual",
  });

  const result = buildArenaWraBuckets({
    candidates: [enriched],
    evidenceByCandidateId: {
      [candidate.id]: {
        candidateId: candidate.id,
        assumedRevenueInfluencedCents: 100_000,
        estimatedCostCents: 10_000,
        note: "weekly seed",
        source: "manual",
      },
    },
  });

  assert.equal(result.signals[0].bucket, "GO");
});
