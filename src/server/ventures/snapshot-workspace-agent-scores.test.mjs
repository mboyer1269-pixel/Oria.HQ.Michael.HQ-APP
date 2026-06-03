#!/usr/bin/env node

// src/server/ventures/snapshot-workspace-agent-scores.test.mjs

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

test("Snapshot workspace agent scores (loop A+B orchestration)", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(path.join(__dirname, "snapshot-workspace-agent-scores.ts"));
  const repoMod = await jiti.import(path.join(__dirname, "agent-score-snapshot-repository.ts"));
  const featureDir = path.join(projectRoot, "src/features/ventures");
  const intakeMod = await jiti.import(path.join(featureDir, "cash-signal-intake.ts"));

  const { snapshotWorkspaceAgentScores } = mod;
  const { listAgentScoreSnapshotsForWorkspace, __clearAgentScoreSnapshotsForTests } = repoMod;
  const { buildCashSignalIntake } = intakeMod;

  const USER = "11111111-1111-1111-1111-111111111111";
  const AT = "2026-06-02T00:00:00.000Z";

  function verifiedCash(agentId, idx) {
    return buildCashSignalIntake({
      signalId: `signal:${agentId}:${idx}`,
      packetId: `packet:${agentId}:${idx}`,
      ventureId: "venture-001",
      sourceAgentId: agentId,
      signalType: "stripe_charge",
      referenceId: `ch_${agentId}_${idx}`,
      isVerified: true,
      amountCents: 49_000,
      summary: `Buyer paid the $490 pilot via verified Stripe charge ch_${agentId}_${idx}.`,
      capturedAt: AT,
    });
  }

  t.beforeEach(() => __clearAgentScoreSnapshotsForTests());
  t.afterEach(() => __clearAgentScoreSnapshotsForTests());

  await t.test("scores each agent with proof and persists one snapshot per agent", async () => {
    const captured = [];
    const result = await snapshotWorkspaceAgentScores(
      { workspaceId: "ws1", userId: USER },
      {
        listSignals: async () => [verifiedCash("hermes", 1), verifiedCash("hermes", 2), verifiedCash("orient", 1)],
        persistSnapshot: async (_ws, _uid, snap) => { captured.push(snap); return snap; },
        now: () => AT,
      },
    );

    assert.equal(result.agentsScored, 2);
    assert.equal(result.signalsConsidered, 3);
    assert.equal(result.snapshots.length, 2);
    assert.deepEqual(captured.map((s) => s.agentId).sort(), ["hermes", "orient"]);

    const hermes = captured.find((s) => s.agentId === "hermes");
    assert.equal(hermes.outcomeCount, 2, "hermes owned two signals");
    assert.equal(hermes.scoredAt, AT);
    assert.ok(hermes.totalOperatorScore > 0);
  });

  await t.test("no signals -> no snapshots", async () => {
    const result = await snapshotWorkspaceAgentScores(
      { workspaceId: "ws1", userId: USER },
      { listSignals: async () => [], now: () => AT },
    );
    assert.equal(result.agentsScored, 0);
    assert.equal(result.snapshots.length, 0);
  });

  await t.test("default persistence writes through the repository local fallback (no DB)", async () => {
    const result = await snapshotWorkspaceAgentScores(
      { workspaceId: "ws-repo", userId: USER },
      { listSignals: async () => [verifiedCash("hermes", 1)], now: () => AT },
    );
    assert.equal(result.snapshots.length, 1);
    const persisted = await listAgentScoreSnapshotsForWorkspace("ws-repo");
    assert.equal(persisted.length, 1);
    assert.equal(persisted[0].agentId, "hermes");
  });
});
