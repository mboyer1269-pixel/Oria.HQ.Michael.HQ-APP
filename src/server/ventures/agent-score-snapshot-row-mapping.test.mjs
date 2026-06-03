#!/usr/bin/env node

// src/server/ventures/agent-score-snapshot-row-mapping.test.mjs

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("Agent score snapshot row mapping", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mapMod = await jiti.import(path.join(__dirname, "agent-score-snapshot-row-mapping.ts"));
  const featureDir = path.join(projectRoot, "src/features/ventures");
  const snapMod = await jiti.import(path.join(featureDir, "agent-score-snapshot.ts"));
  const scoreMod = await jiti.import(path.join(featureDir, "auto-agent-operator-score.ts"));

  const { mapSnapshotToInsert, mapRowToSnapshot, AgentScoreSnapshotMappingError } = mapMod;
  const { buildAgentScoreSnapshot, validateAgentScoreSnapshot } = snapMod;
  const { scoreAgentOperator } = scoreMod;

  const USER = "11111111-1111-1111-1111-111111111111";
  const AT = "2026-06-02T00:00:00.000Z";

  function makeSnapshot() {
    return buildAgentScoreSnapshot({ score: scoreAgentOperator("hermes", []), scoredAt: AT, outcomeCount: 0 });
  }

  await t.test("round-trips snapshot -> insert(row) -> snapshot", () => {
    const snap = makeSnapshot();
    const insert = mapSnapshotToInsert("ws1", USER, snap);
    assert.equal(insert.workspace_id, "ws1");
    assert.equal(insert.created_by_user_id, USER);
    assert.equal(insert.agent_id, "hermes");
    assert.equal(insert.id, undefined, "DB assigns the id");

    const row = { ...insert, id: "row-1", created_at: AT };
    const back = mapRowToSnapshot(row);
    assert.equal(validateAgentScoreSnapshot(back).valid, true);
    assert.equal(back.snapshotId, snap.snapshotId);
    assert.deepEqual(back.dimensionScores, snap.dimensionScores);
  });

  await t.test("rejects a row with an invalid band", () => {
    const insert = mapSnapshotToInsert("ws1", USER, makeSnapshot());
    const row = { ...insert, id: "r", created_at: AT, operator_score_band: "godlike" };
    assert.throws(
      () => mapRowToSnapshot(row),
      (err) => err instanceof AgentScoreSnapshotMappingError && /band/i.test(err.message),
    );
  });

  await t.test("rejects a row with a missing dimension", () => {
    const insert = mapSnapshotToInsert("ws1", USER, makeSnapshot());
    const partialDims = { ...insert.dimension_scores };
    delete partialDims.revenueImpact;
    const row = { ...insert, id: "r", created_at: AT, dimension_scores: partialDims };
    assert.throws(
      () => mapRowToSnapshot(row),
      (err) => err instanceof AgentScoreSnapshotMappingError && /revenueImpact/i.test(err.message),
    );
  });
});
