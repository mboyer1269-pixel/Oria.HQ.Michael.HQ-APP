#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

function makeBrief(overrides = {}) {
  return {
    briefId: "brief-001",
    agentId: "agent-001",
    source: "agent_generated",
    title: "AI-powered customer onboarding tool",
    targetCustomer: "SaaS companies with high churn",
    problem: "New users don't activate because onboarding is manual and slow",
    proposedOffer: "Automated onboarding flow builder with AI nudges",
    revenueModel: "subscription",
    estimatedRevenuePotentialCents: 15_000_000,
    estimatedValidationCostCents: 200_000,
    speedToFirstDollarDays: 21,
    automationPotentialScore: 60,
    confidenceScore: 65,
    risk: {
      riskLevel: "low",
      riskFactors: ["market competition"],
      mitigationNotes: ["differentiate on speed"],
    },
    validationPlan: {
      hypothesis: "SaaS companies will pay for AI onboarding automation",
      firstValidationStep: "conduct 5 customer discovery calls",
      validationChannel: "direct outreach",
      successMetric: "3 of 5 expressed willingness to pay",
      successThreshold: "60% positive response rate",
      validationWindowDays: 30,
      budgetCapCents: 500_000,
    },
    killCriteria: [{ metric: "cac", threshold: "$500", reason: "unsustainable" }],
    recommendedDecision: "prepare_validation_plan",
    nextAction: {
      actionLabel: "run 5 customer interviews",
      rationale: "validate problem",
      estimatedEffortHours: 10,
    },
    rationale: "High automation potential with clear customer pain point",
    evidence: ["customer interview 1", "market research report"],
    createdAt: "2026-06-02T00:00:00.000Z",
    humanOnTheLoop: true,
    approvalRequired: true,
    noExecutionAuthorized: true,
    ...overrides,
  };
}

