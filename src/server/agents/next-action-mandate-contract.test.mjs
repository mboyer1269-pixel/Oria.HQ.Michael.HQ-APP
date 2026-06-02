#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");
const contractPath = path.join(__dirname, "next-action-mandate-contract.ts");

test("Next Action Mandate Contract tests", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(contractPath);
  const {
    NextActionMandateStatus,
    NextActionMandateType,
    buildNextActionMandate,
    deriveMandateComplianceRisk,
    deriveMandateInitiativeSignal,
    mandateRequiresCeoApproval,
    validateNextActionMandate,
  } = mod;

  function validInput(overrides = {}) {
    return {
      mandateId: "mandate_001",
      previousActionId: "action_001",
      workOrderId: "work_order_001",
      ventureId: "venture_001",
      agentId: "agent_001",
      mandateType: NextActionMandateType.TEST_OFFER,
      recommendedAction: "Prepare a buyer discovery script",
      cashHypothesis: "A paid pilot can be validated this week.",
      requiredEvidence: ["buyer response", "pilot budget signal"],
      status: NextActionMandateStatus.PENDING,
      complianceRisk: "low",
      initiativeSignal: "low",
      requiresCeoApproval: false,
      riskLevel: "low",
      createdAt: "2026-06-02T12:00:00.000Z",
      ...overrides,
    };
  }

  function validMandate(overrides = {}) {
    return buildNextActionMandate(validInput(overrides));
  }

  await t.test("builds a valid PENDING mandate", () => {
    const mandate = validMandate();
    const result = validateNextActionMandate(mandate);

    assert.equal(result.valid, true);
    assert.equal(result.issues.length, 0);
    assert.equal(mandate.status, "PENDING");
    assert.equal(mandate.mandateType, "test_offer");
    assert.equal(mandate.cashHypothesis, "A paid pilot can be validated this week.");
    assert.equal(mandate.humanOnTheLoop, true);
    assert.equal(mandate.noExecutionAuthorized, true);
  });

  await t.test("accepts ACCEPTED_FOR_NEXT_WORK without authorizing execution", () => {
    const mandate = validMandate({ status: NextActionMandateStatus.ACCEPTED_FOR_NEXT_WORK });
    const result = validateNextActionMandate(mandate);

    assert.equal(result.valid, true);
    assert.equal(mandate.status, "ACCEPTED_FOR_NEXT_WORK");
    assert.equal(mandate.noExecutionAuthorized, true);
  });

  await t.test("rejects REFUTED without refutationRationale", () => {
    const mandate = validMandate({ status: NextActionMandateStatus.REFUTED });
    const result = validateNextActionMandate(mandate);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((issue) => issue.code === "refutation_rationale_required"));
  });

  await t.test("accepts REFUTED with refutationRationale", () => {
    const mandate = validMandate({
      status: NextActionMandateStatus.REFUTED,
      refutationRationale: "The move has weak proof and a worse cash path.",
    });
    const result = validateNextActionMandate(mandate);

    assert.equal(result.valid, true);
    assert.equal(result.issues.length, 0);
  });

  await t.test("COUNTER_PROPOSED requires counterProposal", () => {
    const mandate = validMandate({ status: NextActionMandateStatus.COUNTER_PROPOSED });
    const result = validateNextActionMandate(mandate);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((issue) => issue.code === "counter_proposal_required"));
  });

  await t.test("COUNTER_PROPOSED accepts complete counterProposal", () => {
    const mandate = validMandate({
      status: NextActionMandateStatus.COUNTER_PROPOSED,
      counterProposal: {
        recommendedAction: "Test a paid pilot with the warmest buyer first",
        rationale: "This should produce proof faster with lower cost.",
        expectedCashImpactCents: 250000,
        expectedCostCents: 15000,
      },
    });
    const result = validateNextActionMandate(mandate);

    assert.equal(result.valid, true);
    assert.equal(result.issues.length, 0);
  });

  await t.test("COUNTER_PROPOSED increases initiative signal", () => {
    const mandate = validMandate({
      status: NextActionMandateStatus.COUNTER_PROPOSED,
      initiativeSignal: "none",
      counterProposal: {
        recommendedAction: "Ask for a paid pilot deposit before building",
        rationale: "This proves demand and reduces delivery risk.",
      },
    });
    const result = validateNextActionMandate(mandate);

    assert.equal(result.valid, true);
    assert.equal(mandate.initiativeSignal, "medium");
    assert.equal(deriveMandateInitiativeSignal(mandate), "medium");
  });

  await t.test("IGNORED raises complianceRisk at least medium", () => {
    const mandate = validMandate({
      status: NextActionMandateStatus.IGNORED,
      complianceRisk: "low",
    });
    const result = validateNextActionMandate(mandate);

    assert.equal(result.valid, true);
    assert.equal(mandate.complianceRisk, "medium");
    assert.equal(deriveMandateComplianceRisk(mandate), "medium");
  });

  await t.test("NEEDS_CEO_DECISION requires requiresCeoApproval=true", () => {
    const mandate = {
      ...validMandate({
        mandateType: NextActionMandateType.CEO_DECISION,
        status: NextActionMandateStatus.NEEDS_CEO_DECISION,
        requiresCeoApproval: true,
      }),
      requiresCeoApproval: false,
    };
    const result = validateNextActionMandate(mandate);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((issue) => issue.code === "ceo_approval_required"));
  });

  await t.test("critical risk requires CEO approval", () => {
    const mandate = {
      ...validMandate({ riskLevel: "critical", requiresCeoApproval: true }),
      requiresCeoApproval: false,
    };
    const result = validateNextActionMandate(mandate);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((issue) => issue.code === "ceo_approval_required"));
  });

  await t.test("sensitive action language requires CEO approval", () => {
    const mandate = validMandate({
      recommendedAction: "Send email to the customer with the proposed plan",
      requiresCeoApproval: false,
    });
    const result = validateNextActionMandate(mandate);

    assert.equal(result.valid, true);
    assert.equal(mandate.requiresCeoApproval, true);
    assert.equal(mandateRequiresCeoApproval(mandate), true);
  });

  await t.test("sensitive counterProposal action language requires CEO approval", () => {
    const mandate = validMandate({
      status: NextActionMandateStatus.COUNTER_PROPOSED,
      counterProposal: {
        recommendedAction: "Contact customer for a signed pilot commitment",
        rationale: "Customer proof is the fastest next cash signal.",
      },
      requiresCeoApproval: false,
    });
    const result = validateNextActionMandate(mandate);

    assert.equal(result.valid, true);
    assert.equal(mandate.requiresCeoApproval, true);
  });

  await t.test("expectedCostCents must be non-negative when present", () => {
    const mandate = validMandate({ expectedCostCents: -1 });
    const result = validateNextActionMandate(mandate);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((issue) => issue.code === "invalid_expected_cost_cents"));
  });

  await t.test("expectedCashImpactCents must be non-negative when present", () => {
    const mandate = validMandate({ expectedCashImpactCents: -1 });
    const result = validateNextActionMandate(mandate);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((issue) => issue.code === "invalid_expected_cash_impact_cents"));
  });

  await t.test("expectedRoiMultiple must be non-negative when present", () => {
    const mandate = validMandate({ expectedRoiMultiple: -1 });
    const result = validateNextActionMandate(mandate);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((issue) => issue.code === "invalid_expected_roi_multiple"));
  });

  await t.test("counterProposal financial fields must be non-negative when present", () => {
    const mandate = validMandate({
      status: NextActionMandateStatus.COUNTER_PROPOSED,
      counterProposal: {
        recommendedAction: "Ask for a paid pilot deposit",
        rationale: "This proves demand.",
        expectedCashImpactCents: 100000,
        expectedCostCents: -1,
      },
    });
    const result = validateNextActionMandate(mandate);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((issue) => issue.code === "invalid_counter_proposal_expected_cost_cents"));
  });

  await t.test("rejects empty required fields", () => {
    const mandate = validMandate({
      mandateId: " ",
      previousActionId: "",
      agentId: " ",
      recommendedAction: "",
      cashHypothesis: " ",
      requiredEvidence: [],
    });
    const result = validateNextActionMandate(mandate);
    const codes = result.issues.map((issue) => issue.code);

    assert.equal(result.valid, false);
    assert.ok(codes.includes("missing_mandate_id"));
    assert.ok(codes.includes("missing_previous_action_id"));
    assert.ok(codes.includes("missing_agent_id"));
    assert.ok(codes.includes("missing_recommended_action"));
    assert.ok(codes.includes("missing_cash_hypothesis"));
    assert.ok(codes.includes("required_evidence_required"));
  });

  await t.test("rejects invalid mandateType", () => {
    const result = validateNextActionMandate(validMandate({ mandateType: "unknown_type" }));

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((issue) => issue.code === "invalid_mandate_type"));
  });

  await t.test("validates createdAt as ISO date", () => {
    const result = validateNextActionMandate(validMandate({ createdAt: "June 2, 2026" }));

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((issue) => issue.code === "invalid_created_at"));
  });

  await t.test("keeps humanOnTheLoop true", () => {
    const mandate = {
      ...validMandate(),
      humanOnTheLoop: false,
    };
    const result = validateNextActionMandate(mandate);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((issue) => issue.code === "human_on_the_loop_required"));
  });

  await t.test("keeps noExecutionAuthorized true", () => {
    const mandate = {
      ...validMandate(),
      noExecutionAuthorized: false,
    };
    const result = validateNextActionMandate(mandate);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((issue) => issue.code === "no_execution_authorized_required"));
  });

  await t.test("build output is deterministic when inputs are deterministic", () => {
    const input = validInput({
      status: NextActionMandateStatus.COUNTER_PROPOSED,
      initiativeSignal: "low",
      counterProposal: {
        recommendedAction: "Ask the highest-intent buyer for a paid pilot deposit",
        rationale: "This maximizes proof speed and cash leverage.",
      },
    });

    assert.deepEqual(buildNextActionMandate(input), buildNextActionMandate(input));
  });

  await t.test("does not import runtime execution guard", () => {
    const source = fs.readFileSync(contractPath, "utf8");
    const importLines = source
      .split(/\r?\n/)
      .filter((line) => /^\s*import\s/.test(line));

    assert.equal(importLines.some((line) => /runtime|execution-guard/i.test(line)), false);
  });

  await t.test("does not reference Ventures, Arena, or work-order files", () => {
    const source = fs.readFileSync(contractPath, "utf8");
    const importLines = source
      .split(/\r?\n/)
      .filter((line) => /^\s*import\s/.test(line));

    assert.equal(importLines.some((line) => /features\/ventures|server\/arena|work-order/i.test(line)), false);
  });
});
