#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");
const mandateContractPath = path.join(__dirname, "next-action-mandate-contract.ts");
const adapterPath = path.join(__dirname, "next-action-mandate-work-order-adapter.ts");
const routingPath = path.join(__dirname, "money-strategy-routing-graph-contract.ts");

test("Money Strategy Routing Graph Contract tests", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mandateContract = await jiti.import(mandateContractPath);
  const adapter = await jiti.import(adapterPath);
  const routing = await jiti.import(routingPath);

  const {
    NextActionMandateStatus,
    NextActionMandateType,
    buildNextActionMandate,
  } = mandateContract;
  const { buildMandateWorkOrderPlan } = adapter;
  const {
    MoneyStrategyEvidenceQuality,
    MoneyStrategyState,
    MoneyStrategyPlaybook,
    routeMoneyStrategy,
    validateMoneyStrategyRoutingDecision,
  } = routing;

  function mandate(overrides = {}) {
    return buildNextActionMandate({
      mandateId: "mandate_001",
      previousActionId: "action_001",
      workOrderId: "work_order_001",
      ventureId: "venture_001",
      agentId: "agent_001",
      mandateType: NextActionMandateType.TEST_OFFER,
      recommendedAction: "Test a paid pilot offer with warm buyers",
      cashHypothesis: "A paid pilot can validate demand this week.",
      requiredEvidence: ["buyer budget signal", "signed pilot interest"],
      expectedCashImpactCents: 250000,
      expectedCostCents: 25000,
      expectedRoiMultiple: 10,
      status: NextActionMandateStatus.ACCEPTED_FOR_NEXT_WORK,
      complianceRisk: "low",
      initiativeSignal: "medium",
      riskLevel: "low",
      requiresCeoApproval: false,
      createdAt: "2026-06-02T12:00:00.000Z",
      ...overrides,
    });
  }

  function planFor(inputMandate) {
    return buildMandateWorkOrderPlan({
      mandate: inputMandate,
      createdAt: "2026-06-02T12:30:00.000Z",
    });
  }

  function route(overrides = {}, routeOverrides = {}) {
    const inputMandate = mandate(overrides);
    return routeMoneyStrategy({
      mandate: inputMandate,
      plan: planFor(inputMandate),
      currentState: MoneyStrategyState.HYPOTHESIS,
      evidenceQuality: MoneyStrategyEvidenceQuality.WEAK_SIGNAL,
      createdAt: "2026-06-02T13:00:00.000Z",
      ...routeOverrides,
    });
  }

  await t.test("weak evidence routes to validation playbook", () => {
    const decision = route();

    assert.equal(decision.routeStatus, "route_to_playbook");
    assert.equal(decision.currentState, "hypothesis");
    assert.equal(decision.nextState, "validation_in_progress");
    assert.equal(decision.selectedPlaybook, "offer_test");
    assert.equal(decision.noExecutionAuthorized, true);
  });

  await t.test("strong financial evidence and high ROI routes to scale playbook", () => {
    const decision = route(
      { mandateType: NextActionMandateType.SCALE_SIGNAL, expectedRoiMultiple: 12 },
      {
        currentState: MoneyStrategyState.PROOF_CONFIRMED,
        evidenceQuality: MoneyStrategyEvidenceQuality.VERIFIED_FINANCIAL,
      },
    );

    assert.equal(decision.nextState, "scaling_candidate");
    assert.equal(decision.selectedPlaybook, MoneyStrategyPlaybook.SCALE_SIGNAL);
    assert.ok(decision.moneyScore >= 80);
  });

  await t.test("counter-proposed mandate preserves initiative and uses counter proposal action", () => {
    const decision = route({
      status: NextActionMandateStatus.COUNTER_PROPOSED,
      initiativeSignal: "none",
      counterProposal: {
        recommendedAction: "Ask the warmest buyer for a paid pilot deposit",
        rationale: "This proves cash demand faster than a free discovery call.",
        expectedCashImpactCents: 300000,
        expectedCostCents: 10000,
      },
    });

    assert.equal(decision.counterProposalFavored, true);
    assert.equal(decision.recommendedAction, "Ask the warmest buyer for a paid pilot deposit");
    assert.equal(decision.initiativeSignal, "medium");
    assert.equal(decision.routeStatus, "route_to_playbook");
  });

  await t.test("negative or zero ROI routes to cost reduction playbook", () => {
    const decision = route({
      mandateType: NextActionMandateType.REDUCE_COST,
      expectedCashImpactCents: 5000,
      expectedCostCents: 50000,
      expectedRoiMultiple: 0.1,
    });

    assert.equal(decision.nextState, "cost_reduction");
    assert.equal(decision.selectedPlaybook, MoneyStrategyPlaybook.COST_REDUCTION);
  });

  await t.test("NEEDS_CEO_DECISION routes to CEO review", () => {
    const decision = route({
      mandateType: NextActionMandateType.CEO_DECISION,
      status: NextActionMandateStatus.NEEDS_CEO_DECISION,
    });

    assert.equal(decision.routeStatus, "ceo_review");
    assert.equal(decision.nextState, "ceo_review");
    assert.equal(decision.requiresCeoApproval, true);
  });

  await t.test("IGNORED routes to compliance review", () => {
    const decision = route({ status: NextActionMandateStatus.IGNORED });

    assert.equal(decision.routeStatus, "compliance_review");
    assert.equal(decision.nextState, "compliance_review");
  });

  await t.test("critical risk routes to CEO review", () => {
    const decision = route({ riskLevel: "critical", requiresCeoApproval: false });

    assert.equal(decision.routeStatus, "ceo_review");
    assert.equal(decision.requiresCeoApproval, true);
  });

  await t.test("routing validates governance locks", () => {
    const decision = route();
    const result = validateMoneyStrategyRoutingDecision(decision);

    assert.equal(result.valid, true);
    assert.equal(result.issues.length, 0);
    assert.equal(decision.humanOnTheLoop, true);
    assert.equal(decision.noExecutionAuthorized, true);
  });

  await t.test("rejects malformed routing decisions", () => {
    const decision = {
      ...route(),
      noExecutionAuthorized: false,
      selectedPlaybook: "linear_workflow",
    };
    const result = validateMoneyStrategyRoutingDecision(decision);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((issue) => issue.code === "no_execution_authorized_required"));
    assert.ok(result.issues.some((issue) => issue.code === "invalid_playbook"));
  });

  await t.test("output is deterministic for deterministic inputs", () => {
    const inputMandate = mandate({
      status: NextActionMandateStatus.COUNTER_PROPOSED,
      counterProposal: {
        recommendedAction: "Request paid pilot commitment before build spend",
        rationale: "This increases proof quality and reduces burn.",
      },
    });
    const input = {
      mandate: inputMandate,
      plan: planFor(inputMandate),
      currentState: MoneyStrategyState.HYPOTHESIS,
      evidenceQuality: MoneyStrategyEvidenceQuality.WEAK_SIGNAL,
      createdAt: "2026-06-02T13:00:00.000Z",
    };

    assert.deepEqual(routeMoneyStrategy(input), routeMoneyStrategy(input));
  });

  await t.test("does not import runtime, Ventures, Arena, UI, or database files", () => {
    const source = fs.readFileSync(routingPath, "utf8");
    const importLines = source
      .split(/\r?\n/)
      .filter((line) => /^\s*import\s/.test(line));

    assert.equal(
      importLines.some((line) => /runtime|execution-guard|features\/ventures|server\/arena|src\/app|server\/db/i.test(line)),
      false,
    );
  });
});
