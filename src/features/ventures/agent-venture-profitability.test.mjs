#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test("AgentVentureProfitability", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(path.join(__dirname, "agent-venture-profitability.ts"));
  const { scoreAgentVentureProfitability } = mod;

  function makeBrief(overrides = {}) {
    return {
      briefId: "brief-profit-001",
      agentId: "agent-profit-001",
      source: "agent_generated",
      title: "Profitable Test Opportunity",
      targetCustomer: "Operators with expensive manual workflows",
      problem: "Manual coordination slows revenue operations",
      proposedOffer: "Automated workflow assistant with a paid validation sprint",
      revenueModel: "subscription",
      estimatedRevenuePotentialCents: 100_000_000,
      estimatedValidationCostCents: 100_000,
      speedToFirstDollarDays: 10,
      automationPotentialScore: 90,
      confidenceScore: 85,
      risk: {
        riskLevel: "low",
        riskFactors: ["narrow initial segment"],
        mitigationNotes: ["validate with founder interviews"],
      },
      validationPlan: {
        hypothesis: "Customers will pay for workflow automation if setup is fast",
        firstValidationStep: "Run five paid discovery calls",
        validationChannel: "Founder communities",
        successMetric: "paid validation calls",
        successThreshold: "3 paid calls in 14 days",
        validationWindowDays: 14,
        budgetCapCents: 100_000,
      },
      killCriteria: [
        {
          metric: "paid discovery interest",
          threshold: "fewer than 2 paid calls",
          reason: "weak willingness to pay",
        },
      ],
      recommendedDecision: "prepare_validation_plan",
      nextAction: {
        actionLabel: "Run paid discovery",
        rationale: "Validate willingness to pay before build",
        estimatedEffortHours: 8,
      },
      rationale: "Strong upside, low first test cost, and fast validation path",
      evidence: ["survey signal", "interview signal", "competitor gap"],
      createdAt: "2026-06-02T00:00:00.000Z",
      humanOnTheLoop: true,
      approvalRequired: true,
      noExecutionAuthorized: true,
      ...overrides,
    };
  }

  function makeWorkstream(overrides = {}) {
    return {
      workstreamId: "ws-profit-001",
      briefId: "brief-profit-001",
      ventureId: null,
      agentId: "agent-profit-001",
      title: "Profitable Test Opportunity",
      stage: "validation",
      status: "pending_ceo_review",
      targetCustomer: "Operators with expensive manual workflows",
      problem: "Manual coordination slows revenue operations",
      proposedOffer: "Automated workflow assistant with a paid validation sprint",
      estimatedRevenuePotentialCents: 100_000_000,
      estimatedTotalBudgetCents: 100_000,
      speedToFirstDollarDays: 10,
      businessObjectives: [
        {
          objectiveId: "obj-profit-001",
          label: "Validate willingness to pay",
          rationale: "Proof before build",
          expectedRevenueImpactCents: 100_000_000,
          timeHorizonDays: 90,
        },
        {
          objectiveId: "obj-profit-002",
          label: "Find first repeatable channel",
          rationale: "Channel proof lowers execution risk",
          expectedRevenueImpactCents: 25_000_000,
          timeHorizonDays: 45,
        },
        {
          objectiveId: "obj-profit-003",
          label: "Define first automated workflow",
          rationale: "Automation leverage drives margin",
          expectedRevenueImpactCents: 40_000_000,
          timeHorizonDays: 60,
        },
      ],
      workItems: [
        {
          itemId: "wi-profit-001",
          title: "Interview first buyers",
          description: "Interview five likely buyers",
          type: "research",
          status: "completed",
          estimatedEffortHours: 6,
          expectedOutput: "Buyer pain notes",
          successCriteria: "Three paid validation signals",
          requiresHumanApproval: false,
          agentId: "agent-profit-001",
        },
        {
          itemId: "wi-profit-002",
          title: "Draft validation offer",
          description: "Create the paid validation offer",
          type: "validation",
          status: "completed",
          estimatedEffortHours: 4,
          expectedOutput: "Offer draft",
          successCriteria: "CEO can review the offer",
          requiresHumanApproval: true,
          agentId: null,
        },
        {
          itemId: "wi-profit-003",
          title: "CEO decision",
          description: "Decide whether to prioritize validation",
          type: "decision_point",
          status: "completed",
          estimatedEffortHours: 1,
          expectedOutput: "CEO decision",
          successCriteria: "Decision recorded later through a controlled path",
          requiresHumanApproval: true,
          agentId: null,
        },
      ],
      kpis: [
        {
          kpiId: "kpi-profit-001",
          label: "Paid discovery calls",
          description: "Paid calls booked before build",
          targetValue: "3",
          currentValue: "0",
          unit: "calls",
          isCritical: true,
        },
        {
          kpiId: "kpi-profit-002",
          label: "Validation cost cap",
          description: "Budget used before CEO decision",
          targetValue: "$1000",
          currentValue: "$0",
          unit: "USD",
          isCritical: true,
        },
        {
          kpiId: "kpi-profit-003",
          label: "Time to first dollar",
          description: "Days from start to first paid signal",
          targetValue: "14",
          currentValue: "0",
          unit: "days",
          isCritical: false,
        },
      ],
      approvalGates: [
        {
          gateId: "gate-profit-001",
          label: "CEO validation priority review",
          description: "CEO reviews evidence before any execution path",
          stage: "validation",
          requiredBefore: "Any execution, spend, send, or publish activity",
          approvalCriteria: ["Evidence reviewed", "Budget cap accepted"],
          humanReviewRequired: true,
          ledgerEntryRequired: true,
        },
        {
          gateId: "gate-profit-002",
          label: "Future ledger gate",
          description: "Future action must be ledgered before runtime can exist",
          stage: "build",
          requiredBefore: "Any runtime work",
          approvalCriteria: ["Future ledger design exists"],
          humanReviewRequired: true,
          ledgerEntryRequired: true,
        },
      ],
      autonomyBoundary: {
        maxBudgetCents: 0,
        allowedActions: [],
        forbiddenActions: ["spend", "send", "publish", "execute"],
        requiresHumanApprovalAboveCents: 0,
        maxParallelAgents: 1,
      },
      riskFactors: ["narrow initial segment"],
      killCriteria: ["Fewer than two paid calls"],
      rationale: "Strong upside, low first test cost, and fast validation path",
      evidence: ["survey signal", "interview signal", "competitor gap"],
      nextRecommendedAction: "CEO validation priority review",
      createdAt: "2026-06-02T00:00:00.000Z",
      updatedAt: "2026-06-02T00:00:00.000Z",
      humanOnTheLoop: true,
      approvalRequired: true,
      noExecutionAuthorized: true,
      ...overrides,
    };
  }

  function score(overrides = {}) {
    return scoreAgentVentureProfitability({
      brief: makeBrief(overrides.brief),
      workstream: makeWorkstream(overrides.workstream),
      workstreamReadiness: overrides.workstreamReadiness,
    });
  }

  await t.test("strong low-risk opportunity recommends prioritize_for_validation", () => {
    const result = score();
    assert.equal(result.recommendation, "prioritize_for_validation");
    assert.ok(result.profitabilityScore >= 72, `expected >= 72, got ${result.profitabilityScore}`);
  });

  await t.test("critical risk never recommends prioritize_for_validation", () => {
    const result = score({
      brief: {
        risk: {
          riskLevel: "critical",
          riskFactors: ["regulatory risk"],
          mitigationNotes: [],
        },
      },
    });
    assert.notEqual(result.recommendation, "prioritize_for_validation");
    assert.equal(result.recommendation, "request_ceo_review");
    assert.ok(result.blockers.some((blocker) => blocker.blockerId === "critical-risk"));
  });

  await t.test("weak or missing evidence recommends gather_more_evidence", () => {
    const result = score({
      brief: { evidence: [] },
      workstream: { evidence: [] },
    });
    assert.equal(result.recommendation, "gather_more_evidence");
    assert.ok(result.blockers.some((blocker) => blocker.blockerId === "weak-evidence"));
  });

  await t.test("high cost plus low confidence recommends cost reduction or rejection", () => {
    const result = score({
      brief: {
        estimatedValidationCostCents: 10_000_000,
        confidenceScore: 35,
      },
      workstream: {
        estimatedTotalBudgetCents: 10_000_000,
      },
    });
    assert.ok(
      ["reduce_validation_cost", "reject_for_now"].includes(result.recommendation),
      `unexpected recommendation ${result.recommendation}`,
    );
  });

  await t.test("low score recommends reject_for_now", () => {
    const result = score({
      brief: {
        estimatedRevenuePotentialCents: 200_000,
        estimatedValidationCostCents: 5_000_000,
        speedToFirstDollarDays: 180,
        automationPotentialScore: 10,
        confidenceScore: 20,
        risk: {
          riskLevel: "high",
          riskFactors: ["crowded market"],
          mitigationNotes: [],
        },
        evidence: ["single weak signal", "second weak signal"],
      },
      workstream: {
        estimatedRevenuePotentialCents: 200_000,
        estimatedTotalBudgetCents: 5_000_000,
        speedToFirstDollarDays: 180,
        evidence: ["single weak signal", "second weak signal"],
      },
    });
    assert.equal(result.recommendation, "reject_for_now");
  });

  await t.test("medium opportunity recommends refine_offer or request_ceo_review", () => {
    const result = score({
      brief: {
        estimatedRevenuePotentialCents: 20_000_000,
        estimatedValidationCostCents: 750_000,
        speedToFirstDollarDays: 45,
        automationPotentialScore: 55,
        confidenceScore: 58,
        risk: {
          riskLevel: "medium",
          riskFactors: ["unclear channel"],
          mitigationNotes: ["test smaller channel"],
        },
        evidence: ["interview signal", "search trend"],
      },
      workstream: {
        estimatedRevenuePotentialCents: 20_000_000,
        estimatedTotalBudgetCents: 750_000,
        speedToFirstDollarDays: 45,
        evidence: ["interview signal", "search trend"],
      },
      workstreamReadiness: {
        stageReadinessScore: 60,
        workItemCompletionRate: 40,
        kpiDefinitionScore: 70,
        approvalGateScore: 60,
        businessObjectiveScore: 50,
        overallReadinessScore: 58,
        isReadyForCEOReview: false,
        blockers: [],
      },
    });
    assert.ok(
      ["refine_offer", "request_ceo_review"].includes(result.recommendation),
      `unexpected recommendation ${result.recommendation}`,
    );
  });

  await t.test("component scores are deterministic", () => {
    const first = score();
    const second = score();
    assert.deepEqual(first, second);
  });

  await t.test("scorer does not mutate opportunity or workstream inputs", () => {
    const brief = makeBrief();
    const workstream = makeWorkstream();
    const beforeBrief = clone(brief);
    const beforeWorkstream = clone(workstream);

    scoreAgentVentureProfitability({ brief, workstream });

    assert.deepEqual(brief, beforeBrief);
    assert.deepEqual(workstream, beforeWorkstream);
  });

  await t.test("KPI quality affects score", () => {
    const strong = score();
    const weak = score({
      workstream: {
        kpis: [
          {
            kpiId: "kpi-weak-001",
            label: "Weak",
            description: "",
            targetValue: "",
            currentValue: null,
            unit: "",
            isCritical: false,
          },
        ],
      },
    });
    assert.ok(strong.kpiQualityScore > weak.kpiQualityScore);
    assert.ok(strong.profitabilityScore > weak.profitabilityScore);
  });

  await t.test("workstream readiness affects score", () => {
    const high = score({
      workstreamReadiness: {
        stageReadinessScore: 100,
        workItemCompletionRate: 100,
        kpiDefinitionScore: 100,
        approvalGateScore: 100,
        businessObjectiveScore: 100,
        overallReadinessScore: 100,
        isReadyForCEOReview: true,
        blockers: [],
      },
    });
    const low = score({
      workstreamReadiness: {
        stageReadinessScore: 20,
        workItemCompletionRate: 0,
        kpiDefinitionScore: 40,
        approvalGateScore: 0,
        businessObjectiveScore: 50,
        overallReadinessScore: 24,
        isReadyForCEOReview: false,
        blockers: ["no approval gates defined"],
      },
    });
    assert.ok(high.readinessContributionScore > low.readinessContributionScore);
    assert.ok(high.profitabilityScore > low.profitabilityScore);
  });

  await t.test("blockers are included in output", () => {
    const result = score({
      brief: {
        evidence: [],
        confidenceScore: 30,
      },
      workstream: {
        evidence: [],
        kpis: [],
      },
    });
    assert.ok(result.blockerCount > 0);
    assert.equal(result.blockerCount, result.blockers.length);
  });

  await t.test("rationale explains recommendation", () => {
    const result = score();
    assert.match(result.rationale, /Profitability score/);
    assert.match(result.rationale, /Risk penalty/);
    assert.match(result.rationale, /justify CEO validation priority/);
  });

  await t.test("Module boundary static source scan", async (t) => {
    const sourceText = readFileSync(
      path.join(__dirname, "agent-venture-profitability.ts"),
      "utf-8",
    );
    const importText = Array.from(sourceText.matchAll(/import[\s\S]*?;/g))
      .map((match) => match[0])
      .join("\n");

    await t.test("scorer imports no Supabase, DB, API, runtime, ledger, filesystem, network, or server action modules", () => {
      assert.ok(!/supabase/i.test(importText), "must not import Supabase");
      assert.ok(!/(^|[/\\])db($|[/\\])/i.test(importText), "must not import db modules");
      assert.ok(!/(^|[/\\])api($|[/\\])/i.test(importText), "must not import API modules");
      assert.ok(!/runtime/i.test(importText), "must not import runtime modules");
      assert.ok(!/ledger/i.test(importText), "must not import Action Ledger modules");
      assert.ok(!/node:fs|["']fs["']/.test(importText), "must not import filesystem modules");
      assert.ok(!/node:http|node:https|fetch/.test(importText), "must not import network modules");
      assert.ok(!/server-only|next\/server/i.test(importText), "must not import server action modules");
    });

    await t.test("scorer source does not export persistence, approval, or execution functions", () => {
      assert.ok(!sourceText.match(/\bexport\s+function\s+save/i), "must not export save functions");
      assert.ok(!sourceText.match(/\bexport\s+function\s+persist/i), "must not export persist functions");
      assert.ok(!sourceText.match(/\bexport\s+function\s+approve/i), "must not export approve functions");
      assert.ok(!sourceText.match(/\bexport\s+function\s+execute/i), "must not export execute functions");
    });
  });

  await t.test("UI static source scan", async (t) => {
    const panelSource = readFileSync(
      path.join(__dirname, "components", "agent-venture-profitability-panel.tsx"),
      "utf-8",
    );
    const workbenchSource = readFileSync(
      path.join(__dirname, "components", "agent-venture-workbench.tsx"),
      "utf-8",
    );
    const combined = `${panelSource}\n${workbenchSource}`;
    const combinedImports = Array.from(combined.matchAll(/import[\s\S]*?;/g))
      .map((match) => match[0])
      .join("\n");

    await t.test("UI has no server actions, API calls, Supabase, DB, repository, runtime, or ledger imports", () => {
      assert.ok(!combined.includes('"use server"') && !combined.includes("'use server'"), "must not contain use server");
      assert.ok(!/supabase/i.test(combinedImports), "must not import Supabase");
      assert.ok(!/@\/server|src\/server|\.\.\/server/.test(combinedImports), "must not import server modules");
      assert.ok(!/\/api\/|fetch\(/i.test(combined), "must not call API routes or fetch");
      assert.ok(!/repository|venture-save-action|venture-lifecycle-action/i.test(combinedImports), "must not import repository or action modules");
      assert.ok(!/runtime/i.test(combinedImports), "must not import runtime modules");
      assert.ok(!/ledger/i.test(combinedImports), "must not import Action Ledger modules");
    });

    await t.test("UI has no active save, approve, or execute handlers", () => {
      assert.ok(!/onSave|handleSave|saveAsCandidate/i.test(combined), "must not expose active save handlers");
      assert.ok(!/onApprove|handleApprove/i.test(combined), "must not expose active approve handlers");
      assert.ok(!/onExecute|handleExecute/i.test(combined), "must not expose active execute handlers");
      assert.ok(!/formAction=|action=/.test(combined), "must not expose form actions");
    });
  });
});
