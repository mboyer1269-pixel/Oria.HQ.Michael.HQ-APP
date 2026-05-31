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

const SAFE_AUTONOMY_DOMAINS = new Set([
  "research",
  "marketScanning",
  "analysis",
  "scoring",
  "reporting",
  "planning",
]);

const RISKY_AUTONOMY_DOMAINS = new Set([
  "spending",
  "externalComms",
  "publishing",
  "dataMutation",
  "legalCommitment",
]);

const SAMPLE_INPUT = {
  name: "Neutral Draft Venture",
  description: "Idée de test neutre pour un brouillon local.",
  targetCustomer: "Équipes ops cherchant une automatisation simple.",
  problem: "Trop de tâches répétitives sans outil adapté.",
  offer: "Workflow léger qui automatise une étape clé.",
  primaryChannel: "Outreach direct après approbation CEO.",
  hypothesis: "Au moins 2 équipes paieront pour gagner du temps.",
  validationWindowDays: 30,
  budgetCapCents: 0,
  firstSuccessMetric: "2 entretiens qualifiés réalisés",
  firstKillMetric: "qualified_interviews",
  firstKillThreshold: "< 2 en 30 jours",
};

test("Venture Engine local draft helper", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const draftModule = await jiti.import(path.join(__dirname, "draft.ts"));
  const { createLocalDraftVentureCard } = draftModule;

  await t.test("creates a card with status candidate", () => {
    const card = createLocalDraftVentureCard(SAMPLE_INPUT);
    assert.equal(card.status, "candidate");
  });

  await t.test("source is human_created", () => {
    const card = createLocalDraftVentureCard(SAMPLE_INPUT);
    assert.equal(card.source, "human_created");
  });

  await t.test("uses the default safe autonomy profile", () => {
    const card = createLocalDraftVentureCard(SAMPLE_INPUT);
    assert.ok(card.autonomyProfile);
    assert.ok(Array.isArray(card.autonomyProfile.rules));
    assert.ok(card.autonomyProfile.rules.length > 0);

    for (const domain of SAFE_AUTONOMY_DOMAINS) {
      const rule = card.autonomyProfile.rules.find((r) => r.domain === domain);
      assert.ok(rule, `Expected a rule for safe domain "${domain}"`);
      assert.equal(rule.riskTier, "safe");
      assert.equal(rule.requiresApproval, false);
    }
  });

  await t.test("risky autonomy domains remain approval-gated", () => {
    const card = createLocalDraftVentureCard(SAMPLE_INPUT);
    for (const domain of RISKY_AUTONOMY_DOMAINS) {
      const rule = card.autonomyProfile.rules.find((r) => r.domain === domain);
      assert.ok(rule, `Expected a rule for risky domain "${domain}"`);
      assert.equal(
        rule.requiresApproval,
        true,
        `Risky domain "${domain}" must require approval`,
      );
    }
  });

  await t.test("no historical venture names are used", () => {
    const card = createLocalDraftVentureCard(SAMPLE_INPUT);
    const blob = JSON.stringify(card);
    for (const forbidden of FORBIDDEN_HISTORICAL_NAMES) {
      assert.equal(
        blob.includes(forbidden),
        false,
        `Draft card must not reference historical venture "${forbidden}"`,
      );
    }
  });

  await t.test("no decisions authorize execution", () => {
    const card = createLocalDraftVentureCard(SAMPLE_INPUT);
    assert.deepEqual(card.decisions, []);
    assert.deepEqual(card.assignedAgents, []);
  });

  await t.test("respects deterministic id and timestamps when provided", () => {
    const card = createLocalDraftVentureCard({
      ...SAMPLE_INPUT,
      id: "venture-local-draft-fixed",
      now: "2026-05-31T00:00:00.000Z",
    });
    assert.equal(card.id, "venture-local-draft-fixed");
    assert.equal(card.createdAt, "2026-05-31T00:00:00.000Z");
    assert.equal(card.updatedAt, "2026-05-31T00:00:00.000Z");
  });

  await t.test("builds a validation plan from intake input", () => {
    const card = createLocalDraftVentureCard(SAMPLE_INPUT);
    assert.ok(card.validationPlan);
    assert.equal(card.validationPlan.windowDays, 30);
    assert.equal(card.validationPlan.budgetCapCents, 0);
    assert.deepEqual(card.validationPlan.successMetrics, [
      "2 entretiens qualifiés réalisés",
    ]);
    assert.equal(card.validationPlan.killCriteria.length, 1);
    assert.equal(card.validationPlan.killCriteria[0].consequence, "manual_review");
  });
});
