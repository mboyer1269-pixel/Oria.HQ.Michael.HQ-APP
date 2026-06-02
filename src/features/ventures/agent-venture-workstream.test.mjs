#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

function makeObjective(overrides = {}) {
  return {
    objectiveId: "obj-001",
    label: "Reach first paying customer",
    rationale: "Validate product-market fit early",
    expectedRevenueImpactCents: 1_000_000,
    timeHorizonDays: 60,
    ...overrides,
  };
}

function makeWorkItem(overrides = {}) {
  return {
    itemId: "item-001",
    title: "Customer discovery interviews",
    description: "Conduct 10 structured interviews with target customers",
    type: "research",
    status: "not_started",
    estimatedEffortHours: 20,
    expectedOutput: "Interview summary report",
    successCriteria: "At least 7 of 10 confirm the problem",
    requiresHumanApproval: false,
    agentId: null,
    ...overrides,
  };
}

function makeKPI(overrides = {}) {
  return {
    kpiId: "kpi-001",
    label: "Customer interviews completed",
    description: "Number of customer discovery interviews completed",
    targetValue: "10",
    currentValue: null,
    unit: "interviews",
    isCritical: true,
    ...overrides,
  };
}

function makeGate(overrides = {}) {
  return {
    gateId: "gate-001",
    label: "Discovery gate",
    description: "CEO review before moving to validation",
    stage: "discovery",
    requiredBefore: "validation",
    approvalCriteria: ["At least 7 customer interviews completed", "Problem confirmed"],
    humanReviewRequired: true,
    ledgerEntryRequired: true,
    ...overrides,
  };
}

function makeWorkstream(overrides = {}) {
  return {
    workstreamId: "ws-001",
    agentId: "agent-001",
    briefId: "brief-001",
    ventureId: null,
    title: "AI-powered customer onboarding automation",
    targetCustomer: "SaaS companies with high churn",
    problem: "New users don't activate because onboarding is manual and slow",
    proposedOffer: "Automated onboarding flow builder with AI nudges",
    rationale: "High automation potential with clear customer pain point",
    nextRecommendedAction: "Conduct 10 customer discovery interviews",
    stage: "discovery",
    status: "draft",
    estimatedRevenuePotentialCents: 10_000_000,
    estimatedTotalBudgetCents: 500_000,
    speedToFirstDollarDays: 30,
    businessObjectives: [makeObjective()],
    workItems: [makeWorkItem()],
    kpis: [makeKPI()],
    approvalGates: [makeGate()],
    autonomyBoundary: {
      maxBudgetCents: 100_000,
      allowedActions: ["research"],
      forbiddenActions: ["execute"],
      requiresHumanApprovalAboveCents: 50_000,
      maxParallelAgents: 2,
    },
    riskFactors: ["market risk"],
    killCriteria: ["no customers after 30 days"],
    evidence: ["initial research"],
    createdAt: "2026-06-02T00:00:00.000Z",
    updatedAt: "2026-06-02T00:00:00.000Z",
    humanOnTheLoop: true,
    approvalRequired: true,
    noExecutionAuthorized: true,
    ...overrides,
  };
}

