#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("AgentScoreSnapshot model", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(path.join(__dirname, "agent-score-snapshot.ts"));
  const { buildAgentScoreSnapshot, validateAgentScoreSnapshot } = mod;
  const scoreMod = await jiti.import(path.join(__dirname, "auto-agent-operator-score.ts"));
  const { scoreAgentOperator } = scoreMod;
  const fromSignals = await jiti.import(path.join(__dirname, "agent-operator-score-from-signals.ts"));
  const { scoreAgentOperatorFromSignals } = fromSignals;
  const intakeMod = await jiti.import(path.join(__dirname, "cash-signal-intake.ts"));
  const { buildCashSignalIntake } = intakeMod;

  const AT = "2026-06-02T00:00:00.000Z";

  function richScore() {
    const intake = buildCashSignalIntake({
      signalId: "signal:1",
      packetId: "packet:1",
      ventureId: "venture-001",
      sourceAgentId: "hermes",
      signalType: "stripe_charge",
      referenceId: "ch_1",
      isVerified: true,
      amountCents: 49_000,
      summary: "Buyer paid the $490 pilot via verified Stripe charge ch_1.",
      capturedAt: AT,
    });
    return scoreAgentOperatorFromSignals("hermes", [intake]);
  }

  await t.test("builds a valid snapshot from a live score", () => {
    const snap = buildAgentScoreSnapshot({ score: richScore(), scoredAt: AT, outcomeCount: 1 });
    const result = validateAgentScoreSnapshot(snap);
    assert.equal(result.valid, true, JSON.stringify(result.errors));
    assert.equal(snap.agentId, "hermes");
    assert.equal(snap.outcomeCount, 1);
  });

  await t.test("derives a deterministic snapshotId from agent + scoredAt", () => {
    const snap = buildAgentScoreSnapshot({ score: richScore(), scoredAt: AT, outcomeCount: 1 });
    assert.equal(snap.snapshotId, `hermes_score_${AT}`);
  });

  await t.test("handles a zero-evidence score (insufficient_evidence)", () => {
    const empty = scoreAgentOperator("hermes", []);
    const snap = buildAgentScoreSnapshot({ score: empty, scoredAt: AT, outcomeCount: 0 });
    assert.equal(validateAgentScoreSnapshot(snap).valid, true);
    assert.equal(snap.operatorStatus, "insufficient_evidence");
  });

  await t.test("rejects an out-of-range score", () => {
    const snap = buildAgentScoreSnapshot({ score: richScore(), scoredAt: AT, outcomeCount: 1 });
    const broken = { ...snap, totalOperatorScore: 150 };
    const result = validateAgentScoreSnapshot(broken);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("totalOperatorScore")));
  });

  await t.test("rejects a negative outcomeCount", () => {
    const snap = buildAgentScoreSnapshot({ score: richScore(), scoredAt: AT, outcomeCount: 1 });
    const result = validateAgentScoreSnapshot({ ...snap, outcomeCount: -1 });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("outcomeCount")));
  });

  await t.test("copies dimensionScores (no shared reference)", () => {
    const score = richScore();
    const snap = buildAgentScoreSnapshot({ score, scoredAt: AT, outcomeCount: 1 });
    snap.dimensionScores.revenueImpact = -999;
    assert.notEqual(score.dimensionScores.revenueImpact, -999);
  });

  await t.test("imports no DB/server/runtime modules (pure model)", () => {
    const sourceText = readFileSync(path.join(__dirname, "agent-score-snapshot.ts"), "utf-8");
    const imports = Array.from(sourceText.matchAll(/import[\s\S]*?;/g)).map((m) => m[0]).join("\n");
    assert.ok(!/supabase/i.test(imports), "must not import Supabase");
    assert.ok(!/@\/server|src\/server|\.\.\/server/.test(imports), "must not import server modules");
  });
});
