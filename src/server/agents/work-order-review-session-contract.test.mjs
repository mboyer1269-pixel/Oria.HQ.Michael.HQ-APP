// src/server/agents/work-order-review-session-contract.test.mjs

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("Work Order Review Session Contract tests", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(path.join(__dirname, "work-order-review-session-contract.ts"));
  const {
    validateWorkOrderReviewSession,
    transitionWorkOrderReviewSession,
    createWorkOrderReviewSessionSummary,
  } = mod;

  // Helper to build a minimal valid session
  function validSession(overrides = {}) {
    return {
      id: "sess_001",
      workOrderId: "wo_123",
      status: "awaiting_review",
      reviewerId: "michael",
      reviewerRole: "ceo",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      humanOnTheLoop: true,
      noExecutionAuthorized: true,
      ...overrides,
    };
  }

  await t.test("valid awaiting_review session passes", () => {
    const session = validSession();
    const result = validateWorkOrderReviewSession(session);
    assert.equal(result.valid, true);
    assert.equal(result.issues.length, 0);
  });

  await t.test("valid previewed session passes", () => {
    const session = validSession({ status: "previewed" });
    const result = validateWorkOrderReviewSession(session);
    assert.equal(result.valid, true);
  });

  await t.test("missing id is blocked", () => {
    const session = validSession({ id: undefined });
    const result = validateWorkOrderReviewSession(session);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "missing_id"));
  });

  await t.test("missing workOrderId is blocked", () => {
    const session = validSession({ workOrderId: undefined });
    const result = validateWorkOrderReviewSession(session);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "missing_work_order_id"));
  });

  await t.test("missing reviewerId is blocked", () => {
    const session = validSession({ reviewerId: undefined });
    const result = validateWorkOrderReviewSession(session);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "missing_reviewer"));
  });

  await t.test("missing reviewerRole is blocked", () => {
    const session = validSession({ reviewerRole: undefined });
    const result = validateWorkOrderReviewSession(session);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "missing_reviewer"));
  });

  await t.test("missing createdAt is blocked", () => {
    const session = validSession({ createdAt: undefined });
    const result = validateWorkOrderReviewSession(session);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "missing_created_at"));
  });

  await t.test("missing updatedAt is blocked", () => {
    const session = validSession({ updatedAt: undefined });
    const result = validateWorkOrderReviewSession(session);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "missing_updated_at"));
  });

  await t.test("invalid status is blocked", () => {
    const session = validSession({ status: "live_execution" }); // explicitly test live_execution isn't allowed
    const result = validateWorkOrderReviewSession(session);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "invalid_status"));
  });

  await t.test("humanOnTheLoop false is blocked", () => {
    const session = validSession({ humanOnTheLoop: false });
    const result = validateWorkOrderReviewSession(session);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "human_on_the_loop_required"));
  });

  await t.test("noExecutionAuthorized false is blocked", () => {
    const session = validSession({ noExecutionAuthorized: false });
    const result = validateWorkOrderReviewSession(session);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "no_execution_authorized_required"));
  });

  await t.test("approve_to_plan transitions to approved_to_plan", () => {
    const session = validSession();
    const review = { id: "rev_1", decision: "approve_to_plan" };
    const result = transitionWorkOrderReviewSession(session, review);
    
    assert.equal(result.valid, true);
    assert.equal(result.nextSession.status, "approved_to_plan");
  });

  await t.test("request_changes transitions to changes_requested", () => {
    const session = validSession();
    const review = { id: "rev_2", decision: "request_changes", requestedChanges: [{ field: "title", description: "update", severity: "required" }] };
    const result = transitionWorkOrderReviewSession(session, review);
    
    assert.equal(result.valid, true);
    assert.equal(result.nextSession.status, "changes_requested");
    assert.ok(result.nextSession.requestedChanges);
  });

  await t.test("reject transitions to rejected", () => {
    const session = validSession();
    const review = { id: "rev_3", decision: "reject" };
    const result = transitionWorkOrderReviewSession(session, review);
    
    assert.equal(result.valid, true);
    assert.equal(result.nextSession.status, "rejected");
  });

  await t.test("ask_for_more_info transitions to more_info_requested", () => {
    const session = validSession();
    const review = { id: "rev_4", decision: "ask_for_more_info" };
    const result = transitionWorkOrderReviewSession(session, review);
    
    assert.equal(result.valid, true);
    assert.equal(result.nextSession.status, "more_info_requested");
  });

  await t.test("blocked_execution_request transitions to blocked_execution_request", () => {
    const session = validSession();
    const review = { id: "rev_5", decision: "blocked_execution_request" };
    const result = transitionWorkOrderReviewSession(session, review);
    
    assert.equal(result.valid, true);
    assert.equal(result.nextSession.status, "blocked_execution_request");
  });

  await t.test("approved_to_plan does not authorize execution", () => {
    const session = validSession();
    const review = { id: "rev_1", decision: "approve_to_plan" };
    const result = transitionWorkOrderReviewSession(session, review);
    
    assert.equal(result.valid, true);
    assert.equal(result.nextSession.noExecutionAuthorized, true);
  });

  await t.test("invalid transition is blocked", () => {
    const session = validSession({ status: "rejected" }); // Cannot transition from rejected
    const review = { id: "rev_x", decision: "approve_to_plan" };
    const result = transitionWorkOrderReviewSession(session, review);
    
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "invalid_transition"));
  });

  await t.test("expired session blocks approval transition", () => {
    const session = validSession({ status: "expired" });
    const review = { id: "rev_x", decision: "approve_to_plan" };
    const result = transitionWorkOrderReviewSession(session, review);
    
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "invalid_transition"));
  });

  await t.test("cancelled session blocks approval transition", () => {
    const session = validSession({ status: "cancelled" });
    const review = { id: "rev_x", decision: "approve_to_plan" };
    const result = transitionWorkOrderReviewSession(session, review);
    
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "invalid_transition"));
  });

  await t.test("recursive forbidden field in metadata is blocked", () => {
    const session = validSession({ metadata: { deployNow: true } });
    const result = validateWorkOrderReviewSession(session);
    
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "forbidden_execution_field"));
  });

  await t.test("recursive forbidden field in events is blocked", () => {
    const session = validSession({
      events: [
        { id: "e1", type: "test", timestamp: "now", actorId: "a", metadata: { liveMode: true } }
      ]
    });
    const result = validateWorkOrderReviewSession(session);
    
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "forbidden_execution_field"));
  });

  await t.test("transition helper does not mutate input", () => {
    const session = validSession();
    const snapshot = JSON.stringify(session);
    const review = { id: "rev_1", decision: "approve_to_plan" };
    transitionWorkOrderReviewSession(session, review);
    
    assert.equal(JSON.stringify(session), snapshot);
  });

  await t.test("validation helper does not mutate input", () => {
    const session = validSession();
    const snapshot = JSON.stringify(session);
    validateWorkOrderReviewSession(session);
    
    assert.equal(JSON.stringify(session), snapshot);
  });

  await t.test("summary includes Human-on-the-Loop wording", () => {
    const session = validSession();
    const summary = createWorkOrderReviewSessionSummary(session);
    assert.ok(summary.includes("Human-on-the-Loop"));
  });

  await t.test("summary includes no-execution wording", () => {
    const session = validSession();
    const summary = createWorkOrderReviewSessionSummary(session);
    assert.ok(summary.includes("No execution is authorized"));
  });
});
