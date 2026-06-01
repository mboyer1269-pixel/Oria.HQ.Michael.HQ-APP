#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

function makeScores(overrides = {}) {
  return {
    revenuePotential: 8,
    speedToFirstDollar: 7,
    costToValidate: 2,
    automationPotential: 8,
    ownerInvolvementRequired: 3,
    marketPain: 8,
    differentiation: 7,
    executionDifficulty: 3,
    risk: 3,
    grossMarginPotential: 8,
    strategicFit: 8,
    ...overrides,
  };
}

test("Venture scoring helper (PR152)", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const scoringMod = await jiti.import(path.join(__dirname, "venture-scoring.ts"));
  const {
    SCORE_DIMENSIONS,
    buildVentureScore,
    computeOverallScore,
    deriveRecommendation,
    isValidSubScores,
  } = scoringMod;

  await t.test("covers exactly the 11 VentureScore sub-score dimensions", () => {
    assert.deepEqual(
      SCORE_DIMENSIONS.map((dimension) => dimension.key),
      [
        "revenuePotential",
        "speedToFirstDollar",
        "costToValidate",
        "automationPotential",
        "ownerInvolvementRequired",
        "marketPain",
        "differentiation",
        "executionDifficulty",
        "risk",
        "grossMarginPotential",
        "strategicFit",
      ],
    );
  });

  await t.test("computes a normalized overall score", () => {
    assert.equal(computeOverallScore(makeScores()), 75);
  });

  await t.test("high risk, execution difficulty, and owner involvement lower the score", () => {
    const lowFriction = computeOverallScore(
      makeScores({ ownerInvolvementRequired: 1, executionDifficulty: 1, risk: 1 }),
    );
    const highFriction = computeOverallScore(
      makeScores({ ownerInvolvementRequired: 9, executionDifficulty: 9, risk: 9 }),
    );

    assert.equal(lowFriction, 81);
    assert.equal(highFriction, 59);
    assert.ok(highFriction < lowFriction);
  });

  await t.test("derives recommendation bands deterministically", () => {
    assert.equal(deriveRecommendation(70), "go");
    assert.equal(deriveRecommendation(55), "test_small");
    assert.equal(deriveRecommendation(40), "hold");
    assert.equal(deriveRecommendation(39), "kill");
  });

  await t.test("validates complete 0-10 numeric sub-scores", () => {
    assert.equal(isValidSubScores(makeScores()), true);
    assert.equal(isValidSubScores({ ...makeScores(), risk: 11 }), false);
    assert.equal(isValidSubScores({ ...makeScores(), risk: -1 }), false);
    assert.equal(isValidSubScores({ ...makeScores(), risk: Number.NaN }), false);
    const missing = makeScores();
    delete missing.strategicFit;
    assert.equal(isValidSubScores(missing), false);
  });

  await t.test("builds score with automatic recommendation and CEO override", () => {
    const automatic = buildVentureScore(makeScores());
    assert.equal(automatic.overallScore, 75);
    assert.equal(automatic.recommendation, "go");

    const overridden = buildVentureScore(makeScores(), "hold");
    assert.equal(overridden.overallScore, 75);
    assert.equal(overridden.recommendation, "hold");
  });
});
