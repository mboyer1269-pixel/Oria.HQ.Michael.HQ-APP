#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");
const adapterPath = path.join(__dirname, "next-action-mandate-work-order-adapter.ts");
const contractPath = path.join(__dirname, "next-action-mandate-contract.ts");

test("Next Action Mandate Work Order Adapter tests", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const contract = await jiti.import(contractPath);
  const adapter = await jiti.import(adapterPath);

  const {
    NextActionMandateStatus,
    NextActionMandateType,
    buildNextActionMandate,
  } = contract;
  const { buildMandateWorkOrderPlan } = adapter;

  function validMandate(overrides = {}) {
    return buildNextActionMandate({
      mandateId: "mandate_001",
      previousActionId: "action_001",
      workOrderId: "work_order_001",
      ventureId: "venture_001",
      agentId: "agent_001",
      mandateType: NextActionMandateType.TEST_OFFER,
      recommendedAction: "Prepare a paid pilot qualification plan",
      cashHypothesis: "A paid pilot can validate buyer demand this week.",
      requiredEvidence: ["buyer budget signal", "pilot scope"],
      complianceRisk: "low",
      initiativeSignal: "low",
      riskLevel: "low",
      requiresCeoApproval: false,
      createdAt: "2026-06-02T12:00:00.000Z",
      ...overrides,
    });
  }

  function buildPlan(overrides = {}, adapterOverrides = {}) {
    return buildMandateWorkOrderPlan({
      mandate: validMandate(overrides),
      createdAt: "2026-06-02T12:30:00.000Z",
      ...adapterOverrides,
    });
  }

  await t.test("PENDING creates a draft planning proposal", () => {
    const plan = buildPlan({ status: NextActionMandateStatus.PENDING });

    assert.equal(plan.planningStatus, "draft_next_work");
    assert.equal(plan.mandateId, "mandate_001");
    assert.equal(plan.previousActionId, "action_001");
    assert.equal(plan.workOrderId, "work_order_001");
    assert.equal(plan.agentId, "agent_001");
    assert.equal(plan.counterProposalApplied, false);
    assert.equal(plan.noExecutionAuthorized, true);
  });

  await t.test("ACCEPTED_FOR_NEXT_WORK creates a next-work proposal", () => {
    const plan = buildPlan({ status: NextActionMandateStatus.ACCEPTED_FOR_NEXT_WORK });

    assert.equal(plan.planningStatus, "draft_next_work");
    assert.equal(plan.recommendedAction, "Prepare a paid pilot qualification plan");
    assert.equal(plan.noExecutionAuthorized, true);
  });

  await t.test("COUNTER_PROPOSED uses counterProposal action", () => {
    const plan = buildPlan({
      status: NextActionMandateStatus.COUNTER_PROPOSED,
      counterProposal: {
        recommendedAction: "Ask the highest-intent buyer for a paid pilot deposit",
        rationale: "This produces faster proof and lowers build risk.",
        expectedCashImpactCents: 200000,
        expectedCostCents: 10000,
      },
    });

    assert.equal(plan.planningStatus, "draft_next_work");
    assert.equal(plan.recommendedAction, "Ask the highest-intent buyer for a paid pilot deposit");
    assert.equal(plan.counterProposalApplied, true);
    assert.equal(plan.noExecutionAuthorized, true);
  });

  await t.test("REFUTED creates CEO review proposal", () => {
    const plan = buildPlan({
      status: NextActionMandateStatus.REFUTED,
      refutationRationale: "Expected ROI is too low for the current evidence.",
    });

    assert.equal(plan.planningStatus, "ceo_review");
    assert.equal(plan.blockedReason, undefined);
  });

  await t.test("IGNORED creates compliance review proposal", () => {
    const plan = buildPlan({ status: NextActionMandateStatus.IGNORED });

    assert.equal(plan.planningStatus, "compliance_review");
    assert.equal(plan.requiresCeoApproval, false);
  });

  await t.test("NEEDS_CEO_DECISION creates CEO review proposal", () => {
    const plan = buildPlan({
      mandateType: NextActionMandateType.CEO_DECISION,
      status: NextActionMandateStatus.NEEDS_CEO_DECISION,
    });

    assert.equal(plan.planningStatus, "ceo_review");
    assert.equal(plan.requiresCeoApproval, true);
  });

  await t.test("sensitive action requires CEO approval", () => {
    const plan = buildPlan({
      recommendedAction: "Publish the offer page after CEO review",
      requiresCeoApproval: false,
    });

    assert.equal(plan.requiresCeoApproval, true);
    assert.equal(plan.noExecutionAuthorized, true);
  });

  await t.test("critical risk requires CEO approval", () => {
    const plan = buildPlan({
      riskLevel: "critical",
      requiresCeoApproval: false,
    });

    assert.equal(plan.requiresCeoApproval, true);
    assert.equal(plan.autonomyEnvelope.riskThreshold, "critical");
    assert.equal(plan.autonomyEnvelope.autonomyLevel, "supervised");
  });

  await t.test("noExecutionAuthorized is preserved", () => {
    const plan = buildPlan();

    assert.equal(plan.humanOnTheLoop, true);
    assert.equal(plan.noExecutionAuthorized, true);
    assert.equal(plan.autonomyEnvelope.humanOnTheLoop, true);
    assert.equal(plan.autonomyEnvelope.noExecutionAuthorized, true);
  });

  await t.test("integrates buildDefaultAutonomyEnvelope boundaries", () => {
    const plan = buildPlan({ expectedCostCents: 25000 });

    assert.ok(plan.autonomyEnvelope.allowedAutonomousActions.includes("estimate_roi"));
    assert.ok(plan.autonomyEnvelope.approvalRequiredActions.includes("spend_money"));
    assert.ok(plan.autonomyEnvelope.blockedActions.includes("runtime_dispatch"));
    assert.equal(plan.autonomyEnvelope.budgetLimit, 25000);
  });

  await t.test("output is deterministic for deterministic inputs", () => {
    const mandate = validMandate({
      status: NextActionMandateStatus.COUNTER_PROPOSED,
      counterProposal: {
        recommendedAction: "Ask for a signed paid-pilot commitment",
        rationale: "This creates evidence before build spend.",
      },
    });
    const input = {
      mandate,
      createdAt: "2026-06-02T12:30:00.000Z",
    };

    assert.deepEqual(buildMandateWorkOrderPlan(input), buildMandateWorkOrderPlan(input));
  });

  await t.test("does not import runtime execution guard", () => {
    const source = fs.readFileSync(adapterPath, "utf8");
    const importLines = source
      .split(/\r?\n/)
      .filter((line) => /^\s*import\s/.test(line));

    assert.equal(importLines.some((line) => /runtime|execution-guard/i.test(line)), false);
  });

  await t.test("does not import Ventures or Arena files", () => {
    const source = fs.readFileSync(adapterPath, "utf8");
    const importLines = source
      .split(/\r?\n/)
      .filter((line) => /^\s*import\s/.test(line));

    assert.equal(importLines.some((line) => /features\/ventures|server\/arena/i.test(line)), false);
  });
});
