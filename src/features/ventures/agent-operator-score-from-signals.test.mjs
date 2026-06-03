#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("Agent operator score from signals (loop closure)", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(path.join(__dirname, "agent-operator-score-from-signals.ts"));
  const {
    buildAgentRevenueOutcomesFromSignals,
    scoreAgentOperatorFromSignals,
    agentIdsFromSignals,
    scoreAllAgentOperatorsFromSignals,
  } = mod;

  const intakeMod = await jiti.import(path.join(__dirname, "cash-signal-intake.ts"));
  const { buildCashSignalIntake } = intakeMod;

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
      capturedAt: "2026-06-02T00:00:00.000Z",
    });
  }

  function marketSignal(agentId, idx) {
    return buildCashSignalIntake({
      signalId: `signal:${agentId}:${idx}`,
      packetId: `packet:${agentId}:${idx}`,
      ventureId: "venture-001",
      sourceAgentId: agentId,
      signalType: "email_reply",
      referenceId: `msg_${agentId}_${idx}`,
      isVerified: false,
      summary: `Buyer replied asking about pricing for the pilot (${idx}).`,
      capturedAt: "2026-06-02T00:00:00.000Z",
    });
  }

  await t.test("maps signals to one outcome each, preserving attribution", () => {
    const intakes = [verifiedCash("hermes", 1), marketSignal("hermes", 2)];
    const outcomes = buildAgentRevenueOutcomesFromSignals(intakes);
    assert.equal(outcomes.length, 2);
    assert.ok(outcomes.every((o) => o.agentId === "hermes"));
  });

  await t.test("verified cash lifts the agent's revenue impact", () => {
    const score = scoreAgentOperatorFromSignals("hermes", [verifiedCash("hermes", 1)]);
    assert.equal(score.agentId, "hermes");
    assert.ok(score.dimensionScores.revenueImpact > 0, "verified cash must move revenueImpact");
    assert.ok(score.totalOperatorScore > 0);
  });

  await t.test("filters by sourceAgentId — other agents' proof is ignored", () => {
    const intakes = [verifiedCash("hermes", 1), verifiedCash("orient", 1)];
    const score = scoreAgentOperatorFromSignals("hermes", intakes);
    // Only hermes' single outcome should inform the score; revenueImpact reflects
    // exactly one verified-cash outcome, not two.
    const both = scoreAgentOperatorFromSignals("hermes", [verifiedCash("hermes", 1)]);
    assert.equal(score.totalOperatorScore, both.totalOperatorScore);
  });

  await t.test("agentIdsFromSignals returns distinct ids in first-seen order", () => {
    const intakes = [marketSignal("b", 1), verifiedCash("a", 1), marketSignal("b", 2)];
    assert.deepEqual(agentIdsFromSignals(intakes), ["b", "a"]);
  });

  await t.test("scoreAllAgentOperatorsFromSignals scores each distinct agent once", () => {
    const intakes = [verifiedCash("hermes", 1), marketSignal("hermes", 2), marketSignal("orient", 1)];
    const scores = scoreAllAgentOperatorsFromSignals(intakes);
    assert.deepEqual(scores.map((s) => s.agentId), ["hermes", "orient"]);
  });

  await t.test("empty signals -> no scores", () => {
    assert.deepEqual(scoreAllAgentOperatorsFromSignals([]), []);
  });

  await t.test("imports no DB/server/runtime modules (pure connector)", () => {
    const sourceText = readFileSync(
      path.join(__dirname, "agent-operator-score-from-signals.ts"),
      "utf-8",
    );
    const imports = Array.from(sourceText.matchAll(/import[\s\S]*?;/g)).map((m) => m[0]).join("\n");
    assert.ok(!/supabase/i.test(imports), "must not import Supabase");
    assert.ok(!/runtime/i.test(imports), "must not import runtime modules");
    assert.ok(!/@\/server|src\/server|\.\.\/server/.test(imports), "must not import server modules");
  });
});
