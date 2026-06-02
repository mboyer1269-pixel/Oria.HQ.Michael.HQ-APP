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
    buildNextActionMandate,
    deriveMandateComplianceRisk,
    mandateRequiresCeoApproval,
    validateNextActionMandate,
  } = mod;

  function validInput(overrides = {}) {
    return {
      mandateId: "mandate_001",
      previousActionId: "action_001",
      agentId: "agent_001",
      recommendedAction: "Prepare a planning brief",
      requiredEvidence: ["prior outcome", "current pipeline"],
      status: NextActionMandateStatus.PENDING,
      complianceRisk: "low",
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
    assert.equal(mandate.humanOnTheLoop, true);
    assert.equal(mandate.noExecutionAuthorized, true);
  });

  await t.test("accepts ACCEPTED_FOR_NEXT_WORK without authorizing execution", () => {
    const mandate = validMandate({ status: NextActionMandateStatus.ACCEPTED_FOR_NEXT_WORK });
    const result = validateNextActionMandate(mandate);

    assert.equal(result.valid, true);
    assert.equal(mandate.status, "ACCEPTED_FOR_NEXT_WORK");
    assert.equal(mandate.noExecutionAuthorized, true);
    assert.notEqual(mandate.status, "EXECUTED");
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
      refutationRationale: "Evidence did not support the proposed next action.",
    });
    const result = validateNextActionMandate(mandate);

    assert.equal(result.valid, true);
    assert.equal(result.issues.length, 0);
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

  await t.test("rejects empty mandateId", () => {
    const result = validateNextActionMandate(validMandate({ mandateId: " " }));

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((issue) => issue.code === "missing_mandate_id"));
  });

  await t.test("rejects empty previousActionId", () => {
    const result = validateNextActionMandate(validMandate({ previousActionId: "" }));

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((issue) => issue.code === "missing_previous_action_id"));
  });

  await t.test("rejects empty agentId", () => {
    const result = validateNextActionMandate(validMandate({ agentId: " " }));

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((issue) => issue.code === "missing_agent_id"));
  });

  await t.test("rejects empty recommendedAction", () => {
    const result = validateNextActionMandate(validMandate({ recommendedAction: "" }));

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((issue) => issue.code === "missing_recommended_action"));
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
