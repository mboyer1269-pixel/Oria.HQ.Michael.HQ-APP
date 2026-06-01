#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

const FORBIDDEN_HISTORICAL_NAMES = [
  "MCL",
  "Suivia",
  "NOORKI",
  "Dad School",
  "DADZCO",
  "MUMZCO",
  "APPAREL",
];

function cloneCard(card, overrides = {}) {
  return {
    ...card,
    ...overrides,
    score: Object.prototype.hasOwnProperty.call(overrides, "score") ? overrides.score : card.score,
    decisions: Object.prototype.hasOwnProperty.call(overrides, "decisions")
      ? overrides.decisions
      : card.decisions,
  };
}

test("Venture cockpit helper", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const cockpitMod = await jiti.import(path.join(__dirname, "venture-cockpit.ts"));
  const { buildVentureCockpit } = cockpitMod;
  const { ventureSeedCards } = await jiti.import(
    path.join(projectRoot, "src/features/ventures/seed.ts"),
  );

  const demoCard = cloneCard(ventureSeedCards[3], { id: "venture-cockpit-demo-card" });
  const unscoredCandidate = cloneCard(ventureSeedCards[5], {
    id: "venture-cockpit-candidate-unscored",
    status: "candidate",
    score: undefined,
  });
  const scoredGo = cloneCard(ventureSeedCards[1], {
    id: "venture-cockpit-scored-go",
    status: "scored",
  });
  const scoredTestSmall = cloneCard(ventureSeedCards[0], {
    id: "venture-cockpit-scored-test-small",
    status: "scored",
  });
  const scoredHold = cloneCard(ventureSeedCards[4], {
    id: "venture-cockpit-scored-hold",
    status: "scored",
  });
  const scoredKill = cloneCard(ventureSeedCards[1], {
    id: "venture-cockpit-scored-kill",
    status: "scored",
    score: {
      ...ventureSeedCards[1].score,
      overallScore: 36,
      recommendation: "kill",
    },
  });
  const validating = cloneCard(ventureSeedCards[2], {
    id: "venture-cockpit-validating",
    status: "validating",
  });
  const archived = cloneCard(ventureSeedCards[0], {
    id: "venture-cockpit-archived",
    status: "archived",
    score: undefined,
  });

  const cockpit = buildVentureCockpit({
    savedCards: [
      unscoredCandidate,
      scoredGo,
      scoredTestSmall,
      scoredHold,
      scoredKill,
      validating,
      archived,
    ],
    demoCards: [demoCard],
  });

  await t.test("counts by status and recommendation are tallied from saved ventures", () => {
    assert.equal(cockpit.totalVentures, 8);
    assert.equal(cockpit.demoCount, 1);
    assert.equal(cockpit.savedCount, 7);
    assert.equal(cockpit.scoredCount, 5);
    assert.equal(cockpit.unscoredCandidateCount, 1);
    assert.equal(cockpit.activeValidationCount, 1);
    assert.equal(cockpit.activeValidationSlotLimit, 3);
    assert.equal(cockpit.activeValidationSlotsRemaining, 2);
    assert.equal(cockpit.terminalCount, 1);
    assert.equal(cockpit.countsByStatus.candidate, 1);
    assert.equal(cockpit.countsByStatus.scored, 4);
    assert.equal(cockpit.countsByStatus.validating, 1);
    assert.equal(cockpit.countsByStatus.archived, 1);
    assert.equal(cockpit.countsByRecommendation.go, 1);
    assert.equal(cockpit.countsByRecommendation.test_small, 2);
    assert.equal(cockpit.countsByRecommendation.hold, 1);
    assert.equal(cockpit.countsByRecommendation.kill, 1);
  });

  await t.test("decision queue prioritizes an unscored candidate first", () => {
    assert.equal(cockpit.nextRecommendedDecision?.ventureId, "venture-cockpit-candidate-unscored");
    assert.equal(cockpit.decisionQueue[0].suggestedAction, "Score this candidate");
    assert.match(cockpit.decisionQueue[0].reason, /unscored/i);
  });

  await t.test("go and test_small scored ventures suggest promotion review", () => {
    const promoteItems = cockpit.decisionQueue.filter(
      (item) => item.recommendation === "go" || item.recommendation === "test_small",
    );
    assert.equal(promoteItems.length, 2);
    for (const item of promoteItems) {
      assert.equal(item.suggestedAction, "Consider promoting");
      assert.match(item.reason, /Recommendation/);
    }
  });

  await t.test("kill recommendation suggests a kill review", () => {
    const killItem = cockpit.decisionQueue.find((item) => item.recommendation === "kill");
    assert.ok(killItem);
    assert.equal(killItem.suggestedAction, "Consider kill decision");
    assert.match(killItem.reason, /Kill band/);
  });

  await t.test("terminal ventures do not require an active decision", () => {
    const terminalCockpit = buildVentureCockpit({
      savedCards: [cloneCard(ventureSeedCards[0], { id: "venture-cockpit-terminal", status: "archived" })],
      demoCards: [],
    });

    assert.equal(terminalCockpit.decisionQueue[0].suggestedAction, "No active decision");
    assert.match(terminalCockpit.decisionQueue[0].reason, /Terminal venture/);
  });

  await t.test("no historical venture names are required or used", () => {
    const blob = JSON.stringify(cockpit);
    for (const forbidden of FORBIDDEN_HISTORICAL_NAMES) {
      assert.equal(blob.includes(forbidden), false, `cockpit output must not reference "${forbidden}"`);
    }
  });
});
