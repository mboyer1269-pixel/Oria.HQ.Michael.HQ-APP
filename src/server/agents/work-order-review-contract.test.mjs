#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("Work Order Review Contract tests", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(path.join(__dirname, "work-order-review-contract.ts"));
  const { validateWorkOrderReview, hasForbiddenExecutionFields, createWorkOrderReviewSummary } = mod;

  // Helper to build a minimal valid review
  function validReview(overrides) {
    return {
      id: "review_001",
      workOrderId: "wo_venture_123",
      decision: "approve_to_plan",
      reviewerId: "michael",
      reviewerRole: "ceo",
      createdAt: new Date().toISOString(),
      humanOnTheLoop: true,
      noExecutionAuthorized: true,
      ...overrides,
    };
  }

  // ========================================================================
  // Happy path
  // ========================================================================

  await t.test("valid approve_to_plan review passes validation", () => {
    const review = validReview();
    const result = validateWorkOrderReview(review);

    assert.equal(result.valid, true);
    assert.equal(result.issues.length, 0);
  });

  await t.test("approve_to_plan does not authorize execution", () => {
    const review = validReview({ decision: "approve_to_plan" });
    const result = validateWorkOrderReview(review);

    assert.equal(result.valid, true);
    assert.equal(review.noExecutionAuthorized, true);
    assert.equal(review.humanOnTheLoop, true);
    // The decision is explicitly "approve_to_plan", never "approve_to_execute"
    assert.equal(review.decision, "approve_to_plan");
    assert.notEqual(review.decision, "approve_to_execute");
  });

  await t.test("valid request_changes review passes validation", () => {
    const review = validReview({
      decision: "request_changes",
      requestedChanges: [
        { field: "profitTarget", description: "Target too aggressive", severity: "required" },
      ],
    });
    const result = validateWorkOrderReview(review);

    assert.equal(result.valid, true);
    assert.equal(result.issues.length, 0);
  });

  await t.test("valid reject review passes validation", () => {
    const review = validReview({
      decision: "reject",
      reason: "Not aligned with current strategic priorities",
    });
    const result = validateWorkOrderReview(review);

    assert.equal(result.valid, true);
    assert.equal(result.issues.length, 0);
  });

  await t.test("valid ask_for_more_info review passes validation", () => {
    const review = validReview({
      decision: "ask_for_more_info",
      reason: "What is the expected timeline for this venture?",
    });
    const result = validateWorkOrderReview(review);

    assert.equal(result.valid, true);
    assert.equal(result.issues.length, 0);
  });

  // ========================================================================
  // Missing required fields
  // ========================================================================

  await t.test("missing workOrderId is blocked", () => {
    const review = validReview({ workOrderId: undefined });
    const result = validateWorkOrderReview(review);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "missing_work_order_id"));
  });

  await t.test("missing id is blocked", () => {
    const review = validReview({ id: undefined });
    const result = validateWorkOrderReview(review);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "missing_id"));
  });

  await t.test("missing reviewerId is blocked", () => {
    const review = validReview({ reviewerId: undefined });
    const result = validateWorkOrderReview(review);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "missing_reviewer"));
  });

  await t.test("missing reviewerRole is blocked", () => {
    const review = validReview({ reviewerRole: undefined });
    const result = validateWorkOrderReview(review);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "missing_reviewer"));
  });

  await t.test("unknown reviewerRole is blocked", () => {
    const review = validReview({ reviewerRole: "system" });
    const result = validateWorkOrderReview(review);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "invalid_reviewer_role"));
  });

  await t.test("missing decision is blocked", () => {
    const review = validReview({ decision: undefined });
    const result = validateWorkOrderReview(review);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "missing_decision"));
  });

  await t.test("missing createdAt is blocked", () => {
    const review = validReview({ createdAt: undefined });
    const result = validateWorkOrderReview(review);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "missing_created_at"));
  });

  // ========================================================================
  // Decision-specific rules
  // ========================================================================

  await t.test("invalid decision type is blocked", () => {
    const review = validReview({ decision: "approve_to_execute" });
    const result = validateWorkOrderReview(review);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "invalid_decision"));
  });

  await t.test("request_changes without requestedChanges is blocked", () => {
    const review = validReview({ decision: "request_changes" });
    const result = validateWorkOrderReview(review);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "requested_changes_required"));
  });

  await t.test("request_changes with empty requestedChanges array is blocked", () => {
    const review = validReview({ decision: "request_changes", requestedChanges: [] });
    const result = validateWorkOrderReview(review);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "requested_changes_required"));
  });

  await t.test("request_changes with malformed requestedChanges [{}] is blocked", () => {
    const review = validReview({ decision: "request_changes", requestedChanges: [{}] });
    const result = validateWorkOrderReview(review);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "invalid_requested_change"));
  });

  await t.test("request_changes with string array instead of objects is blocked", () => {
    const review = validReview({ decision: "request_changes", requestedChanges: ["change title"] });
    const result = validateWorkOrderReview(review);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "invalid_requested_change"));
  });

  await t.test("request_changes missing field is blocked", () => {
    const review = validReview({
      decision: "request_changes",
      requestedChanges: [{ description: "desc", severity: "suggested" }],
    });
    const result = validateWorkOrderReview(review);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "invalid_requested_change"));
  });

  await t.test("request_changes missing description is blocked", () => {
    const review = validReview({
      decision: "request_changes",
      requestedChanges: [{ field: "title", severity: "suggested" }],
    });
    const result = validateWorkOrderReview(review);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "invalid_requested_change"));
  });

  await t.test("request_changes with invalid severity is blocked", () => {
    const review = validReview({
      decision: "request_changes",
      requestedChanges: [{ field: "title", description: "desc", severity: "optional" }],
    });
    const result = validateWorkOrderReview(review);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "invalid_requested_change"));
  });

  await t.test("reject without reason is blocked", () => {
    const review = validReview({ decision: "reject" });
    const result = validateWorkOrderReview(review);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "rejection_reason_required"));
  });

  await t.test("reject with empty reason is blocked", () => {
    const review = validReview({ decision: "reject", reason: "  " });
    const result = validateWorkOrderReview(review);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "rejection_reason_required"));
  });

  await t.test("ask_for_more_info without reason is blocked", () => {
    const review = validReview({ decision: "ask_for_more_info" });
    const result = validateWorkOrderReview(review);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "more_info_reason_required"));
  });

  // ========================================================================
  // Human-on-the-Loop enforcement
  // ========================================================================

  await t.test("missing humanOnTheLoop true is blocked", () => {
    const review = validReview({ humanOnTheLoop: false });
    const result = validateWorkOrderReview(review);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "human_on_the_loop_required"));
  });

  await t.test("missing noExecutionAuthorized true is blocked", () => {
    const review = validReview({ noExecutionAuthorized: false });
    const result = validateWorkOrderReview(review);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "no_execution_authorized_required"));
  });

  await t.test("humanOnTheLoop undefined is blocked", () => {
    const review = validReview({ humanOnTheLoop: undefined });
    const result = validateWorkOrderReview(review);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "human_on_the_loop_required"));
  });

  // ========================================================================
  // Approval gate acknowledgements
  // ========================================================================

  await t.test("approval gate acknowledgements must be structured", () => {
    const review = validReview({
      approvalGateAcknowledgements: [
        "money",  // ← loose string, not structured
      ],
    });
    const result = validateWorkOrderReview(review);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "invalid_approval_gate_acknowledgement"));
  });

  await t.test("valid structured approval gate acknowledgements pass", () => {
    const review = validReview({
      approvalGateAcknowledgements: [
        { gate: "money", acknowledged: true, note: "Budget approved" },
        { gate: "deployment", acknowledged: true },
      ],
    });
    const result = validateWorkOrderReview(review);

    assert.equal(result.valid, true);
    assert.equal(result.issues.length, 0);
  });

  await t.test("acknowledgement missing gate field is blocked", () => {
    const review = validReview({
      approvalGateAcknowledgements: [
        { acknowledged: true },
      ],
    });
    const result = validateWorkOrderReview(review);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "invalid_approval_gate_acknowledgement"));
  });

  await t.test("acknowledgement with unknown gate identifier is blocked", () => {
    const review = validReview({
      approvalGateAcknowledgements: [
        { gate: "wire_money", acknowledged: true },
      ],
    });
    const result = validateWorkOrderReview(review);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "invalid_approval_gate_acknowledgement"));
  });

  await t.test("acknowledgement missing acknowledged boolean is blocked", () => {
    const review = validReview({
      approvalGateAcknowledgements: [
        { gate: "money" },
      ],
    });
    const result = validateWorkOrderReview(review);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "invalid_approval_gate_acknowledgement"));
  });

  // ========================================================================
  // Forbidden execution fields
  // ========================================================================

  await t.test("forbidden execution fields are blocked", () => {
    const review = validReview({ executeNow: true });
    const result = validateWorkOrderReview(review);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "forbidden_execution_field"));
  });

  await t.test("nested forbidden execution fields in metadata object are blocked", () => {
    const review = validReview({ metadata: { executeNow: true } });
    const result = validateWorkOrderReview(review);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "forbidden_execution_field"));
  });

  await t.test("deeply nested forbidden execution fields are blocked", () => {
    const review = validReview({ metadata: { nested: { deployNow: true } } });
    const result = validateWorkOrderReview(review);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "forbidden_execution_field"));
  });

  await t.test("forbidden execution fields in metadata arrays are blocked", () => {
    const review = validReview({ metadata: [{ sendNow: true }] });
    const result = validateWorkOrderReview(review);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "forbidden_execution_field"));
  });

  await t.test("safe metadata remains valid", () => {
    const review = validReview({ metadata: { isPriority: true, nested: [{ score: 100 }] } });
    const result = validateWorkOrderReview(review);

    assert.equal(result.valid, true);
    assert.equal(result.issues.length, 0);
  });

  await t.test("hasForbiddenExecutionFields detects all forbidden fields", () => {
    const forbidden = ["executeNow", "liveMode", "runtimeDispatch", "externalWrite", "publishNow", "sendNow", "deployNow"];
    for (const field of forbidden) {
      const obj = { [field]: true };
      assert.equal(hasForbiddenExecutionFields(obj), true, `Expected ${field} to be detected as forbidden`);
    }
  });

  await t.test("hasForbiddenExecutionFields returns false for clean object", () => {
    const obj = { id: "review_001", decision: "approve_to_plan" };
    assert.equal(hasForbiddenExecutionFields(obj), false);
  });

  // ========================================================================
  // Immutability
  // ========================================================================

  await t.test("validateWorkOrderReview does not mutate input", () => {
    const review = validReview({
      decision: "request_changes",
      requestedChanges: [
        { field: "profitTarget", description: "Too high", severity: "required" },
      ],
    });
    const snapshot = JSON.stringify(review);
    validateWorkOrderReview(review);
    assert.equal(JSON.stringify(review), snapshot);
  });

  await t.test("createWorkOrderReviewSummary does not mutate input", () => {
    const review = validReview({ reason: "Looks solid" });
    const snapshot = JSON.stringify(review);
    createWorkOrderReviewSummary(review);
    assert.equal(JSON.stringify(review), snapshot);
  });

  // ========================================================================
  // Summary helper
  // ========================================================================

  await t.test("summary helper includes Human-on-the-Loop wording", () => {
    const review = validReview({ reason: "Good proposal" });
    const summary = createWorkOrderReviewSummary(review);

    assert.ok(summary.includes("Human-on-the-Loop"), "Summary must include Human-on-the-Loop");
    assert.ok(summary.includes("planification") || summary.includes("Approuvé pour planification"));
    assert.ok(summary.includes("wo_venture_123"));
    assert.ok(summary.includes("michael"));
  });

  await t.test("summary helper renders request_changes with change list", () => {
    const review = validReview({
      decision: "request_changes",
      requestedChanges: [
        { field: "profitTarget", description: "Reduce to 500 EUR", severity: "required" },
        { field: "revenueModel", description: "Consider freemium", severity: "suggested" },
      ],
    });
    const summary = createWorkOrderReviewSummary(review);

    assert.ok(summary.includes("Modifications demandées"));
    assert.ok(summary.includes("profitTarget"));
    assert.ok(summary.includes("revenueModel"));
  });

  await t.test("summary helper renders approval gate acknowledgements", () => {
    const review = validReview({
      approvalGateAcknowledgements: [
        { gate: "money", acknowledged: true, note: "Budget of 50 EUR approved" },
        { gate: "deployment", acknowledged: false, note: "Need staging first" },
      ],
    });
    const summary = createWorkOrderReviewSummary(review);

    assert.ok(summary.includes("MONEY"));
    assert.ok(summary.includes("DEPLOYMENT"));
    assert.ok(summary.includes("Budget of 50 EUR approved"));
  });

  await t.test("summary helper renders reject with reason", () => {
    const review = validReview({
      decision: "reject",
      reason: "Not aligned with Q3 priorities",
    });
    const summary = createWorkOrderReviewSummary(review);

    assert.ok(summary.includes("Rejeté"));
    assert.ok(summary.includes("Not aligned with Q3 priorities"));
  });

  // ========================================================================
  // Multiple errors accumulate
  // ========================================================================

  await t.test("multiple validation errors accumulate correctly", () => {
    const review = {
      // Missing: id, workOrderId, reviewerId, reviewerRole, decision
      humanOnTheLoop: false,
      noExecutionAuthorized: false,
      executeNow: true,
    };
    const result = validateWorkOrderReview(review);

    assert.equal(result.valid, false);
    // Should have at least: missing_id, missing_work_order_id, missing_reviewer (x2),
    // missing_decision, human_on_the_loop_required, no_execution_authorized_required,
    // forbidden_execution_field
    assert.ok(result.issues.length >= 8, `Expected at least 8 issues, got ${result.issues.length}`);
  });
});
