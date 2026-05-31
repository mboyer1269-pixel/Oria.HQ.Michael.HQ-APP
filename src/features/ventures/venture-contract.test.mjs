#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("Venture Engine contracts", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const lifecycle = await jiti.import(path.join(__dirname, "lifecycle.ts"));
  const autonomy = await jiti.import(path.join(__dirname, "autonomy.ts"));
  const types = await jiti.import(path.join(__dirname, "types.ts"));

  const {
    canPromoteVenture,
    getDefaultActiveValidationSlotLimit,
    getDefaultVisibleCandidateLimit,
    isActiveVentureStatus,
    isTerminalVentureStatus,
  } = lifecycle;
  const {
    getAutonomyLevelForDomain,
    getDefaultSafeAutonomyProfile,
    isSafeAutonomyRule,
    requiresApprovalForDomain,
  } = autonomy;

  await t.test("lifecycle promotion rules allow canonical forward movement", () => {
    assert.equal(canPromoteVenture("discovered", "candidate"), true);
    assert.equal(canPromoteVenture("candidate", "scored"), true);
    assert.equal(canPromoteVenture("scored", "shortlisted"), true);
    assert.equal(canPromoteVenture("shortlisted", "approved_for_validation"), true);
    assert.equal(canPromoteVenture("approved_for_validation", "validating"), true);
    assert.equal(canPromoteVenture("validating", "operating"), true);
    assert.equal(canPromoteVenture("operating", "autonomous"), true);
    assert.equal(canPromoteVenture("operating", "scaling"), true);
    assert.equal(canPromoteVenture("autonomous", "scaling"), true);
  });

  await t.test("lifecycle supports pausing, resuming, killing, and archiving safely", () => {
    assert.equal(canPromoteVenture("candidate", "paused"), true);
    assert.equal(canPromoteVenture("operating", "paused"), true);
    assert.equal(canPromoteVenture("paused", "validating"), true);
    assert.equal(canPromoteVenture("paused", "operating"), true);
    assert.equal(canPromoteVenture("validating", "killed"), true);
    assert.equal(canPromoteVenture("killed", "archived"), true);
    assert.equal(canPromoteVenture("candidate", "operating"), false);
  });

  await t.test("archived cannot be promoted", () => {
    assert.equal(isTerminalVentureStatus("archived"), true);
    assert.equal(canPromoteVenture("archived", "candidate"), false);
    assert.equal(canPromoteVenture("archived", "paused"), false);
    assert.equal(canPromoteVenture("archived", "killed"), false);
  });

  await t.test("default operating limits match recalibration", () => {
    assert.equal(getDefaultVisibleCandidateLimit(), 6);
    assert.equal(getDefaultActiveValidationSlotLimit(), 3);
    assert.equal(isActiveVentureStatus("validating"), true);
    assert.equal(isActiveVentureStatus("operating"), true);
    assert.equal(isActiveVentureStatus("autonomous"), true);
    assert.equal(isActiveVentureStatus("candidate"), false);
  });

  await t.test("safe autonomy domains do not require approval by default", () => {
    const profile = getDefaultSafeAutonomyProfile();
    for (const domain of ["research", "marketScanning", "analysis", "scoring", "reporting", "planning"]) {
      assert.equal(requiresApprovalForDomain(profile, domain), false, `${domain} should not require approval`);
      assert.ok(getAutonomyLevelForDomain(profile, domain) >= 4, `${domain} should have high autonomy`);
      const rule = profile.rules.find((r) => r.domain === domain);
      assert.ok(rule, `Missing rule for ${domain}`);
      assert.equal(isSafeAutonomyRule(rule), true, `${domain} rule should be safe`);
    }
  });

  await t.test("risky domains require approval or are restricted/forbidden by default", () => {
    const profile = getDefaultSafeAutonomyProfile();
    for (const domain of ["externalComms", "publishing", "spending", "dataMutation", "legalCommitment"]) {
      const rule = profile.rules.find((r) => r.domain === domain);
      assert.ok(rule, `Missing rule for ${domain}`);
      assert.equal(requiresApprovalForDomain(profile, domain), true, `${domain} must require approval`);
      assert.ok(["controlled", "restricted", "forbidden"].includes(rule.riskTier));
    }
  });

  await t.test("spending, legal commitment, and data mutation never default to full autonomy", () => {
    const profile = getDefaultSafeAutonomyProfile();
    for (const domain of ["spending", "legalCommitment", "dataMutation"]) {
      const rule = profile.rules.find((r) => r.domain === domain);
      assert.ok(rule, `Missing rule for ${domain}`);
      assert.notEqual(rule.riskTier, "safe");
      assert.notEqual(rule.requiresApproval, false);
      assert.ok(getAutonomyLevelForDomain(profile, domain) <= 1);
    }
  });

  await t.test("neutral sample VentureCard can be created without historical venture names", () => {
    const profile = getDefaultSafeAutonomyProfile();
    const card = {
      id: "blank-venture-test",
      name: "candidate-marketplace-automation",
      description: "Neutral test venture card for validating the contract shape.",
      source: "human_created",
      status: "candidate",
      targetCustomer: "Independent operators",
      problem: "Manual marketplace reconciliation takes too long.",
      offer: "A lightweight workflow to automate matching and exception reports.",
      primaryChannel: "direct outreach after CEO approval",
      score: {
        revenuePotential: 7,
        speedToFirstDollar: 6,
        costToValidate: 3,
        automationPotential: 8,
        ownerInvolvementRequired: 4,
        marketPain: 7,
        differentiation: 5,
        executionDifficulty: 5,
        risk: 3,
        grossMarginPotential: 8,
        strategicFit: 7,
        overallScore: 68,
        recommendation: "test_small",
      },
      validationPlan: {
        windowDays: 30,
        hypothesis: "Operators will pay for faster reconciliation if the workflow saves at least 3 hours weekly.",
        successMetrics: ["3 qualified interviews", "1 paid pilot commitment"],
        budgetCapCents: 0,
        requiredEvidence: ["Interview notes", "Manual workflow baseline"],
        killCriteria: [
          {
            id: "venture-test-a",
            metric: "qualified_interviews",
            threshold: "< 3",
            evaluationWindowDays: 30,
            consequence: "manual_review",
          },
        ],
      },
      autonomyProfile: profile,
      assignedAgents: [
        {
          agentId: "research-agent",
          role: "market research",
          status: "proposed",
          autonomyDomains: ["research", "analysis", "reporting"],
        },
      ],
      decisions: [
        {
          id: "decision-neutral-1",
          type: "promote",
          summary: "CEO approved moving the neutral idea into candidate review.",
          decidedBy: "ceo",
          decidedAt: "2026-05-31T00:00:00.000Z",
          noExecutionAuthorized: true,
          humanOnTheLoop: true,
        },
      ],
      createdAt: "2026-05-31T00:00:00.000Z",
      updatedAt: "2026-05-31T00:00:00.000Z",
    };

    assert.equal(card.id, "blank-venture-test");
    assert.equal(card.name, "candidate-marketplace-automation");
    assert.equal(card.status, "candidate");
    assert.equal(card.source, "human_created");
    assert.equal(card.decisions[0].noExecutionAuthorized, true);
    assert.equal(card.decisions[0].humanOnTheLoop, true);
    assert.deepEqual(Object.keys(types), []);
  });
});
