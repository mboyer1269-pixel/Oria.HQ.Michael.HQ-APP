#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("AgentVentureWorkbenchData", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(path.join(__dirname, "agent-venture-workbench-data.ts"));
  const {
    buildAgentVentureWorkbenchItem,
    AGENT_VENTURE_WORKBENCH_SEED,
    AGENT_VENTURE_WORKBENCH_ITEMS,
  } = mod;

  // ---------------------------------------------------------------------------
  // Group 1 — buildAgentVentureWorkbenchItem
  // ---------------------------------------------------------------------------
  await t.test("buildAgentVentureWorkbenchItem", async (t) => {
    function makeSampleBrief() {
      return {
        briefId: "brief-test-001",
        agentId: "agent-test-001",
        source: "agent_generated",
        title: "Test Opportunity",
        targetCustomer: "Test customer segment",
        problem: "Test problem statement",
        proposedOffer: "Test proposed offer",
        revenueModel: "subscription",
        estimatedRevenuePotentialCents: 60_000_000,
        estimatedValidationCostCents: 300_000,
        speedToFirstDollarDays: 21,
        automationPotentialScore: 82,
        confidenceScore: 71,
        risk: {
          riskLevel: "medium",
          riskFactors: ["competition", "trust barrier"],
          mitigationNotes: ["focus on underserved segment"],
        },
        validationPlan: {
          hypothesis: "Customers will pay $49/mo",
          firstValidationStep: "Run 5 discovery calls",
          validationChannel: "Twitter",
          successMetric: "3 of 5 willing to pay",
          successThreshold: "60%",
          validationWindowDays: 21,
          budgetCapCents: 300_000,
        },
        killCriteria: [{ metric: "interest", threshold: "less than 2", reason: "no demand" }],
        recommendedDecision: "prepare_validation_plan",
        nextAction: {
          actionLabel: "Launch landing page",
          rationale: "Validate demand",
          estimatedEffortHours: 12,
        },
        rationale: "High automation potential in underserved segment",
        evidence: ["survey data", "twitter research"],
        createdAt: "2026-06-02T00:00:00.000Z",
        humanOnTheLoop: true,
        approvalRequired: true,
        noExecutionAuthorized: true,
      };
    }

    function makeSampleWorkstream() {
      return {
        workstreamId: "ws-test-001",
        briefId: "brief-test-001",
        ventureId: null,
        agentId: "agent-test-001",
        title: "Test Opportunity",
        stage: "discovery",
        status: "draft",
        targetCustomer: "Test customer segment",
        problem: "Test problem statement",
        proposedOffer: "Test proposed offer",
        estimatedRevenuePotentialCents: 60_000_000,
        estimatedTotalBudgetCents: 300_000,
        speedToFirstDollarDays: 21,
        businessObjectives: [
          {
            objectiveId: "obj-test-001",
            label: "Validate willingness to pay",
            rationale: "Proof of demand",
            expectedRevenueImpactCents: 60_000_000,
            timeHorizonDays: 90,
          },
        ],
        workItems: [
          {
            itemId: "wi-test-001",
            title: "Launch landing page",
            description: "Build a simple landing page",
            type: "build",
            status: "not_started",
            estimatedEffortHours: 8,
            expectedOutput: "Landing page live",
            successCriteria: "50+ signups",
            requiresHumanApproval: true,
            agentId: "agent-test-001",
          },
        ],
        kpis: [
          {
            kpiId: "kpi-test-001",
            label: "Discovery calls completed",
            description: "Number of calls done",
            targetValue: "5",
            currentValue: "0",
            unit: "calls",
            isCritical: true,
          },
        ],
        approvalGates: [
          {
            gateId: "gate-test-001",
            label: "CEO validation review",
            description: "CEO reviews results",
            stage: "validation",
            requiredBefore: "Any code investment",
            approvalCriteria: ["3 WTP signals", "CEO signs off"],
            humanReviewRequired: true,
            ledgerEntryRequired: true,
          },
        ],
        autonomyBoundary: {
          maxBudgetCents: 0,
          allowedActions: [],
          forbiddenActions: [],
          requiresHumanApprovalAboveCents: 0,
          maxParallelAgents: 1,
        },
        riskFactors: ["competition"],
        killCriteria: ["Fewer than 2 willing to pay"],
        rationale: "High automation potential in underserved segment",
        evidence: ["survey data", "twitter research"],
        nextRecommendedAction: "Launch landing page and schedule calls",
        createdAt: "2026-06-02T00:00:00.000Z",
        updatedAt: "2026-06-02T00:00:00.000Z",
        humanOnTheLoop: true,
        approvalRequired: true,
        noExecutionAuthorized: true,
      };
    }

    await t.test("returns a workbench item with id, brief, workstream, briefScore, workstreamReadiness", () => {
      const item = buildAgentVentureWorkbenchItem({
        id: "test-wb-001",
        brief: makeSampleBrief(),
        workstream: makeSampleWorkstream(),
      });
      assert.ok(item.id === "test-wb-001");
      assert.ok(item.brief != null);
      assert.ok(item.workstream != null);
      assert.ok(item.briefScore != null);
      assert.ok(item.workstreamReadiness != null);
    });

    await t.test("briefValid is true for valid seed data", () => {
      const item = buildAgentVentureWorkbenchItem({
        id: "test-wb-001",
        brief: makeSampleBrief(),
        workstream: makeSampleWorkstream(),
      });
      assert.equal(item.briefValid, true, `briefErrors: ${JSON.stringify(item.briefErrors)}`);
    });

    await t.test("workstreamValid is true for valid seed data", () => {
      const item = buildAgentVentureWorkbenchItem({
        id: "test-wb-001",
        brief: makeSampleBrief(),
        workstream: makeSampleWorkstream(),
      });
      assert.equal(item.workstreamValid, true, `workstreamErrors: ${JSON.stringify(item.workstreamErrors)}`);
    });

    await t.test("briefScore contains overallScore and recommendation", () => {
      const item = buildAgentVentureWorkbenchItem({
        id: "test-wb-001",
        brief: makeSampleBrief(),
        workstream: makeSampleWorkstream(),
      });
      assert.ok(typeof item.briefScore.overallScore === "number");
      assert.ok(typeof item.briefScore.recommendation === "string");
    });

    await t.test("workstreamReadiness contains overallReadinessScore and isReadyForCEOReview", () => {
      const item = buildAgentVentureWorkbenchItem({
        id: "test-wb-001",
        brief: makeSampleBrief(),
        workstream: makeSampleWorkstream(),
      });
      assert.ok(typeof item.workstreamReadiness.overallReadinessScore === "number");
      assert.ok(typeof item.workstreamReadiness.isReadyForCEOReview === "boolean");
    });

    await t.test("does not mutate brief input (check evidence length before/after)", () => {
      const brief = makeSampleBrief();
      const lenBefore = brief.evidence.length;
      buildAgentVentureWorkbenchItem({
        id: "test-wb-001",
        brief,
        workstream: makeSampleWorkstream(),
      });
      assert.equal(brief.evidence.length, lenBefore);
    });

    await t.test("does not mutate workstream input (check workItems length before/after)", () => {
      const workstream = makeSampleWorkstream();
      const lenBefore = workstream.workItems.length;
      buildAgentVentureWorkbenchItem({
        id: "test-wb-001",
        brief: makeSampleBrief(),
        workstream,
      });
      assert.equal(workstream.workItems.length, lenBefore);
    });
  });

  // ---------------------------------------------------------------------------
  // Group 2 — Safety flags
  // ---------------------------------------------------------------------------
  await t.test("Safety flags", async (t) => {
    await t.test("AGENT_VENTURE_WORKBENCH_SEED.brief.humanOnTheLoop === true", () => {
      assert.equal(AGENT_VENTURE_WORKBENCH_SEED.brief.humanOnTheLoop, true);
    });

    await t.test("AGENT_VENTURE_WORKBENCH_SEED.brief.approvalRequired === true", () => {
      assert.equal(AGENT_VENTURE_WORKBENCH_SEED.brief.approvalRequired, true);
    });

    await t.test("AGENT_VENTURE_WORKBENCH_SEED.brief.noExecutionAuthorized === true", () => {
      assert.equal(AGENT_VENTURE_WORKBENCH_SEED.brief.noExecutionAuthorized, true);
    });

    await t.test("AGENT_VENTURE_WORKBENCH_SEED.workstream.humanOnTheLoop === true", () => {
      assert.equal(AGENT_VENTURE_WORKBENCH_SEED.workstream.humanOnTheLoop, true);
    });

    await t.test("AGENT_VENTURE_WORKBENCH_SEED.workstream.approvalRequired === true", () => {
      assert.equal(AGENT_VENTURE_WORKBENCH_SEED.workstream.approvalRequired, true);
    });

    await t.test("AGENT_VENTURE_WORKBENCH_SEED.workstream.noExecutionAuthorized === true", () => {
      assert.equal(AGENT_VENTURE_WORKBENCH_SEED.workstream.noExecutionAuthorized, true);
    });
  });

  // ---------------------------------------------------------------------------
  // Group 3 — Content integrity
  // ---------------------------------------------------------------------------
  await t.test("Content integrity", async (t) => {
    await t.test("AGENT_VENTURE_WORKBENCH_ITEMS has length >= 1", () => {
      assert.ok(AGENT_VENTURE_WORKBENCH_ITEMS.length >= 1);
    });

    await t.test("seed item has workItems with length >= 1", () => {
      assert.ok(AGENT_VENTURE_WORKBENCH_SEED.workstream.workItems.length >= 1);
    });

    await t.test("seed item has kpis with length >= 1", () => {
      assert.ok(AGENT_VENTURE_WORKBENCH_SEED.workstream.kpis.length >= 1);
    });

    await t.test("seed item has approvalGates with length >= 1", () => {
      assert.ok(AGENT_VENTURE_WORKBENCH_SEED.workstream.approvalGates.length >= 1);
    });

    await t.test("seed item has businessObjectives with length >= 1", () => {
      assert.ok(AGENT_VENTURE_WORKBENCH_SEED.workstream.businessObjectives.length >= 1);
    });

    await t.test("approval gates all have humanReviewRequired === true", () => {
      for (const gate of AGENT_VENTURE_WORKBENCH_SEED.workstream.approvalGates) {
        assert.equal(gate.humanReviewRequired, true, `gate ${gate.gateId} missing humanReviewRequired`);
      }
    });

    await t.test("approval gates all have ledgerEntryRequired === true", () => {
      for (const gate of AGENT_VENTURE_WORKBENCH_SEED.workstream.approvalGates) {
        assert.equal(gate.ledgerEntryRequired, true, `gate ${gate.gateId} missing ledgerEntryRequired`);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Group 4 — Module boundary (static source scan via readFileSync)
  // ---------------------------------------------------------------------------
  await t.test("Module boundary (static source scan)", async (t) => {
    const sourceText = readFileSync(
      path.join(__dirname, "agent-venture-workbench-data.ts"),
      "utf-8",
    );

    await t.test("source file does not import supabase", () => {
      assert.ok(!sourceText.includes("@supabase/supabase-js"), "must not import @supabase/supabase-js");
      assert.ok(!sourceText.includes("@supabase/ssr"), "must not import @supabase/ssr");
    });

    await t.test("source file does not import database drivers", () => {
      assert.ok(!sourceText.includes("'pg'") && !sourceText.includes('"pg"'), "must not import pg");
      assert.ok(
        !sourceText.includes("'postgres'") && !sourceText.includes('"postgres"'),
        "must not import postgres",
      );
    });

    await t.test("source file does not contain 'saveWorkbench' or 'persistWorkbench' or 'approve' or 'execute'", () => {
      assert.ok(!sourceText.includes("saveWorkbench"), "must not contain saveWorkbench");
      assert.ok(!sourceText.includes("persistWorkbench"), "must not contain persistWorkbench");
      // Check for standalone approve/execute function names (not field names like approvalRequired/requiresHumanApproval)
      assert.ok(!sourceText.match(/\bfunction approve\b/) && !sourceText.match(/\bexport.*approve\b/), "must not export an approve function");
      assert.ok(!sourceText.match(/\bfunction execute\b/) && !sourceText.match(/\bexport.*execute\b/), "must not export an execute function");
    });

    await t.test("source file does not import 'server-only'", () => {
      assert.ok(!sourceText.includes("server-only"), "must not contain server-only");
    });

    await t.test("source file does not import from 'next/server'", () => {
      assert.ok(!sourceText.includes("next/server"), "must not import from next/server");
    });
  });
});
