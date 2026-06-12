#!/usr/bin/env node
// Tests for candidate attribution on stored arena verdicts:
// snapshot extraction, store round-trip, evaluation service wiring,
// repository payload envelope (+ legacy back-compat), and the
// learning-loop attribution path.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

async function loadModules() {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });
  const store = await jiti.import(path.join(__dirname, "arena-verdict-store.ts"));
  const service = await jiti.import(path.join(__dirname, "arena-evaluation-service.ts"));
  const repository = await jiti.import(path.join(__dirname, "arena-verdict-repository.ts"));
  const loop = await jiti.import(
    path.join(projectRoot, "src/server/memory/agent-learning-loop.ts"),
  );
  return { store, service, repository, loop };
}

function makeCandidate(overrides = {}) {
  return {
    id: "cand-1",
    kind: "agent-action",
    title: "Relance pipeline loi96",
    workspaceId: "michael-hq",
    agentId: "joris",
    skillId: "outbound-prep",
    missionId: "mission-7",
    assumedRevenueInfluencedCents: 50_000,
    estimatedCostCents: 10_000,
    ...overrides,
  };
}

function makeVerdict(overrides = {}) {
  return {
    candidateId: "cand-1",
    kind: "agent-action",
    decision: "promising",
    score: 75,
    netValueCents: 40_000,
    roiMultiple: 5,
    executable: false,
    reasons: [],
    ...overrides,
  };
}

test("snapshotCandidateAttribution: identity fields only, absent fields omitted", async () => {
  const { store } = await loadModules();

  const full = store.snapshotCandidateAttribution(makeCandidate());
  assert.deepEqual(full, {
    kind: "agent-action",
    title: "Relance pipeline loi96",
    agentId: "joris",
    skillId: "outbound-prep",
    missionId: "mission-7",
  });
  // Financial figures never ride in the snapshot.
  assert.ok(!("assumedRevenueInfluencedCents" in full));
  assert.ok(!("estimatedCostCents" in full));

  const bare = store.snapshotCandidateAttribution(
    makeCandidate({ title: undefined, agentId: undefined, skillId: undefined, missionId: undefined }),
  );
  assert.deepEqual(bare, { kind: "agent-action" });
});

test("verdict store: candidate snapshot round-trips, absent stays absent", async () => {
  const { store } = await loadModules();

  const verdictStore = store.createArenaVerdictStore();
  const attribution = { kind: "agent-action", agentId: "joris" };

  const stored = verdictStore.store(makeVerdict(), attribution);
  assert.deepEqual(stored.candidate, attribution);
  assert.deepEqual(verdictStore.get("cand-1").candidate, attribution);
  assert.deepEqual(verdictStore.list()[0].candidate, attribution);

  // Defensive copy — mutating the caller's object does not leak into the store.
  attribution.agentId = "mutated";
  assert.equal(verdictStore.get("cand-1").candidate.agentId, "joris");

  // Without attribution, the field is absent (legacy shape preserved).
  const legacy = verdictStore.store(makeVerdict({ candidateId: "cand-2" }));
  assert.ok(!("candidate" in legacy));
});

test("evaluation service: evaluateAndStore attaches attribution end-to-end", async () => {
  const { service, store } = await loadModules();

  const verdictStore = store.createArenaVerdictStore();
  const recorded = [];
  const evaluationService = service.createArenaEvaluationService({
    store: verdictStore,
    repository: {
      async recordArenaVerdict(workspaceId, record) {
        recorded.push({ workspaceId, record });
      },
      async getArenaVerdictByCandidateId() {
        return null;
      },
      async listArenaVerdicts() {
        return [];
      },
    },
  });

  const result = await evaluationService.evaluateAndStore(makeCandidate());
  assert.equal(result.candidate.agentId, "joris");
  assert.equal(result.candidate.skillId, "outbound-prep");
  assert.equal(result.candidate.missionId, "mission-7");

  // The persisted record carries the same attribution.
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].workspaceId, "michael-hq");
  assert.deepEqual(recorded[0].record.candidate, result.candidate);
});

test("repository payload: envelope round-trip and legacy back-compat", async () => {
  const { repository } = await loadModules();

  // With attribution: packed as a versioned envelope, unpacks identically.
  const record = {
    candidateId: "cand-1",
    verdict: makeVerdict(),
    storedAt: "2026-06-12T12:00:00.000Z",
    expiresAt: null,
    candidate: { kind: "agent-action", agentId: "joris" },
  };
  const packed = repository.packVerdictPayload(record);
  assert.equal(packed.__v, 2);
  const unpacked = repository.unpackVerdictPayload(packed);
  assert.deepEqual(unpacked.verdict, record.verdict);
  assert.deepEqual(unpacked.candidate, record.candidate);

  // Without attribution: raw verdict, no envelope.
  const rawPacked = repository.packVerdictPayload({ ...record, candidate: undefined });
  assert.equal(rawPacked.__v, undefined);
  assert.equal(rawPacked.candidateId, "cand-1");

  // Legacy rows (raw verdict Json) unpack with no candidate.
  const legacy = repository.unpackVerdictPayload(makeVerdict());
  assert.deepEqual(legacy.verdict, makeVerdict());
  assert.equal(legacy.candidate, undefined);
});

test("learning loop: stored attribution flows into agent ROI summaries", async () => {
  const { service, store, loop } = await loadModules();

  const evaluationService = service.createArenaEvaluationService({
    store: store.createArenaVerdictStore(),
    repository: null,
  });

  await evaluationService.evaluateAndStore(makeCandidate({ id: "c1" }));
  await evaluationService.evaluateAndStore(
    makeCandidate({ id: "c2", agentId: "hermes", skillId: undefined }),
  );

  const stored = await evaluationService.listVerdicts();
  const signals = stored.map((entry) => loop.adaptStoredVerdict(entry, entry.candidate));
  const summaries = loop.buildAgentRoiSummaries(signals);

  const keys = summaries.map((s) => s.agentKey).sort();
  assert.deepEqual(keys, ["hermes", "joris"]);
  assert.ok(!keys.includes(loop.UNATTRIBUTED_AGENT_KEY));
});
