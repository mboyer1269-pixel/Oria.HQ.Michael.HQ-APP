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

const FORBIDDEN_MUTATION_WORDS = ["launch", "publish", "spend", "contact"];

test("Venture suggestion inbox helper", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const suggestionsMod = await jiti.import(path.join(__dirname, "venture-suggestions.ts"));
  const seedMod = await jiti.import(path.join(__dirname, "suggestion-seed.ts"));

  const {
    getVisibleSuggestionLimit,
    rankVentureSuggestions,
    summarizeSuggestionInbox,
  } = suggestionsMod;
  const { ventureSuggestionSeed } = seedMod;

  await t.test("visible suggestion limit is 6", () => {
    assert.equal(getVisibleSuggestionLimit(), 6);
  });

  await t.test("suggestions are ranked deterministically", () => {
    const ranked = rankVentureSuggestions([
      {
        id: "s-3",
        name: "Zulu Review",
        description: "review third",
        targetCustomer: "Test",
        problem: "Test",
        offer: "Test",
        primaryChannel: "Test",
        source: "simulated",
        suggestedBy: "simulation",
        rationale: "Review first by action priority.",
        suggestedNextAction: "review",
        createdAt: "2026-06-01T00:00:03.000Z",
      },
      {
        id: "s-1",
        name: "Alpha Score",
        description: "score first",
        targetCustomer: "Test",
        problem: "Test",
        offer: "Test",
        primaryChannel: "Test",
        source: "future_agent",
        suggestedBy: "future-agent",
        rationale: "Score second by action priority.",
        estimatedScore: {
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
          overallScore: 75,
          recommendation: "go",
        },
        estimatedCostToValidateCents: 50000,
        estimatedTimeToFirstDollarDays: 21,
        riskNotes: ["Test"],
        suggestedNextAction: "score",
        createdAt: "2026-06-01T00:00:01.000Z",
      },
      {
        id: "s-2",
        name: "Reject Later",
        description: "reject third",
        targetCustomer: "Test",
        problem: "Test",
        offer: "Test",
        primaryChannel: "Test",
        source: "simulated",
        suggestedBy: "simulation",
        rationale: "Reject third by action priority.",
        suggestedNextAction: "reject",
        createdAt: "2026-06-01T00:00:02.000Z",
      },
      {
        id: "s-4",
        name: "Alpha Score B",
        description: "score tie break",
        targetCustomer: "Test",
        problem: "Test",
        offer: "Test",
        primaryChannel: "Test",
        source: "future_agent",
        suggestedBy: "future-agent",
        rationale: "Alphabetical tie-break.",
        estimatedScore: {
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
          overallScore: 75,
          recommendation: "go",
        },
        estimatedCostToValidateCents: 50000,
        estimatedTimeToFirstDollarDays: 21,
        riskNotes: ["Test"],
        suggestedNextAction: "score",
        createdAt: "2026-06-01T00:00:04.000Z",
      },
    ]);

    assert.deepEqual(ranked.map((suggestion) => suggestion.id), ["s-3", "s-1", "s-4", "s-2"]);
  });

  await t.test("summary counts suggestions and visible cards", () => {
    const summary = summarizeSuggestionInbox(ventureSuggestionSeed);
    assert.equal(summary.totalCount, ventureSuggestionSeed.length);
    assert.equal(summary.visibleCount, Math.min(6, ventureSuggestionSeed.length));
    assert.equal(summary.simulatedCount + summary.futureAgentCount, ventureSuggestionSeed.length);
    assert.equal(summary.byNextAction.review + summary.byNextAction.score + summary.byNextAction.reject + summary.byNextAction.save_later, ventureSuggestionSeed.length);
  });

  await t.test("seed suggestions avoid historical venture names", () => {
    const blob = JSON.stringify(ventureSuggestionSeed);
    for (const forbidden of FORBIDDEN_HISTORICAL_NAMES) {
      assert.equal(blob.includes(forbidden), false, `suggestions must not reference "${forbidden}"`);
    }
  });

  await t.test("suggestions are not saved venture cards", () => {
    for (const suggestion of ventureSuggestionSeed) {
      assert.equal(Object.prototype.hasOwnProperty.call(suggestion, "status"), false);
      assert.equal(Object.prototype.hasOwnProperty.call(suggestion, "assignedAgents"), false);
      assert.equal(Object.prototype.hasOwnProperty.call(suggestion, "decisions"), false);
    }
  });

  await t.test("seed sources are simulated or future_agent only", () => {
    const sources = new Set(ventureSuggestionSeed.map((suggestion) => suggestion.source));
    assert.deepEqual([...sources].sort(), ["future_agent", "simulated"]);
  });

  await t.test("seed data avoids mutation vocabulary", () => {
    const blob = JSON.stringify(ventureSuggestionSeed).toLowerCase();
    for (const word of FORBIDDEN_MUTATION_WORDS) {
      assert.equal(blob.includes(word), false, `seed data must not include "${word}"`);
    }
  });
});
