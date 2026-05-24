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

const generatorPath = path.join(projectRoot, "src/server/arena/arena-candidate-generator.ts");
const batchServicePath = path.join(projectRoot, "src/server/arena/arena-batch-service.ts");

const arenaGeneratorModule = await jiti.import(generatorPath);
const { generateArenaCandidatesFromMissions } = arenaGeneratorModule;
const { evaluateBatch } = await jiti.import(batchServicePath);

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
    costBudgetCents: 1250,
    createdAt: "2026-05-24T12:00:00.000Z",
    updatedAt: "2026-05-24T12:00:00.000Z",
    ...overrides,
  };
}

test("generateArenaCandidatesFromMissions maps actionable missions to ArenaCandidate objects", () => {
  const missions = [
    makeMission({
      id: "mission-queued",
      status: "queued",
      createdAt: "2026-05-24T08:00:00.000Z",
    }),
    makeMission({
      id: "mission-running",
      status: "running",
      title: "Running Mission",
      assignedAgentId: "builder",
      createdAt: "2026-05-24T09:00:00.000Z",
      costBudgetCents: undefined,
    }),
    makeMission({
      id: "mission-draft",
      status: "draft",
      title: "Draft Mission",
      createdAt: "2026-05-24T10:00:00.000Z",
    }),
    makeMission({
      id: "mission-cancelled",
      status: "cancelled",
      title: "Cancelled Mission",
      createdAt: "2026-05-24T11:00:00.000Z",
    }),
  ];

  const candidates = generateArenaCandidatesFromMissions({
    missions,
    workspaceId: "arena-workspace",
  });

  assert.equal(candidates.length, 2);
  assert.deepEqual(
    candidates.map((candidate) => candidate.id),
    ["mission-queued", "mission-running"],
  );
  assert.ok(candidates.every((candidate) => candidate.kind === "mission"));
  assert.ok(candidates.every((candidate) => candidate.workspaceId === "arena-workspace"));
  assert.equal(candidates[0].missionId, "mission-queued");
  assert.equal(candidates[0].title, "Mission Title");
  assert.equal(candidates[0].objective, "Mission objective");
  assert.equal(candidates[0].agentId, "joris");
  assert.equal(candidates[0].expectedOutput, "Expected output");
  assert.equal(candidates[0].estimatedCostCents, 1250);
  assert.equal(candidates[0].assumedRevenueInfluencedCents, undefined);
});

test("generateArenaCandidatesFromMissions includes draft missions only when includeNotReady is true", () => {
  const missions = [
    makeMission({ id: "mission-draft", status: "draft" }),
    makeMission({ id: "mission-queued", status: "queued" }),
  ];

  const defaultCandidates = generateArenaCandidatesFromMissions({
    missions,
    workspaceId: "arena-workspace",
  });

  const includeNotReadyCandidates = generateArenaCandidatesFromMissions({
    missions,
    workspaceId: "arena-workspace",
    options: { includeNotReady: true },
  });

  assert.equal(defaultCandidates.length, 1);
  assert.equal(defaultCandidates[0].id, "mission-queued");
  assert.equal(includeNotReadyCandidates.length, 2);
  assert.deepEqual(
    includeNotReadyCandidates.map((candidate) => candidate.id),
    ["mission-draft", "mission-queued"],
  );
});

test("generateArenaCandidatesFromMissions is deterministic and does not invent revenue", () => {
  const missions = [
    makeMission({ id: "mission-b", createdAt: "2026-05-24T09:00:00.000Z" }),
    makeMission({ id: "mission-a", createdAt: "2026-05-24T08:00:00.000Z" }),
  ];

  const first = generateArenaCandidatesFromMissions({
    missions,
    workspaceId: "arena-workspace",
  });
  const second = generateArenaCandidatesFromMissions({
    missions,
    workspaceId: "arena-workspace",
  });

  assert.deepEqual(first, second);
  assert.ok(first.every((candidate) => candidate.assumedRevenueInfluencedCents === undefined));
});

test("generateArenaCandidatesFromMissions applies the limit option", () => {
  const missions = [
    makeMission({ id: "mission-1", createdAt: "2026-05-24T08:00:00.000Z" }),
    makeMission({ id: "mission-2", createdAt: "2026-05-24T09:00:00.000Z" }),
    makeMission({ id: "mission-3", createdAt: "2026-05-24T10:00:00.000Z" }),
  ];

  const candidates = generateArenaCandidatesFromMissions({
    missions,
    workspaceId: "arena-workspace",
    options: { limit: 2 },
  });

  assert.equal(candidates.length, 2);
  assert.deepEqual(
    candidates.map((candidate) => candidate.id),
    ["mission-1", "mission-2"],
  );
});

test("generated mission candidates remain compatible with batch evaluation", () => {
  const candidates = generateArenaCandidatesFromMissions({
    missions: [
      makeMission({ id: "mission-1", createdAt: "2026-05-24T08:00:00.000Z" }),
      makeMission({ id: "mission-2", createdAt: "2026-05-24T09:00:00.000Z" }),
    ],
    workspaceId: "arena-workspace",
  });

  const summary = evaluateBatch({
    workspaceId: "arena-workspace",
    candidates,
    limit: 10,
  });

  assert.equal(summary.total, 2);
  assert.equal(summary.verdicts.length, 2);
  assert.ok(summary.verdicts.every((verdict) => verdict.decision === "not-evaluable"));
});

test("ideas generator is not implemented yet", () => {
  assert.equal("generateArenaCandidatesFromIdeas" in arenaGeneratorModule, false);
});