test("AgentOpportunityBrief model", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(path.join(__dirname, "agent-opportunity-brief.ts"));
  const {
    validateAgentOpportunityBrief,
    scoreAgentOpportunityBrief,
    buildAgentOpportunityBrief,
  } = mod;

  // ---------------------------------------------------------------------------
  // Group 1 — Validation: valid brief
  // ---------------------------------------------------------------------------
  await t.test("Validation: valid brief", async (t) => {
    await t.test("full valid brief passes", () => {
      const result = validateAgentOpportunityBrief(makeBrief());
      assert.equal(result.valid, true);
      assert.deepEqual(result.errors, []);
    });

    await t.test("all safety flags are true on valid brief", () => {
      const brief = makeBrief();
      assert.equal(brief.humanOnTheLoop, true);
      assert.equal(brief.approvalRequired, true);
      assert.equal(brief.noExecutionAuthorized, true);
    });
  });

  // ---------------------------------------------------------------------------
  // Group 2 — Validation: required fields
  // ---------------------------------------------------------------------------
  await t.test("Validation: required fields", async (t) => {
    await t.test("empty briefId -> invalid", () => {
      const result = validateAgentOpportunityBrief(makeBrief({ briefId: "" }));
      assert.equal(result.valid, false);
    });

    await t.test("empty agentId -> invalid", () => {
      const result = validateAgentOpportunityBrief(makeBrief({ agentId: "" }));
      assert.equal(result.valid, false);
    });

    await t.test("empty title -> invalid", () => {
      const result = validateAgentOpportunityBrief(makeBrief({ title: "" }));
      assert.equal(result.valid, false);
    });

    await t.test("empty problem -> invalid", () => {
      const result = validateAgentOpportunityBrief(makeBrief({ problem: "" }));
      assert.equal(result.valid, false);
    });

    await t.test("empty proposedOffer -> invalid", () => {
      const result = validateAgentOpportunityBrief(makeBrief({ proposedOffer: "" }));
      assert.equal(result.valid, false);
    });

    await t.test("empty targetCustomer -> invalid", () => {
      const result = validateAgentOpportunityBrief(makeBrief({ targetCustomer: "" }));
      assert.equal(result.valid, false);
    });

    await t.test("empty rationale -> invalid", () => {
      const result = validateAgentOpportunityBrief(makeBrief({ rationale: "" }));
      assert.equal(result.valid, false);
    });
  });

  // ---------------------------------------------------------------------------
  // Group 3 — Validation: numeric fields
  // ---------------------------------------------------------------------------
  await t.test("Validation: numeric fields", async (t) => {
    await t.test("negative estimatedRevenuePotentialCents -> invalid", () => {
      const result = validateAgentOpportunityBrief(makeBrief({ estimatedRevenuePotentialCents: -1 }));
      assert.equal(result.valid, false);
    });

    await t.test("negative estimatedValidationCostCents -> invalid", () => {
      const result = validateAgentOpportunityBrief(makeBrief({ estimatedValidationCostCents: -1 }));
      assert.equal(result.valid, false);
    });

    await t.test("negative speedToFirstDollarDays -> invalid", () => {
      const result = validateAgentOpportunityBrief(makeBrief({ speedToFirstDollarDays: -1 }));
      assert.equal(result.valid, false);
    });

    await t.test("automationPotentialScore -1 -> invalid", () => {
      const result = validateAgentOpportunityBrief(makeBrief({ automationPotentialScore: -1 }));
      assert.equal(result.valid, false);
    });

    await t.test("automationPotentialScore 101 -> invalid", () => {
      const result = validateAgentOpportunityBrief(makeBrief({ automationPotentialScore: 101 }));
      assert.equal(result.valid, false);
    });

    await t.test("confidenceScore -1 -> invalid", () => {
      const result = validateAgentOpportunityBrief(makeBrief({ confidenceScore: -1 }));
      assert.equal(result.valid, false);
    });

    await t.test("confidenceScore 101 -> invalid", () => {
      const result = validateAgentOpportunityBrief(makeBrief({ confidenceScore: 101 }));
      assert.equal(result.valid, false);
    });
  });

  // ---------------------------------------------------------------------------
  // Group 4 — Validation: safety flags
  // ---------------------------------------------------------------------------
  await t.test("Validation: safety flags", async (t) => {
    await t.test("humanOnTheLoop: false -> invalid", () => {
      const result = validateAgentOpportunityBrief(makeBrief({ humanOnTheLoop: /** @type {any} */ (false) }));
      assert.equal(result.valid, false);
    });

    await t.test("approvalRequired: false -> invalid", () => {
      const result = validateAgentOpportunityBrief(makeBrief({ approvalRequired: /** @type {any} */ (false) }));
      assert.equal(result.valid, false);
    });

    await t.test("noExecutionAuthorized: false -> invalid", () => {
      const result = validateAgentOpportunityBrief(makeBrief({ noExecutionAuthorized: /** @type {any} */ (false) }));
      assert.equal(result.valid, false);
    });
  });

  // ---------------------------------------------------------------------------
  // Group 5 — Validation: sub-model validation
  // ---------------------------------------------------------------------------
  await t.test("Validation: sub-model validation", async (t) => {
    await t.test("empty validationPlan.hypothesis -> invalid", () => {
      const result = validateAgentOpportunityBrief(
        makeBrief({ validationPlan: { ...makeBrief().validationPlan, hypothesis: "" } }),
      );
      assert.equal(result.valid, false);
    });

    await t.test("empty validationPlan.firstValidationStep -> invalid", () => {
      const result = validateAgentOpportunityBrief(
        makeBrief({ validationPlan: { ...makeBrief().validationPlan, firstValidationStep: "" } }),
      );
      assert.equal(result.valid, false);
    });

    await t.test("validationPlan.validationWindowDays: 0 -> invalid", () => {
      const result = validateAgentOpportunityBrief(
        makeBrief({ validationPlan: { ...makeBrief().validationPlan, validationWindowDays: 0 } }),
      );
      assert.equal(result.valid, false);
    });

    await t.test("validationPlan.budgetCapCents: -1 -> invalid", () => {
      const result = validateAgentOpportunityBrief(
        makeBrief({ validationPlan: { ...makeBrief().validationPlan, budgetCapCents: -1 } }),
      );
      assert.equal(result.valid, false);
    });

    await t.test("empty killCriteria array -> invalid", () => {
      const result = validateAgentOpportunityBrief(makeBrief({ killCriteria: [] }));
      assert.equal(result.valid, false);
    });

    await t.test("killCriterion with empty metric -> invalid", () => {
      const result = validateAgentOpportunityBrief(
        makeBrief({ killCriteria: [{ metric: "", threshold: "$500", reason: "unsustainable" }] }),
      );
      assert.equal(result.valid, false);
    });

    await t.test("invalid riskLevel 'extreme' -> invalid", () => {
      const result = validateAgentOpportunityBrief(
        makeBrief({ risk: { ...makeBrief().risk, riskLevel: /** @type {any} */ ("extreme") } }),
      );
      assert.equal(result.valid, false);
    });

    await t.test("empty risk.riskFactors: [] -> invalid", () => {
      const result = validateAgentOpportunityBrief(
        makeBrief({ risk: { ...makeBrief().risk, riskFactors: [] } }),
      );
      assert.equal(result.valid, false);
    });

    await t.test("invalid createdAt: 'not-a-date' -> invalid", () => {
      const result = validateAgentOpportunityBrief(makeBrief({ createdAt: "not-a-date" }));
      assert.equal(result.valid, false);
    });

    await t.test("empty nextAction.actionLabel -> invalid", () => {
      const result = validateAgentOpportunityBrief(
        makeBrief({ nextAction: { ...makeBrief().nextAction, actionLabel: "" } }),
      );
      assert.equal(result.valid, false);
    });

    await t.test("negative nextAction.estimatedEffortHours -> invalid", () => {
      const result = validateAgentOpportunityBrief(
        makeBrief({ nextAction: { ...makeBrief().nextAction, estimatedEffortHours: -1 } }),
      );
      assert.equal(result.valid, false);
    });
  });

  // ---------------------------------------------------------------------------
  // Group 6 — Scoring: recommendation outcomes
  // ---------------------------------------------------------------------------
  await t.test("Scoring: recommendation outcomes", async (t) => {
    await t.test("critical risk -> 'request_ceo_review'", () => {
      const brief = makeBrief({
        risk: { riskLevel: "critical", riskFactors: ["regulatory"], mitigationNotes: ["legal review"] },
        estimatedRevenuePotentialCents: 100_000_000,
        speedToFirstDollarDays: 7,
        estimatedValidationCostCents: 0,
        automationPotentialScore: 90,
        confidenceScore: 80,
        evidence: ["e1", "e2"],
      });
      const score = scoreAgentOpportunityBrief(brief);
      assert.equal(score.recommendation, "request_ceo_review");
    });

    await t.test("high score + good evidence + high confidence + low risk -> 'save_as_candidate'", () => {
      const brief = makeBrief({
        estimatedRevenuePotentialCents: 100_000_000,
        speedToFirstDollarDays: 7,
        estimatedValidationCostCents: 0,
        automationPotentialScore: 90,
        confidenceScore: 80,
        risk: { riskLevel: "low", riskFactors: ["market competition"], mitigationNotes: ["differentiate on speed"] },
        evidence: ["e1", "e2"],
      });
      const score = scoreAgentOpportunityBrief(brief);
      assert.equal(score.recommendation, "save_as_candidate");
    });

    await t.test("low overall score -> 'reject_opportunity'", () => {
      const brief = makeBrief({
        estimatedRevenuePotentialCents: 500_000,
        speedToFirstDollarDays: 365,
        estimatedValidationCostCents: 10_000_000,
        automationPotentialScore: 5,
        confidenceScore: 10,
        risk: { riskLevel: "medium", riskFactors: ["market"], mitigationNotes: [] },
      });
      const score = scoreAgentOpportunityBrief(brief);
      assert.equal(score.recommendation, "reject_opportunity");
    });

    await t.test("medium score no evidence -> 'needs_more_research'", () => {
      const brief = makeBrief({
        evidence: [],
        confidenceScore: 50,
        risk: { riskLevel: "medium", riskFactors: ["market"], mitigationNotes: [] },
      });
      const score = scoreAgentOpportunityBrief(brief);
      assert.equal(score.recommendation, "needs_more_research");
    });

    await t.test("medium score with evidence but low confidence -> 'prepare_validation_plan'", () => {
      // Need overallScore >= 50 and evidence.length > 0 and confidenceScore < 50
      // Use medium risk (0.85 multiplier) + moderate base to stay >= 50
      // revenue: 15M => 65, speed: 21 days => 75, cost: 200k => 70
      // automation: 60, confidence: 40
      // base = 65*0.25 + 75*0.15 + 70*0.15 + 60*0.2 + 40*0.25
      //      = 16.25 + 11.25 + 10.5 + 12 + 10 = 60
      // risk adj = 60 * 0.85 = 51
      const brief = makeBrief({
        evidence: ["e1"],
        confidenceScore: 40,
        risk: { riskLevel: "medium", riskFactors: ["market"], mitigationNotes: [] },
      });
      const score = scoreAgentOpportunityBrief(brief);
      assert.ok(score.overallScore >= 50, `expected overallScore >= 50, got ${score.overallScore}`);
      assert.equal(score.recommendation, "prepare_validation_plan");
    });
  });

  // ---------------------------------------------------------------------------
  // Group 7 — Scoring: component scores
  // ---------------------------------------------------------------------------
  await t.test("Scoring: component scores", async (t) => {
    await t.test("large revenue (>= 100_000_000 cents) -> revenuePotentialScore === 100", () => {
      const score = scoreAgentOpportunityBrief(makeBrief({ estimatedRevenuePotentialCents: 100_000_000 }));
      assert.equal(score.revenuePotentialScore, 100);
    });

    await t.test("tiny revenue (< 1_000_000 cents) -> revenuePotentialScore === 10", () => {
      const score = scoreAgentOpportunityBrief(makeBrief({ estimatedRevenuePotentialCents: 500_000 }));
      assert.equal(score.revenuePotentialScore, 10);
    });

    await t.test("speedToFirstDollarDays: 5 -> speedScore === 100", () => {
      const score = scoreAgentOpportunityBrief(makeBrief({ speedToFirstDollarDays: 5 }));
      assert.equal(score.speedScore, 100);
    });

    await t.test("speedToFirstDollarDays: 180 -> speedScore === 15", () => {
      const score = scoreAgentOpportunityBrief(makeBrief({ speedToFirstDollarDays: 180 }));
      assert.equal(score.speedScore, 15);
    });

    await t.test("estimatedValidationCostCents: 0 -> costScore === 100", () => {
      const score = scoreAgentOpportunityBrief(makeBrief({ estimatedValidationCostCents: 0 }));
      assert.equal(score.costScore, 100);
    });

    await t.test("estimatedValidationCostCents: 10_000_000 -> costScore === 10", () => {
      const score = scoreAgentOpportunityBrief(makeBrief({ estimatedValidationCostCents: 10_000_000 }));
      assert.equal(score.costScore, 10);
    });

    await t.test("critical risk multiplier applies heavy penalty (riskAdjustedScore <= 50 for mid-range base)", () => {
      // Use mid-range inputs: revenue 15M (65), speed 21d (75), cost 200k (70), automation 60, confidence 65
      // base = 65*0.25 + 75*0.15 + 70*0.15 + 60*0.2 + 65*0.25 = 16.25+11.25+10.5+12+16.25 = 66.25
      // critical multiplier: 0.4 => 66.25 * 0.4 = 26.5 => rounded = 27 (well <= 50)
      const brief = makeBrief({
        risk: { riskLevel: "critical", riskFactors: ["regulatory"], mitigationNotes: [] },
      });
      const score = scoreAgentOpportunityBrief(brief);
      assert.ok(score.riskAdjustedScore <= 50, `expected riskAdjustedScore <= 50, got ${score.riskAdjustedScore}`);
    });
  });

  // ---------------------------------------------------------------------------
  // Group 8 — Determinism and immutability
  // ---------------------------------------------------------------------------
  await t.test("Determinism and immutability", async (t) => {
    await t.test("same brief produces same score twice", () => {
      const brief = makeBrief();
      const s1 = scoreAgentOpportunityBrief(brief);
      const s2 = scoreAgentOpportunityBrief(brief);
      assert.deepEqual(s1, s2);
    });

    await t.test("scoring does not mutate input (evidence array length preserved)", () => {
      const brief = makeBrief();
      const lenBefore = brief.evidence.length;
      scoreAgentOpportunityBrief(brief);
      assert.equal(brief.evidence.length, lenBefore);
    });

    await t.test("builder sets humanOnTheLoop === true", () => {
      const input = { ...makeBrief() };
      delete input.humanOnTheLoop;
      delete input.approvalRequired;
      delete input.noExecutionAuthorized;
      const built = buildAgentOpportunityBrief(input);
      assert.equal(built.humanOnTheLoop, true);
    });

    await t.test("builder sets approvalRequired === true", () => {
      const input = { ...makeBrief() };
      delete input.humanOnTheLoop;
      delete input.approvalRequired;
      delete input.noExecutionAuthorized;
      const built = buildAgentOpportunityBrief(input);
      assert.equal(built.approvalRequired, true);
    });

    await t.test("builder sets noExecutionAuthorized === true", () => {
      const input = { ...makeBrief() };
      delete input.humanOnTheLoop;
      delete input.approvalRequired;
      delete input.noExecutionAuthorized;
      const built = buildAgentOpportunityBrief(input);
      assert.equal(built.noExecutionAuthorized, true);
    });

    await t.test("builder evidence array is a different reference from input", () => {
      const input = { ...makeBrief() };
      delete input.humanOnTheLoop;
      delete input.approvalRequired;
      delete input.noExecutionAuthorized;
      const built = buildAgentOpportunityBrief(input);
      assert.notEqual(built.evidence, input.evidence);
    });

    await t.test("builder killCriteria array is a different reference from input", () => {
      const input = { ...makeBrief() };
      delete input.humanOnTheLoop;
      delete input.approvalRequired;
      delete input.noExecutionAuthorized;
      const built = buildAgentOpportunityBrief(input);
      assert.notEqual(built.killCriteria, input.killCriteria);
    });

    await t.test("builder does not mutate input object", () => {
      const input = { ...makeBrief() };
      delete input.humanOnTheLoop;
      delete input.approvalRequired;
      delete input.noExecutionAuthorized;
      const evidenceBefore = input.evidence.length;
      buildAgentOpportunityBrief(input);
      assert.equal(input.evidence.length, evidenceBefore);
      assert.equal("humanOnTheLoop" in input, false);
    });
  });

  // ---------------------------------------------------------------------------
  // Group 9 — Module boundary (static source scan via readFileSync)
  // ---------------------------------------------------------------------------
  await t.test("Module boundary (static source scan)", async (t) => {
    const sourceText = readFileSync(path.join(__dirname, "agent-opportunity-brief.ts"), "utf-8");

    await t.test("source file does not import @supabase/supabase-js or @supabase/ssr", () => {
      assert.ok(!sourceText.includes("@supabase/supabase-js"), "must not import @supabase/supabase-js");
      assert.ok(!sourceText.includes("@supabase/ssr"), "must not import @supabase/ssr");
    });

    await t.test("source file does not import 'pg' or 'postgres'", () => {
      assert.ok(!sourceText.includes("'pg'") && !sourceText.includes('"pg"'), "must not import pg");
      assert.ok(
        !sourceText.includes("'postgres'") && !sourceText.includes('"postgres"'),
        "must not import postgres",
      );
    });

    await t.test("source file does not contain 'saveOpportunity' or 'persistBrief'", () => {
      assert.ok(!sourceText.includes("saveOpportunity"), "must not contain saveOpportunity");
      assert.ok(!sourceText.includes("persistBrief"), "must not contain persistBrief");
    });

    await t.test("source file does not export a symbol named 'repository' or 'Repository'", () => {
      assert.ok(!sourceText.includes("export const repository"), "must not export repository");
      assert.ok(!sourceText.includes("export class Repository"), "must not export Repository");
    });

    await t.test("source file does not contain 'action_ledger' or 'actionLedger'", () => {
      assert.ok(!sourceText.includes("action_ledger"), "must not contain action_ledger");
      assert.ok(!sourceText.includes("actionLedger"), "must not contain actionLedger");
    });

    await t.test("source file does not contain 'server-only'", () => {
      assert.ok(!sourceText.includes("server-only"), "must not contain server-only");
    });
  });
});
