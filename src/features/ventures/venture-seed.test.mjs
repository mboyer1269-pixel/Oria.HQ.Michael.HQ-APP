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

const ACTIVE_VALIDATION_STATUSES = new Set([
  "approved_for_validation",
  "validating",
  "operating",
  "autonomous",
  "scaling",
]);

const TERMINAL_NEGATIVE_STATUSES = new Set(["killed", "archived"]);

test("Venture Engine seed cards", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const seedModule = await jiti.import(path.join(__dirname, "seed.ts"));
  const { ventureSeedCards } = seedModule;

  await t.test("exposes exactly 6 sample venture cards", () => {
    assert.equal(Array.isArray(ventureSeedCards), true);
    assert.equal(ventureSeedCards.length, 6);
  });

  await t.test("no forbidden historical venture names are present", () => {
    for (const card of ventureSeedCards) {
      const blob = JSON.stringify(card);
      for (const forbidden of FORBIDDEN_HISTORICAL_NAMES) {
        assert.equal(
          blob.includes(forbidden),
          false,
          `Sample card ${card.id} must not reference historical venture "${forbidden}"`,
        );
      }
    }
  });

  await t.test("no sample card is in a killed or archived status", () => {
    for (const card of ventureSeedCards) {
      assert.equal(
        TERMINAL_NEGATIVE_STATUSES.has(card.status),
        false,
        `Sample card ${card.id} must not be in terminal-negative status "${card.status}"`,
      );
    }
  });

  await t.test("active validation statuses do not exceed 3 slots", () => {
    const activeCount = ventureSeedCards.filter((c) => ACTIVE_VALIDATION_STATUSES.has(c.status)).length;
    assert.ok(
      activeCount <= 3,
      `Expected at most 3 active validation cards, found ${activeCount}`,
    );
  });

  await t.test("every card carries an autonomy profile with at least one rule", () => {
    for (const card of ventureSeedCards) {
      assert.ok(card.autonomyProfile, `Sample card ${card.id} is missing autonomyProfile`);
      assert.ok(
        Array.isArray(card.autonomyProfile.rules) && card.autonomyProfile.rules.length > 0,
        `Sample card ${card.id} autonomyProfile must have rules`,
      );
    }
  });

  await t.test("every card has a validation plan or a score", () => {
    for (const card of ventureSeedCards) {
      const hasPlan = Boolean(card.validationPlan);
      const hasScore = Boolean(card.score);
      assert.ok(
        hasPlan || hasScore,
        `Sample card ${card.id} must expose either a validationPlan or a score`,
      );
    }
  });
});
