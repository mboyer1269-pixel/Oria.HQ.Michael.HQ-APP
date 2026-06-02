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

test("AgentVenturePrioritization", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const { buildAgentVentureWorkbenchItem } = await jiti.import(
    path.join(__dirname, "agent-venture-workbench-data.ts"),
  );
  const { buildAgentVenturePrioritizationQueue } = await jiti.import(
    path.join(__dirname, "agent-venture-prioritization.ts"),
  );

  function makeBrief(overrides = {}) {
    return {
      briefId: "brief-prio-001",
      agentId: "agent-revenue-001",
      source: "agent_generated",
      title: "Revenue-ranked opportunity",
      targetCustomer: "Operators with urgent workflow pain",
      problem: "Manual coordination delays revenue",
      proposedOffer: "Paid workflow automation sprint",
      revenueModel: "subscription",
      estimatedRevenuePotentialCents: 80_000_000,
      estimatedValidationCostCents: 200_000,
      speedToFirstDollarDays: 12,
      automationPotentialScore: 82,
      confidenceScore: 76,
      risk: {
        riskLevel: "low",
        riskFactors: ["narrow entry segment"],
        mitigationNotes: ["start narrow"],
      },
      validationPlan: {
        hypothesis: "Operators will pay for a faster workflow outcome",
        firstValidationStep: "Run paid discovery calls",
        validationChannel: "Founder communities",
        successMetric: "paid calls booked",
        successThreshold: "3 paid calls in 14 days",
        validationWindowDays: 14,
        budgetCapCents: 200_000,
      },
      killCriteria: [
        {
          metric: "paid interest",
          threshold: "fewer than 2 paid calls",
          reason: "insufficient demand",
        },
      ],
      recommendedDecision: "prepare_validation_plan",
      nextAction: {
        actionLabel: "Prepare paid discovery offer",
        rationale: "Validate willingness to pay before building",
        estimatedEffortHours: 6,
      },
      rationale: "Fast path to first dollar with tight validation scope",
      evidence: ["interview signal", "community demand", "competitor gap"],
      createdAt: "2026-06-02T00:00:00.000Z",
      humanOnTheLoop: true,
      approvalRequired: true,
      noExecutionAuthorized: true,
      ...overrides,
    };
  }

  function makeWorkstream(overrides = {}) {
    return {
      workstreamId: "ws-prio-001",
      briefId: "brief-prio-001",
      ventureId: null,
      agentId: "agent-revenue-001",
      title: "Revenue-ranked opportunity",
      stage: "validation",
      status: "pending_ceo_review",
      targetCustomer: "Operators with urgent workflow pain",
      problem: "Manual coordination delays revenue",
      proposedOffer: "Paid workflow automation sprint",
      estimatedRevenuePotentialCents: 80_000_000,
      estimatedTotalBudgetCents: 200_000,
      speedToFirstDollarDays: 12,
      businessObjectives: [
        {
          objectiveId: "obj-prio-001",
          label: "Validate paid demand",
          rationale: "Paid demand matters more than attention",
          expectedRevenueImpactCents: 80_000_000,
          timeHorizonDays: 90,
        },
        {
          objectiveId: "obj-prio-002",
          label: "Define first acquisition path",
          rationale: "Acquisition clarity reduces risk",
          expectedRevenueImpactCents: 20_000_000,
          timeHorizonDays: 30,
        },
      ],
      workItems: [
        {
          itemId: "wi-prio-001",
          title: "Draft paid discovery offer",
          description: "Create the first paid offer",
          type: "validation",
          status: "completed",
          estimatedEffortHours: 4,
          expectedOutput: "Offer draft",
          successCriteria: "CEO can review the offer",
          requiresHumanApproval: true,
          agentId: null,
        },
        {
          itemId: "wi-prio-002",
          title: "Prepare buyer interview questions",
          description: "Prepare discovery questions",
          type: "research",
          status: "completed",
          estimatedEffortHours: 3,
          expectedOutput: "Discovery script",
          successCriteria: "Clear buying signals",
          requiresHumanApproval: false,
          agentId: "agent-revenue-001",
        },
      ],
      kpis: [
        {
          kpiId: "kpi-prio-001",
          label: "Paid calls",
          description: "Paid discovery calls booked",
          targetValue: "3",
          currentValue: "0",
          unit: "calls",
          isCritical: true,
        },
        {
          kpiId: "kpi-prio-002",
          label: "Revenue test speed",
          description: "Days to first paid call",
          targetValue: "14",
          currentValue: "0",
          unit: "days",
          isCritical: true,
        },
      ],
      approvalGates: [
        {
          gateId: "gate-prio-001",
          label: "CEO revenue review",
          description: "Required before any future external action",
          stage: "validation",
          requiredBefore: "Any execution path",
          approvalCriteria: ["Offer reviewed", "Buyer script reviewed"],
          humanReviewRequired: true,
          ledgerEntryRequired: true,
        },
      ],
      autonomyBoundary: {
        maxBudgetCents: 0,
        allowedActions: [],
        forbiddenActions: ["send", "publish", "spend", "execute"],
        requiresHumanApprovalAboveCents: 0,
        maxParallelAgents: 1,
      },
      riskFactors: ["narrow entry segment"],
      killCriteria: ["Fewer than two paid calls"],
      rationale: "Fast path to first dollar with tight validation scope",
      evidence: ["interview signal", "community demand", "competitor gap"],
      nextRecommendedAction: "CEO review revenue validation draft",
      createdAt: "2026-06-02T00:00:00.000Z",
      updatedAt: "2026-06-02T00:00:00.000Z",
      humanOnTheLoop: true,
      approvalRequired: true,
      noExecutionAuthorized: true,
      ...overrides,
    };
  }

  function makeWorkbenchItem(id, overrides = {}) {
    return buildAgentVentureWorkbenchItem({
      id,
      brief: makeBrief(overrides.brief),
      workstream: makeWorkstream(overrides.workstream),
    });
  }

  await t.test("sorting prioritizes faster lower-cost higher-profitability items", () => {
    const fast = makeWorkbenchItem("fast", {});
    const slow = makeWorkbenchItem("slow", {
      brief: {
        title: "Slow expensive opportunity",
        speedToFirstDollarDays: 60,
        estimatedValidationCostCents: 900_000,
        confidenceScore: 58,
      },
      workstream: {
        title: "Slow expensive opportunity",
        speedToFirstDollarDays: 60,
        estimatedTotalBudgetCents: 900_000,
      },
    });

    const queue = buildAgentVenturePrioritizationQueue([slow, fast]);
    assert.equal(queue[0].workbenchItemId, "fast");
    assert.equal(queue[0].rank, 1);
  });

  await t.test("critical risk does not outrank a cleaner validation priority", () => {
    const clean = makeWorkbenchItem("clean", {});
    const critical = makeWorkbenchItem("critical", {
      brief: {
        title: "Critical-risk opportunity",
        risk: {
          riskLevel: "critical",
          riskFactors: ["regulatory exposure"],
          mitigationNotes: [],
        },
      },
      workstream: {
        title: "Critical-risk opportunity",
      },
    });

    const queue = buildAgentVenturePrioritizationQueue([critical, clean]);
    assert.equal(queue[0].workbenchItemId, "clean");
    assert.equal(queue[1].recommendation, "request_ceo_review");
  });

  await t.test("high profitability with severe blockers is flagged", () => {
    const blocked = makeWorkbenchItem("blocked", {
      brief: {
        title: "Blocked high-profitability opportunity",
        evidence: [],
        estimatedRevenuePotentialCents: 120_000_000,
      },
      workstream: {
        title: "Blocked high-profitability opportunity",
        evidence: [],
      },
    });

    const queue = buildAgentVenturePrioritizationQueue([blocked]);
    assert.equal(queue[0].blockerSeverity, "severe");
    assert.ok(queue[0].blockers.length > 0);
  });

  await t.test("tie-breakers prefer fewer blockers then faster first dollar then lower cost", () => {
    const itemA = makeWorkbenchItem("item-a", {
      brief: {
        title: "Item A",
        speedToFirstDollarDays: 20,
        estimatedValidationCostCents: 300_000,
      },
      workstream: {
        title: "Item A",
        speedToFirstDollarDays: 20,
        estimatedTotalBudgetCents: 300_000,
      },
    });
    const itemB = makeWorkbenchItem("item-b", {
      brief: {
        title: "Item B",
        speedToFirstDollarDays: 20,
        estimatedValidationCostCents: 300_000,
      },
      workstream: {
        title: "Item B",
        speedToFirstDollarDays: 20,
        estimatedTotalBudgetCents: 300_000,
      },
    });

    const queue = buildAgentVenturePrioritizationQueue([itemB, itemA]);
    assert.equal(queue[0].workbenchItemId, "item-a");
    assert.equal(queue[1].workbenchItemId, "item-b");
  });

  await t.test("ranking is deterministic", () => {
    const items = [
      makeWorkbenchItem("a"),
      makeWorkbenchItem("b", {
        brief: { title: "B", speedToFirstDollarDays: 18 },
        workstream: { title: "B", speedToFirstDollarDays: 18 },
      }),
    ];
    const first = buildAgentVenturePrioritizationQueue(items);
    const second = buildAgentVenturePrioritizationQueue(items);
    assert.deepEqual(first, second);
  });

  await t.test("ranking does not mutate inputs", () => {
    const items = [
      makeWorkbenchItem("a"),
      makeWorkbenchItem("b", {
        brief: { title: "B" },
        workstream: { title: "B" },
      }),
    ];
    const before = clone(items);
    buildAgentVenturePrioritizationQueue(items);
    assert.deepEqual(items, before);
  });

  await t.test("queue exposes revenue-loop fields", () => {
    const queue = buildAgentVenturePrioritizationQueue([makeWorkbenchItem("a")]);
    assert.ok(typeof queue[0].offerClarityScore === "number");
    assert.ok(typeof queue[0].acquisitionEaseScore === "number");
    assert.ok(typeof queue[0].estimatedMarginScore === "number");
    assert.match(queue[0].whyRankedThere, /offer clarity/i);
    assert.match(queue[0].whyRankedThere, /estimated margin/i);
  });

  await t.test("Module boundary static source scan", async (t) => {
    const helperSource = readFileSync(
      path.join(__dirname, "agent-venture-prioritization.ts"),
      "utf-8",
    );
    const panelSource = readFileSync(
      path.join(__dirname, "components", "venture-prioritization-queue-panel.tsx"),
      "utf-8",
    );
    const helperImports = Array.from(helperSource.matchAll(/import[\s\S]*?;/g))
      .map((match) => match[0])
      .join("\n");
    const panelImports = Array.from(panelSource.matchAll(/import[\s\S]*?;/g))
      .map((match) => match[0])
      .join("\n");

    await t.test("helper imports no Supabase, DB, API, runtime, ledger, repository, or server modules", () => {
      assert.ok(!/supabase/i.test(helperImports), "must not import Supabase");
      assert.ok(!/(^|[/\\])db($|[/\\])/i.test(helperImports), "must not import db");
      assert.ok(!/(^|[/\\])api($|[/\\])/i.test(helperImports), "must not import api");
      assert.ok(!/runtime|ledger|repository/i.test(helperImports), "must not import runtime, ledger, or repository");
      assert.ok(!/@\/server|src\/server|\.\.\/server|server-only|next\/server/i.test(helperImports), "must not import server modules");
    });

    await t.test("helper exports no save or execute paths", () => {
      assert.ok(!/\bexport\s+function\s+save/i.test(helperSource), "must not export save functions");
      assert.ok(!/\bexport\s+function\s+execute/i.test(helperSource), "must not export execute functions");
    });

    await t.test("UI has no save or execution handlers and no prohibited imports", () => {
      assert.ok(!/supabase|repository|venture-save-action|venture-lifecycle-action/i.test(panelImports), "must not import write paths");
      assert.ok(!/onSave|handleSave|onExecute|handleExecute|onApprove|handleApprove/i.test(panelSource), "must not expose active save/approve/execute handlers");
      assert.ok(!/fetch\(|\/api\/|use server|server-only|next\/server/i.test(panelSource), "must not call api or server actions");
    });
  });
});