test("AgentVentureWorkstream model", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(path.join(__dirname, "agent-venture-workstream.ts"));
  const {
    validateAgentVentureWorkstream,
    scoreAgentVentureWorkstreamReadiness,
    buildAgentVentureWorkstream,
    fromOpportunityBriefToWorkstream,
  } = mod;

  // ---------------------------------------------------------------------------
  // Group 1 — Validation: valid workstream
  // ---------------------------------------------------------------------------
  await t.test("Validation: valid workstream", async (t) => {
    await t.test("full valid discovery workstream passes", () => {
      const result = validateAgentVentureWorkstream(makeWorkstream());
      assert.equal(result.valid, true);
      assert.deepEqual(result.errors, []);
    });

    await t.test("all safety flags are true", () => {
      const ws = makeWorkstream();
      assert.equal(ws.humanOnTheLoop, true);
      assert.equal(ws.approvalRequired, true);
      assert.equal(ws.noExecutionAuthorized, true);
    });
  });

  // ---------------------------------------------------------------------------
  // Group 2 — Validation: required string fields
  // ---------------------------------------------------------------------------
  await t.test("Validation: required string fields", async (t) => {
    await t.test("empty workstreamId -> invalid", () => {
      const result = validateAgentVentureWorkstream(makeWorkstream({ workstreamId: "" }));
      assert.equal(result.valid, false);
    });

    await t.test("empty agentId -> invalid", () => {
      const result = validateAgentVentureWorkstream(makeWorkstream({ agentId: "" }));
      assert.equal(result.valid, false);
    });

    await t.test("empty title -> invalid", () => {
      const result = validateAgentVentureWorkstream(makeWorkstream({ title: "" }));
      assert.equal(result.valid, false);
    });

    await t.test("empty targetCustomer -> invalid", () => {
      const result = validateAgentVentureWorkstream(makeWorkstream({ targetCustomer: "" }));
      assert.equal(result.valid, false);
    });

    await t.test("empty problem -> invalid", () => {
      const result = validateAgentVentureWorkstream(makeWorkstream({ problem: "" }));
      assert.equal(result.valid, false);
    });

    await t.test("empty proposedOffer -> invalid", () => {
      const result = validateAgentVentureWorkstream(makeWorkstream({ proposedOffer: "" }));
      assert.equal(result.valid, false);
    });

    await t.test("empty rationale -> invalid", () => {
      const result = validateAgentVentureWorkstream(makeWorkstream({ rationale: "" }));
      assert.equal(result.valid, false);
    });

    await t.test("empty nextRecommendedAction -> invalid", () => {
      const result = validateAgentVentureWorkstream(makeWorkstream({ nextRecommendedAction: "" }));
      assert.equal(result.valid, false);
    });
  });

  // ---------------------------------------------------------------------------
  // Group 3 — Validation: enum and numeric fields
  // ---------------------------------------------------------------------------
  await t.test("Validation: enum and numeric fields", async (t) => {
    await t.test("invalid stage -> invalid", () => {
      const result = validateAgentVentureWorkstream(
        makeWorkstream({ stage: /** @type {any} */ ("unknown_stage") }),
      );
      assert.equal(result.valid, false);
    });

    await t.test("invalid status -> invalid", () => {
      const result = validateAgentVentureWorkstream(
        makeWorkstream({ status: /** @type {any} */ ("unknown_status") }),
      );
      assert.equal(result.valid, false);
    });

    await t.test("negative estimatedRevenuePotentialCents -> invalid", () => {
      const result = validateAgentVentureWorkstream(
        makeWorkstream({ estimatedRevenuePotentialCents: -1 }),
      );
      assert.equal(result.valid, false);
    });

    await t.test("negative estimatedTotalBudgetCents -> invalid", () => {
      const result = validateAgentVentureWorkstream(
        makeWorkstream({ estimatedTotalBudgetCents: -1 }),
      );
      assert.equal(result.valid, false);
    });

    await t.test("negative speedToFirstDollarDays -> invalid", () => {
      const result = validateAgentVentureWorkstream(
        makeWorkstream({ speedToFirstDollarDays: -1 }),
      );
      assert.equal(result.valid, false);
    });
  });

  // ---------------------------------------------------------------------------
  // Group 4 — Validation: safety flags
  // ---------------------------------------------------------------------------
  await t.test("Validation: safety flags", async (t) => {
    await t.test("humanOnTheLoop: false as any -> invalid", () => {
      const result = validateAgentVentureWorkstream(
        makeWorkstream({ humanOnTheLoop: /** @type {any} */ (false) }),
      );
      assert.equal(result.valid, false);
    });

    await t.test("approvalRequired: false as any -> invalid", () => {
      const result = validateAgentVentureWorkstream(
        makeWorkstream({ approvalRequired: /** @type {any} */ (false) }),
      );
      assert.equal(result.valid, false);
    });

    await t.test("noExecutionAuthorized: false as any -> invalid", () => {
      const result = validateAgentVentureWorkstream(
        makeWorkstream({ noExecutionAuthorized: /** @type {any} */ (false) }),
      );
      assert.equal(result.valid, false);
    });
  });

  // ---------------------------------------------------------------------------
  // Group 5 — Validation: sub-model validation
  // ---------------------------------------------------------------------------
  await t.test("Validation: sub-model validation", async (t) => {
    await t.test("empty killCriteria -> invalid", () => {
      const result = validateAgentVentureWorkstream(makeWorkstream({ killCriteria: [] }));
      assert.equal(result.valid, false);
    });

    await t.test("workItem with empty itemId -> invalid", () => {
      const result = validateAgentVentureWorkstream(
        makeWorkstream({ workItems: [makeWorkItem({ itemId: "" })] }),
      );
      assert.equal(result.valid, false);
    });

    await t.test("workItem with invalid type -> invalid", () => {
      const result = validateAgentVentureWorkstream(
        makeWorkstream({ workItems: [makeWorkItem({ type: /** @type {any} */ ("invalid_type") })] }),
      );
      assert.equal(result.valid, false);
    });

    await t.test("workItem with negative estimatedEffortHours -> invalid", () => {
      const result = validateAgentVentureWorkstream(
        makeWorkstream({ workItems: [makeWorkItem({ estimatedEffortHours: -1 })] }),
      );
      assert.equal(result.valid, false);
    });

    await t.test("kpi with empty kpiId -> invalid", () => {
      const result = validateAgentVentureWorkstream(
        makeWorkstream({ kpis: [makeKPI({ kpiId: "" })] }),
      );
      assert.equal(result.valid, false);
    });

    await t.test("approvalGate with empty gateId -> invalid", () => {
      const result = validateAgentVentureWorkstream(
        makeWorkstream({ approvalGates: [makeGate({ gateId: "" })] }),
      );
      assert.equal(result.valid, false);
    });

    await t.test("approvalGate with invalid stage -> invalid", () => {
      const result = validateAgentVentureWorkstream(
        makeWorkstream({
          approvalGates: [makeGate({ stage: /** @type {any} */ ("not_a_stage") })],
        }),
      );
      assert.equal(result.valid, false);
    });

    await t.test("businessObjective with empty objectiveId -> invalid", () => {
      const result = validateAgentVentureWorkstream(
        makeWorkstream({ businessObjectives: [makeObjective({ objectiveId: "" })] }),
      );
      assert.equal(result.valid, false);
    });

    await t.test("businessObjective with timeHorizonDays: 0 -> invalid", () => {
      const result = validateAgentVentureWorkstream(
        makeWorkstream({ businessObjectives: [makeObjective({ timeHorizonDays: 0 })] }),
      );
      assert.equal(result.valid, false);
    });

    await t.test("invalid createdAt string -> invalid", () => {
      const result = validateAgentVentureWorkstream(
        makeWorkstream({ createdAt: "not-a-date" }),
      );
      assert.equal(result.valid, false);
    });

    await t.test("maxParallelAgents: 0 -> invalid", () => {
      const result = validateAgentVentureWorkstream(
        makeWorkstream({
          autonomyBoundary: {
            maxBudgetCents: 100_000,
            allowedActions: ["research"],
            forbiddenActions: ["execute"],
            requiresHumanApprovalAboveCents: 50_000,
            maxParallelAgents: 0,
          },
        }),
      );
      assert.equal(result.valid, false);
    });
  });

  // ---------------------------------------------------------------------------
  // Group 6 — Scoring: readiness scores
  // ---------------------------------------------------------------------------
  await t.test("Scoring: readiness scores", async (t) => {
    await t.test("discovery workstream with 1 workItem and rationale -> stageReadinessScore >= 100", () => {
      const ws = makeWorkstream({ stage: "discovery", workItems: [makeWorkItem()] });
      const score = scoreAgentVentureWorkstreamReadiness(ws);
      assert.ok(score.stageReadinessScore >= 100, `expected >= 100, got ${score.stageReadinessScore}`);
    });

    await t.test("workstream with 0 workItems -> workItemCompletionRate === 0", () => {
      const ws = makeWorkstream({ workItems: [] });
      const score = scoreAgentVentureWorkstreamReadiness(ws);
      assert.equal(score.workItemCompletionRate, 0);
    });

    await t.test("workstream with 2 completed workItems out of 4 -> workItemCompletionRate === 50", () => {
      const ws = makeWorkstream({
        workItems: [
          makeWorkItem({ itemId: "i1", status: "completed" }),
          makeWorkItem({ itemId: "i2", status: "completed" }),
          makeWorkItem({ itemId: "i3", status: "not_started" }),
          makeWorkItem({ itemId: "i4", status: "not_started" }),
        ],
      });
      const score = scoreAgentVentureWorkstreamReadiness(ws);
      assert.equal(score.workItemCompletionRate, 50);
    });

    await t.test("workstream with 0 kpis -> kpiDefinitionScore === 0", () => {
      const ws = makeWorkstream({ kpis: [] });
      const score = scoreAgentVentureWorkstreamReadiness(ws);
      assert.equal(score.kpiDefinitionScore, 0);
    });

    await t.test("workstream with 3+ kpis (1 critical) -> kpiDefinitionScore === 100", () => {
      const ws = makeWorkstream({
        kpis: [
          makeKPI({ kpiId: "k1", isCritical: true }),
          makeKPI({ kpiId: "k2", isCritical: false }),
          makeKPI({ kpiId: "k3", isCritical: false }),
        ],
      });
      const score = scoreAgentVentureWorkstreamReadiness(ws);
      assert.equal(score.kpiDefinitionScore, 100);
    });

    await t.test("workstream with 0 approvalGates -> approvalGateScore === 0", () => {
      const ws = makeWorkstream({ approvalGates: [], killCriteria: ["no customers after 30 days"] });
      const score = scoreAgentVentureWorkstreamReadiness(ws);
      assert.equal(score.approvalGateScore, 0);
    });

    await t.test("workstream with 2+ approvalGates -> approvalGateScore === 100", () => {
      const ws = makeWorkstream({
        approvalGates: [
          makeGate({ gateId: "g1" }),
          makeGate({ gateId: "g2" }),
        ],
      });
      const score = scoreAgentVentureWorkstreamReadiness(ws);
      assert.equal(score.approvalGateScore, 100);
    });

    await t.test("workstream with 0 businessObjectives -> businessObjectiveScore === 0", () => {
      const ws = makeWorkstream({ businessObjectives: [] });
      const score = scoreAgentVentureWorkstreamReadiness(ws);
      assert.equal(score.businessObjectiveScore, 0);
    });

    await t.test("workstream with 3+ businessObjectives -> businessObjectiveScore === 100", () => {
      const ws = makeWorkstream({
        businessObjectives: [
          makeObjective({ objectiveId: "o1" }),
          makeObjective({ objectiveId: "o2" }),
          makeObjective({ objectiveId: "o3" }),
        ],
      });
      const score = scoreAgentVentureWorkstreamReadiness(ws);
      assert.equal(score.businessObjectiveScore, 100);
    });
  });

  // ---------------------------------------------------------------------------
  // Group 7 — Scoring: CEO review readiness
  // ---------------------------------------------------------------------------
  await t.test("Scoring: CEO review readiness", async (t) => {
    await t.test("well-defined workstream (all components high) -> isReadyForCEOReview === true", () => {
      // discovery stage + 1 workItem + rationale => stageReadinessScore 100
      // 4 completed workItems => workItemCompletionRate 100
      // 3 kpis with 1 critical => kpiDefinitionScore 100
      // 2 approvalGates => approvalGateScore 100
      // 3 businessObjectives => businessObjectiveScore 100
      // weighted = 100*0.3 + 100*0.2 + 100*0.2 + 100*0.15 + 100*0.15 = 100
      const ws = makeWorkstream({
        stage: "discovery",
        workItems: [
          makeWorkItem({ itemId: "i1", status: "completed" }),
          makeWorkItem({ itemId: "i2", status: "completed" }),
          makeWorkItem({ itemId: "i3", status: "completed" }),
          makeWorkItem({ itemId: "i4", status: "completed" }),
        ],
        kpis: [
          makeKPI({ kpiId: "k1", isCritical: true }),
          makeKPI({ kpiId: "k2", isCritical: false }),
          makeKPI({ kpiId: "k3", isCritical: false }),
        ],
        approvalGates: [
          makeGate({ gateId: "g1" }),
          makeGate({ gateId: "g2" }),
        ],
        businessObjectives: [
          makeObjective({ objectiveId: "o1" }),
          makeObjective({ objectiveId: "o2" }),
          makeObjective({ objectiveId: "o3" }),
        ],
      });
      const score = scoreAgentVentureWorkstreamReadiness(ws);
      assert.equal(score.isReadyForCEOReview, true);
    });

    await t.test("minimal discovery draft (low scores) -> isReadyForCEOReview === false", () => {
      // discovery with 0 workItems -> stageReadinessScore=50
      // 0 workItems -> workItemCompletionRate=0
      // 0 kpis -> kpiDefinitionScore=0
      // 0 approvalGates -> approvalGateScore=0
      // 0 businessObjectives -> businessObjectiveScore=0
      // weighted = 50*0.3 + 0*0.2 + 0*0.2 + 0*0.15 + 0*0.15 = 15 => not ready
      const ws = makeWorkstream({
        stage: "discovery",
        workItems: [],
        kpis: [],
        approvalGates: [],
        businessObjectives: [],
        killCriteria: ["no customers after 30 days"],
      });
      const score = scoreAgentVentureWorkstreamReadiness(ws);
      assert.equal(score.isReadyForCEOReview, false);
    });

    await t.test("score >= 70 -> isReadyForCEOReview === true", () => {
      const ws = makeWorkstream({
        stage: "discovery",
        workItems: [
          makeWorkItem({ itemId: "i1", status: "completed" }),
          makeWorkItem({ itemId: "i2", status: "completed" }),
          makeWorkItem({ itemId: "i3", status: "completed" }),
          makeWorkItem({ itemId: "i4", status: "completed" }),
        ],
        kpis: [
          makeKPI({ kpiId: "k1", isCritical: true }),
          makeKPI({ kpiId: "k2", isCritical: false }),
          makeKPI({ kpiId: "k3", isCritical: false }),
        ],
        approvalGates: [
          makeGate({ gateId: "g1" }),
          makeGate({ gateId: "g2" }),
        ],
        businessObjectives: [
          makeObjective({ objectiveId: "o1" }),
          makeObjective({ objectiveId: "o2" }),
          makeObjective({ objectiveId: "o3" }),
        ],
      });
      const score = scoreAgentVentureWorkstreamReadiness(ws);
      assert.ok(score.overallReadinessScore >= 70, `expected >= 70, got ${score.overallReadinessScore}`);
      assert.equal(score.isReadyForCEOReview, true);
    });

    await t.test("blockers list is empty when fully ready", () => {
      const ws = makeWorkstream({
        stage: "discovery",
        workItems: [
          makeWorkItem({ itemId: "i1", status: "completed" }),
          makeWorkItem({ itemId: "i2", status: "completed" }),
        ],
        kpis: [
          makeKPI({ kpiId: "k1", isCritical: true }),
          makeKPI({ kpiId: "k2", isCritical: false }),
          makeKPI({ kpiId: "k3", isCritical: false }),
        ],
        approvalGates: [
          makeGate({ gateId: "g1" }),
          makeGate({ gateId: "g2" }),
        ],
        businessObjectives: [
          makeObjective({ objectiveId: "o1" }),
          makeObjective({ objectiveId: "o2" }),
          makeObjective({ objectiveId: "o3" }),
        ],
        killCriteria: ["no customers after 30 days"],
      });
      const score = scoreAgentVentureWorkstreamReadiness(ws);
      assert.deepEqual(score.blockers, []);
    });
  });

  // ---------------------------------------------------------------------------
  // Group 8 — fromOpportunityBriefToWorkstream helper
  // ---------------------------------------------------------------------------
  await t.test("fromOpportunityBriefToWorkstream helper", async (t) => {
    function makeBriefInput(overrides = {}) {
      return {
        workstreamId: "ws-from-brief-001",
        agentId: "agent-001",
        briefId: "brief-001",
        createdAt: "2026-06-02T00:00:00.000Z",
        updatedAt: "2026-06-02T00:00:00.000Z",
        title: "AI-powered customer onboarding",
        targetCustomer: "SaaS companies",
        problem: "Slow onboarding causes churn",
        proposedOffer: "Automated flow builder",
        estimatedRevenuePotentialCents: 10_000_000,
        estimatedTotalBudgetCents: 500_000,
        speedToFirstDollarDays: 30,
        rationale: "Clear customer pain point",
        evidence: ["research-001", "research-002"],
        riskFactors: ["market risk", "competition"],
        ...overrides,
      };
    }

    await t.test("returns stage: 'discovery'", () => {
      const ws = fromOpportunityBriefToWorkstream(makeBriefInput());
      assert.equal(ws.stage, "discovery");
    });

    await t.test("returns status: 'draft'", () => {
      const ws = fromOpportunityBriefToWorkstream(makeBriefInput());
      assert.equal(ws.status, "draft");
    });

    await t.test("sets humanOnTheLoop: true", () => {
      const ws = fromOpportunityBriefToWorkstream(makeBriefInput());
      assert.equal(ws.humanOnTheLoop, true);
    });

    await t.test("sets approvalRequired: true", () => {
      const ws = fromOpportunityBriefToWorkstream(makeBriefInput());
      assert.equal(ws.approvalRequired, true);
    });

    await t.test("sets noExecutionAuthorized: true", () => {
      const ws = fromOpportunityBriefToWorkstream(makeBriefInput());
      assert.equal(ws.noExecutionAuthorized, true);
    });

    await t.test("copies evidence array (not same reference)", () => {
      const input = makeBriefInput();
      const ws = fromOpportunityBriefToWorkstream(input);
      assert.notEqual(ws.evidence, input.evidence);
      assert.deepEqual(ws.evidence, input.evidence);
    });

    await t.test("copies riskFactors array (not same reference)", () => {
      const input = makeBriefInput();
      const ws = fromOpportunityBriefToWorkstream(input);
      assert.notEqual(ws.riskFactors, input.riskFactors);
      assert.deepEqual(ws.riskFactors, input.riskFactors);
    });

    await t.test("workItems is empty array", () => {
      const ws = fromOpportunityBriefToWorkstream(makeBriefInput());
      assert.deepEqual(ws.workItems, []);
    });

    await t.test("kpis is empty array", () => {
      const ws = fromOpportunityBriefToWorkstream(makeBriefInput());
      assert.deepEqual(ws.kpis, []);
    });

    await t.test("approvalGates is empty array", () => {
      const ws = fromOpportunityBriefToWorkstream(makeBriefInput());
      assert.deepEqual(ws.approvalGates, []);
    });

    await t.test("businessObjectives is empty array", () => {
      const ws = fromOpportunityBriefToWorkstream(makeBriefInput());
      assert.deepEqual(ws.businessObjectives, []);
    });
  });

  // ---------------------------------------------------------------------------
  // Group 9 — Determinism and immutability
  // ---------------------------------------------------------------------------
  await t.test("Determinism and immutability", async (t) => {
    await t.test("scoring is deterministic (same input -> same output twice)", () => {
      const ws = makeWorkstream();
      const s1 = scoreAgentVentureWorkstreamReadiness(ws);
      const s2 = scoreAgentVentureWorkstreamReadiness(ws);
      assert.deepEqual(s1, s2);
    });

    await t.test("scoring does not mutate input (check workItems.length before/after)", () => {
      const ws = makeWorkstream();
      const lenBefore = ws.workItems.length;
      scoreAgentVentureWorkstreamReadiness(ws);
      assert.equal(ws.workItems.length, lenBefore);
    });

    await t.test("builder sets all three safety flags to true", () => {
      const input = { ...makeWorkstream() };
      delete input.humanOnTheLoop;
      delete input.approvalRequired;
      delete input.noExecutionAuthorized;
      const built = buildAgentVentureWorkstream(input);
      assert.equal(built.humanOnTheLoop, true);
      assert.equal(built.approvalRequired, true);
      assert.equal(built.noExecutionAuthorized, true);
    });

    await t.test("builder copies workItems (not same reference)", () => {
      const input = { ...makeWorkstream() };
      delete input.humanOnTheLoop;
      delete input.approvalRequired;
      delete input.noExecutionAuthorized;
      const built = buildAgentVentureWorkstream(input);
      assert.notEqual(built.workItems, input.workItems);
    });

    await t.test("builder copies kpis (not same reference)", () => {
      const input = { ...makeWorkstream() };
      delete input.humanOnTheLoop;
      delete input.approvalRequired;
      delete input.noExecutionAuthorized;
      const built = buildAgentVentureWorkstream(input);
      assert.notEqual(built.kpis, input.kpis);
    });

    await t.test("builder copies approvalGates (not same reference)", () => {
      const input = { ...makeWorkstream() };
      delete input.humanOnTheLoop;
      delete input.approvalRequired;
      delete input.noExecutionAuthorized;
      const built = buildAgentVentureWorkstream(input);
      assert.notEqual(built.approvalGates, input.approvalGates);
    });
  });

  // ---------------------------------------------------------------------------
  // Group 10 — Module boundary (static source scan via readFileSync)
  // ---------------------------------------------------------------------------
  await t.test("Module boundary (static source scan)", async (t) => {
    const sourceText = readFileSync(path.join(__dirname, "agent-venture-workstream.ts"), "utf-8");

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

    await t.test("source file does not contain 'saveWorkstream' or 'persistWorkstream'", () => {
      assert.ok(!sourceText.includes("saveWorkstream"), "must not contain saveWorkstream");
      assert.ok(!sourceText.includes("persistWorkstream"), "must not contain persistWorkstream");
    });

    await t.test("source file does not export 'Repository' or 'repository'", () => {
      assert.ok(!sourceText.includes("export const repository"), "must not export repository");
      assert.ok(!sourceText.includes("export class Repository"), "must not export Repository");
    });

    await t.test("source file does not contain 'action_ledger' or 'actionLedger' write reference", () => {
      assert.ok(!sourceText.includes("action_ledger"), "must not contain action_ledger");
      assert.ok(!sourceText.includes("actionLedger"), "must not contain actionLedger");
    });

    await t.test("source file does not contain 'server-only'", () => {
      assert.ok(!sourceText.includes("server-only"), "must not contain server-only");
    });
  });
});
