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
const generatorPath = path.join(projectRoot, "src/server/arena/arena-candidate-generator.ts");
const arenaPath = path.join(projectRoot, "src/server/arena/roi-arena.ts");

const { applyArenaWraEvidence } = await jiti.import(evidencePath);
const { generateArenaCandidatesFromMissions } = await jiti.import(generatorPath);
const { evaluateCandidate } = await jiti.import(arenaPath);

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
    costBudgetCents: 12_500,
    createdAt: "2026-05-24T12:00:00.000Z",
    updatedAt: "2026-05-24T12:00:00.000Z",
    ...overrides,
  };
}

test("without evidence the generated mission candidate stays not-evaluable", () => {
  const [candidate] = generateArenaCandidatesFromMissions({
    missions: [makeMission()],
    workspaceId: "arena-workspace",
  });

  const verdict = evaluateCandidate(candidate);

  assert.equal(verdict.decision, "not-evaluable");
  assert.equal(candidate.assumedRevenueInfluencedCents, undefined);
});

test("evidence applied to a mission candidate makes it evaluable", () => {
  const [candidate] = generateArenaCandidatesFromMissions({
    missions: [makeMission()],
    workspaceId: "arena-workspace",
  });

  const enriched = applyArenaWraEvidence(candidate, {
    candidateId: candidate.id,
    assumedRevenueInfluencedCents: 60_000,
    estimatedCostCents: 12_500,
    note: "Manual weekly evidence seed",
    source: "wra:seed",
  });

  const verdict = evaluateCandidate(enriched);

  assert.equal(verdict.decision !== "not-evaluable", true);
  assert.equal(enriched.assumedRevenueInfluencedCents, 60_000);
  assert.equal(enriched.estimatedCostCents, 12_500);
});

test("evidence never invents revenue for unrelated candidates", () => {
  const [candidate] = generateArenaCandidatesFromMissions({
    missions: [makeMission({ id: "mission-x" })],
    workspaceId: "arena-workspace",
  });

  const enriched = applyArenaWraEvidence(candidate, {
    candidateId: "other-id",
    assumedRevenueInfluencedCents: 99_999,
    note: "unused",
    source: "seed",
  });

  assert.equal(enriched.assumedRevenueInfluencedCents, undefined);
  assert.equal(enriched.estimatedCostCents, 12_500);
});
