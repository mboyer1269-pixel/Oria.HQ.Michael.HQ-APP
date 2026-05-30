// src/server/agents/work-order-governance-bundle.test.mjs

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("Work Order Governance Bundle tests", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(
    path.join(__dirname, "work-order-governance-bundle.ts"),
  );
  const {
    buildWorkOrderGovernanceBundle,
    validateWorkOrderGovernanceBundle,
    createWorkOrderGovernanceBundleSummary,
    hasForbiddenGovernanceBundleFields,
    mapReviewDecisionToSessionStatus,
    isReviewConsistentWithSession,
    isEnvelopeConsistentWithWorkOrder,
    assertPlanningOnlyStatusSemantics,
  } = mod;

  // ---------------------------------------------------------------------------
  // Fixture helpers — all return fresh objects to avoid cross-test pollution
  // ---------------------------------------------------------------------------

  function validWorkOrder(overrides) {
    return {
      id: "wo_001",
      type: "mission",
      title: "Test Mission",
      ownerAgentId: "joris",
      assignedAgentId: "joris",
      objective: "Validate governance bundle",
      expectedOutput: { description: "Test report", outputType: "report" },
      boostersRequested: [],
      riskLevel: "low",
      approvalGates: [],
      successMetric: { description: "Tests pass" },
      nextAction: { description: "Review output", actor: "joris" },
      businessValue: { valueType: "learning", confidence: "low" },
      status: "draft",
      createdByType: "joris",
      createdById: "joris",
      createdAt: new Date().toISOString(),
      ...overrides,
    };
  }

  function validEnvelope(overrides) {
    return {
      id: "env_001",
      workOrderId: "wo_001",
      agentId: "joris",
      autonomyLevel: "autonomous_dry_run",
      allowedAutonomousActions: ["research", "analyze", "summarize"],
      approvalRequiredActions: ["publish", "send_message", "spend_money"],
      blockedActions: ["runtime_dispatch", "live_execution", "transfer_money"],
      escalationTriggers: [],
      humanOnTheLoop: true,
      noExecutionAuthorized: true,
      createdAt: new Date().toISOString(),
      ...overrides,
    };
  }

  function validSession(status, overrides) {
    return {
      id: "sess_001",
      workOrderId: "wo_001",
      status: status ?? "previewed",
      reviewerId: "michael",
      reviewerRole: "ceo",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      humanOnTheLoop: true,
      noExecutionAuthorized: true,
      ...overrides,
    };
  }

  function validReview(overrides) {
    return {
      id: "rev_001",
      workOrderId: "wo_001",
      decision: "approve_to_plan",
      reviewerId: "michael",
      reviewerRole: "ceo",
      createdAt: new Date().toISOString(),
      humanOnTheLoop: true,
      noExecutionAuthorized: true,
      ...overrides,
    };
  }

  function validInput(sessionStatus, withReview) {
    const session = validSession(sessionStatus ?? "previewed");
    if (withReview) {
      session.currentReviewId = "rev_001";
    }
    const input = {
      workOrder: validWorkOrder(),
      autonomyEnvelope: validEnvelope(),
      reviewSession: session,
    };
    if (withReview) {
      input.review = validReview();
    }
    return input;
  }

  // ---------------------------------------------------------------------------
  // Builder tests
  // ---------------------------------------------------------------------------

  await t.test("builds valid governance bundle from valid workOrder input", () => {
    const input = validInput("previewed", false);
    const bundle = buildWorkOrderGovernanceBundle(input);

    assert.ok(bundle.id, "bundle must have an id");
    assert.equal(bundle.workOrder.id, "wo_001");
    assert.equal(bundle.autonomyEnvelope.id, "env_001");
    assert.equal(bundle.reviewSession.id, "sess_001");
    assert.equal(bundle.humanOnTheLoop, true);
    assert.equal(bundle.noExecutionAuthorized, true);
    assert.ok(bundle.createdAt, "bundle must have createdAt");
    assert.equal(bundle.status, "preview");
    assert.equal(bundle.review, undefined);
  });

  await t.test("builder maps awaiting_review session to awaiting_review status", () => {
    const input = validInput("awaiting_review", false);
    const bundle = buildWorkOrderGovernanceBundle(input);
    assert.equal(bundle.status, "awaiting_review");
  });

  await t.test("builder maps approved_to_plan session to approved_to_plan status", () => {
    const input = validInput("approved_to_plan", true);
    const bundle = buildWorkOrderGovernanceBundle(input);
    assert.equal(bundle.status, "approved_to_plan");
  });

  await t.test("builder includes review when provided", () => {
    const input = validInput("approved_to_plan", true);
    const bundle = buildWorkOrderGovernanceBundle(input);
    assert.ok(bundle.review, "bundle must include review");
    assert.equal(bundle.review.id, "rev_001");
  });

  // ---------------------------------------------------------------------------
  // Valid bundle validation tests
  // ---------------------------------------------------------------------------

  await t.test("validates valid preview bundle without review", () => {
    const input = validInput("previewed", false);
    const bundle = buildWorkOrderGovernanceBundle(input);
    const result = validateWorkOrderGovernanceBundle(bundle);
    assert.equal(result.valid, true, JSON.stringify(result.issues));
    assert.equal(result.issues.filter((i) => i.severity === "error").length, 0);
  });

  await t.test("validates valid awaiting_review bundle without review", () => {
    const input = validInput("awaiting_review", false);
    const bundle = buildWorkOrderGovernanceBundle(input);
    const result = validateWorkOrderGovernanceBundle(bundle);
    assert.equal(result.valid, true, JSON.stringify(result.issues));
  });

  await t.test("validates approved_to_plan bundle with matching review", () => {
    const session = validSession("approved_to_plan", { currentReviewId: "rev_001" });
    const bundle = buildWorkOrderGovernanceBundle({
      workOrder: validWorkOrder(),
      autonomyEnvelope: validEnvelope(),
      reviewSession: session,
      review: validReview(),
    });
    const result = validateWorkOrderGovernanceBundle(bundle);
    assert.equal(result.valid, true, JSON.stringify(result.issues));
  });

  // ---------------------------------------------------------------------------
  // Review requirement checks
  // ---------------------------------------------------------------------------

  await t.test("blocks approved_to_plan session without review", () => {
    const session = validSession("approved_to_plan");
    const bundle = buildWorkOrderGovernanceBundle({
      workOrder: validWorkOrder(),
      autonomyEnvelope: validEnvelope(),
      reviewSession: session,
    });
    const result = validateWorkOrderGovernanceBundle(bundle);
    assert.equal(result.valid, false);
    assert.ok(
      result.issues.some((i) => i.code === "review_required_for_terminal_session"),
      "must flag missing review for approved_to_plan session",
    );
  });

  await t.test("blocks changes_requested session without review", () => {
    const session = validSession("changes_requested");
    const bundle = buildWorkOrderGovernanceBundle({
      workOrder: validWorkOrder(),
      autonomyEnvelope: validEnvelope(),
      reviewSession: session,
    });
    const result = validateWorkOrderGovernanceBundle(bundle);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "review_required_for_terminal_session"));
  });

  await t.test("blocks rejected session without review", () => {
    const session = validSession("rejected");
    const bundle = buildWorkOrderGovernanceBundle({
      workOrder: validWorkOrder(),
      autonomyEnvelope: validEnvelope(),
      reviewSession: session,
    });
    const result = validateWorkOrderGovernanceBundle(bundle);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "review_required_for_terminal_session"));
  });

  // ---------------------------------------------------------------------------
  // workOrderId consistency checks
  // ---------------------------------------------------------------------------

  await t.test("blocks mismatched workOrderId between workOrder and envelope", () => {
    const bundle = buildWorkOrderGovernanceBundle({
      workOrder: validWorkOrder(),
      autonomyEnvelope: validEnvelope({ workOrderId: "wo_WRONG" }),
      reviewSession: validSession("previewed"),
    });
    const result = validateWorkOrderGovernanceBundle(bundle);
    assert.equal(result.valid, false);
    assert.ok(
      result.issues.some((i) => i.code === "workorder_id_mismatch_envelope"),
      "must flag envelope workOrderId mismatch",
    );
  });

  await t.test("blocks mismatched workOrderId between workOrder and session", () => {
    const bundle = buildWorkOrderGovernanceBundle({
      workOrder: validWorkOrder(),
      autonomyEnvelope: validEnvelope(),
      reviewSession: validSession("previewed", { workOrderId: "wo_WRONG" }),
    });
    const result = validateWorkOrderGovernanceBundle(bundle);
    assert.equal(result.valid, false);
    assert.ok(
      result.issues.some((i) => i.code === "workorder_id_mismatch_session"),
      "must flag session workOrderId mismatch",
    );
  });

  await t.test("blocks mismatched workOrderId between workOrder and review", () => {
    const session = validSession("approved_to_plan", { currentReviewId: "rev_001" });
    const bundle = buildWorkOrderGovernanceBundle({
      workOrder: validWorkOrder(),
      autonomyEnvelope: validEnvelope(),
      reviewSession: session,
      review: validReview({ workOrderId: "wo_WRONG" }),
    });
    const result = validateWorkOrderGovernanceBundle(bundle);
    assert.equal(result.valid, false);
    assert.ok(
      result.issues.some((i) => i.code === "workorder_id_mismatch_review"),
      "must flag review workOrderId mismatch",
    );
  });

  // ---------------------------------------------------------------------------
  // ID cross-reference checks
  // ---------------------------------------------------------------------------

  await t.test("blocks mismatched reviewSession.autonomyEnvelopeId", () => {
    const session = validSession("previewed", {
      autonomyEnvelopeId: "env_WRONG",
    });
    const bundle = buildWorkOrderGovernanceBundle({
      workOrder: validWorkOrder(),
      autonomyEnvelope: validEnvelope(),
      reviewSession: session,
    });
    const result = validateWorkOrderGovernanceBundle(bundle);
    assert.equal(result.valid, false);
    assert.ok(
      result.issues.some((i) => i.code === "autonomy_envelope_id_mismatch"),
      "must flag autonomyEnvelopeId mismatch",
    );
  });

  await t.test("passes when reviewSession.autonomyEnvelopeId matches envelope.id", () => {
    const session = validSession("previewed", {
      autonomyEnvelopeId: "env_001",
    });
    const bundle = buildWorkOrderGovernanceBundle({
      workOrder: validWorkOrder(),
      autonomyEnvelope: validEnvelope(),
      reviewSession: session,
    });
    const result = validateWorkOrderGovernanceBundle(bundle);
    assert.equal(result.valid, true, JSON.stringify(result.issues));
  });

  await t.test("blocks mismatched reviewSession.currentReviewId when review is present", () => {
    const session = validSession("approved_to_plan", {
      currentReviewId: "rev_WRONG",
    });
    const bundle = buildWorkOrderGovernanceBundle({
      workOrder: validWorkOrder(),
      autonomyEnvelope: validEnvelope(),
      reviewSession: session,
      review: validReview(),
    });
    const result = validateWorkOrderGovernanceBundle(bundle);
    assert.equal(result.valid, false);
    assert.ok(
      result.issues.some((i) => i.code === "current_review_id_mismatch"),
      "must flag currentReviewId mismatch",
    );
  });

  await t.test("blocks absent reviewSession.currentReviewId when review is present", () => {
    // currentReviewId is undefined but review exists
    const session = validSession("approved_to_plan"); // no currentReviewId
    const bundle = buildWorkOrderGovernanceBundle({
      workOrder: validWorkOrder(),
      autonomyEnvelope: validEnvelope(),
      reviewSession: session,
      review: validReview(),
    });
    const result = validateWorkOrderGovernanceBundle(bundle);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "current_review_id_mismatch"));
  });

  // ---------------------------------------------------------------------------
  // Review decision ↔ session status consistency
  // ---------------------------------------------------------------------------

  await t.test("blocks review decision inconsistent with session status", () => {
    // review says approve_to_plan but session says changes_requested
    const session = validSession("changes_requested", { currentReviewId: "rev_001" });
    const bundle = buildWorkOrderGovernanceBundle({
      workOrder: validWorkOrder(),
      autonomyEnvelope: validEnvelope(),
      reviewSession: session,
      review: validReview({ decision: "approve_to_plan" }),
    });
    const result = validateWorkOrderGovernanceBundle(bundle);
    assert.equal(result.valid, false);
    assert.ok(
      result.issues.some((i) => i.code === "review_decision_session_status_mismatch"),
      "must flag decision/status mismatch",
    );
  });

  await t.test("blocks request_changes review with approved_to_plan session", () => {
    const session = validSession("approved_to_plan", { currentReviewId: "rev_001" });
    // request_changes decision requires requestedChanges per the review contract
    const bundle = buildWorkOrderGovernanceBundle({
      workOrder: validWorkOrder(),
      autonomyEnvelope: validEnvelope(),
      reviewSession: session,
      review: validReview({
        decision: "request_changes",
        reason: "needs changes",
        requestedChanges: [{ field: "title", description: "Update it", severity: "required" }],
      }),
    });
    const result = validateWorkOrderGovernanceBundle(bundle);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "review_decision_session_status_mismatch"));
  });

  // ---------------------------------------------------------------------------
  // Envelope agent ID consistency
  // ---------------------------------------------------------------------------

  await t.test("blocks envelope agentId mismatch with workOrder owner/assigned agent", () => {
    const bundle = buildWorkOrderGovernanceBundle({
      workOrder: validWorkOrder(),
      autonomyEnvelope: validEnvelope({ agentId: "completely_wrong_agent" }),
      reviewSession: validSession("previewed"),
    });
    const result = validateWorkOrderGovernanceBundle(bundle);
    assert.equal(result.valid, false);
    assert.ok(
      result.issues.some((i) => i.code === "envelope_agent_id_mismatch"),
      "must flag agent ID mismatch",
    );
  });

  await t.test("passes when envelope agentId matches ownerAgentId", () => {
    const bundle = buildWorkOrderGovernanceBundle({
      workOrder: validWorkOrder({ ownerAgentId: "joris", assignedAgentId: "joris" }),
      autonomyEnvelope: validEnvelope({ agentId: "joris" }),
      reviewSession: validSession("previewed"),
    });
    const result = validateWorkOrderGovernanceBundle(bundle);
    assert.equal(result.valid, true, JSON.stringify(result.issues));
  });

  await t.test("passes when envelope agentId matches assignedAgentId on mission", () => {
    const bundle = buildWorkOrderGovernanceBundle({
      workOrder: validWorkOrder({ ownerAgentId: "owner_agent", assignedAgentId: "worker_agent" }),
      autonomyEnvelope: validEnvelope({ agentId: "worker_agent" }),
      reviewSession: validSession("previewed"),
    });
    const result = validateWorkOrderGovernanceBundle(bundle);
    assert.equal(result.valid, true, JSON.stringify(result.issues));
  });

  // ---------------------------------------------------------------------------
  // Forbidden live-execution field checks
  // ---------------------------------------------------------------------------

  await t.test("blocks forbidden live execution field nested in session metadata", () => {
    const session = validSession("previewed", {
      metadata: { deployNow: true },
    });
    const bundle = buildWorkOrderGovernanceBundle({
      workOrder: validWorkOrder(),
      autonomyEnvelope: validEnvelope(),
      reviewSession: session,
    });
    const result = validateWorkOrderGovernanceBundle(bundle);
    assert.equal(result.valid, false);
    assert.ok(
      result.issues.some((i) => i.code.includes("forbidden_execution_field")),
      "must flag forbidden field in session metadata",
    );
  });

  await t.test("blocks forbidden live execution field nested in session events", () => {
    const session = validSession("previewed", {
      events: [
        {
          id: "e1",
          type: "test_event",
          timestamp: new Date().toISOString(),
          actorId: "michael",
          metadata: { liveMode: true },
        },
      ],
    });
    const bundle = buildWorkOrderGovernanceBundle({
      workOrder: validWorkOrder(),
      autonomyEnvelope: validEnvelope(),
      reviewSession: session,
    });
    const result = validateWorkOrderGovernanceBundle(bundle);
    assert.equal(result.valid, false);
    assert.ok(
      result.issues.some((i) => i.code.includes("forbidden_execution_field")),
      "must flag forbidden field in session events metadata",
    );
  });

  await t.test("blocks forbidden live execution field nested in review metadata", () => {
    const session = validSession("approved_to_plan", { currentReviewId: "rev_001" });
    const bundle = buildWorkOrderGovernanceBundle({
      workOrder: validWorkOrder(),
      autonomyEnvelope: validEnvelope(),
      reviewSession: session,
      review: validReview({ metadata: { executeNow: true } }),
    });
    const result = validateWorkOrderGovernanceBundle(bundle);
    assert.equal(result.valid, false);
    assert.ok(
      result.issues.some((i) => i.code.includes("forbidden_execution_field")),
      "must flag forbidden field in review metadata",
    );
  });

  await t.test("blocks forbidden field runtimeDispatch in envelope metadata", () => {
    const envelope = validEnvelope({ metadata: { runtimeDispatch: true } });
    const bundle = buildWorkOrderGovernanceBundle({
      workOrder: validWorkOrder(),
      autonomyEnvelope: envelope,
      reviewSession: validSession("previewed"),
    });
    const result = validateWorkOrderGovernanceBundle(bundle);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code.includes("forbidden_execution_field")));
  });

  // ---------------------------------------------------------------------------
  // humanOnTheLoop & noExecutionAuthorized enforcement
  // ---------------------------------------------------------------------------

  await t.test("enforces humanOnTheLoop true on bundle", () => {
    const input = validInput("previewed", false);
    const bundle = buildWorkOrderGovernanceBundle(input);
    // Manually override — simulates a tampered bundle
    const tampered = { ...bundle, humanOnTheLoop: false };
    const result = validateWorkOrderGovernanceBundle(tampered);
    assert.equal(result.valid, false);
    assert.ok(
      result.issues.some(
        (i) => i.code === "human_on_the_loop_required" || i.code === "planning_only_semantics_violated",
      ),
      "must flag humanOnTheLoop: false",
    );
  });

  await t.test("enforces noExecutionAuthorized true on bundle", () => {
    const input = validInput("previewed", false);
    const bundle = buildWorkOrderGovernanceBundle(input);
    const tampered = { ...bundle, noExecutionAuthorized: false };
    const result = validateWorkOrderGovernanceBundle(tampered);
    assert.equal(result.valid, false);
    assert.ok(
      result.issues.some(
        (i) =>
          i.code === "no_execution_authorized_required" ||
          i.code === "planning_only_semantics_violated",
      ),
      "must flag noExecutionAuthorized: false",
    );
  });

  // ---------------------------------------------------------------------------
  // Planning-only semantics proofs
  // ---------------------------------------------------------------------------

  await t.test("proves approve_to_plan does not authorize execution", () => {
    const session = validSession("approved_to_plan", { currentReviewId: "rev_001" });
    const bundle = buildWorkOrderGovernanceBundle({
      workOrder: validWorkOrder(),
      autonomyEnvelope: validEnvelope(),
      reviewSession: session,
      review: validReview({ decision: "approve_to_plan" }),
    });

    // The bundle must enforce no-execution invariants
    assert.equal(bundle.humanOnTheLoop, true);
    assert.equal(bundle.noExecutionAuthorized, true);
    assert.equal(bundle.reviewSession.noExecutionAuthorized, true);
    assert.equal(bundle.review.noExecutionAuthorized, true);
    assert.equal(bundle.autonomyEnvelope.noExecutionAuthorized, true);
    // Status is approved_to_plan — planning only
    assert.equal(bundle.status, "approved_to_plan");
    // Validate the full bundle — it must be valid, not execute anything
    const result = validateWorkOrderGovernanceBundle(bundle);
    assert.equal(result.valid, true, JSON.stringify(result.issues));
  });

  await t.test("proves WorkOrder.status is not mutated to approved or in_progress by the builder", () => {
    const wo = validWorkOrder({ status: "draft" });
    const inputSnapshot = JSON.parse(JSON.stringify(wo));
    const input = {
      workOrder: wo,
      autonomyEnvelope: validEnvelope(),
      reviewSession: validSession("approved_to_plan", { currentReviewId: "rev_001" }),
      review: validReview(),
    };
    const bundle = buildWorkOrderGovernanceBundle(input);

    // The workOrder inside the bundle must not have been mutated to "approved" or "in_progress"
    assert.notEqual(bundle.workOrder.status, "approved");
    assert.notEqual(bundle.workOrder.status, "in_progress");
    // The original input workOrder must also be unchanged
    assert.equal(wo.status, inputSnapshot.status);
    assert.equal(wo.status, "draft");
  });

  // ---------------------------------------------------------------------------
  // Immutability / non-mutation proofs
  // ---------------------------------------------------------------------------

  await t.test("builder does not mutate input", () => {
    const input = validInput("previewed", false);
    const snapshot = JSON.stringify(input);
    buildWorkOrderGovernanceBundle(input);
    assert.equal(JSON.stringify(input), snapshot, "input must not be mutated by builder");
  });

  await t.test("validator does not mutate bundle", () => {
    const input = validInput("previewed", false);
    const bundle = buildWorkOrderGovernanceBundle(input);
    const snapshot = JSON.stringify(bundle);
    validateWorkOrderGovernanceBundle(bundle);
    assert.equal(JSON.stringify(bundle), snapshot, "bundle must not be mutated by validator");
  });

  // ---------------------------------------------------------------------------
  // Summary tests
  // ---------------------------------------------------------------------------

  await t.test("summary includes Human-on-the-Loop wording", () => {
    const bundle = buildWorkOrderGovernanceBundle(validInput("previewed", false));
    const summary = createWorkOrderGovernanceBundleSummary(bundle);
    assert.ok(
      summary.text.includes("Human-on-the-Loop"),
      "summary text must include Human-on-the-Loop",
    );
    assert.equal(summary.humanOnTheLoop, true);
  });

  await t.test("summary includes Aucune action executee no-execution wording", () => {
    const bundle = buildWorkOrderGovernanceBundle(validInput("previewed", false));
    const summary = createWorkOrderGovernanceBundleSummary(bundle);
    assert.ok(
      summary.text.includes("Aucune action"),
      "summary text must include Aucune action executee",
    );
    assert.equal(summary.noExecutionAuthorized, true);
  });

  await t.test("summary includes approve_to_plan is planning only note", () => {
    const bundle = buildWorkOrderGovernanceBundle(validInput("previewed", false));
    const summary = createWorkOrderGovernanceBundleSummary(bundle);
    assert.ok(
      summary.planningOnlyNote.includes("approve_to_plan") &&
        summary.planningOnlyNote.includes("planning only"),
      "planningOnlyNote must reference approve_to_plan and planning only",
    );
    assert.ok(
      summary.text.includes("approve_to_plan") && summary.text.includes("planning only"),
      "summary text must reference approve_to_plan is planning only",
    );
  });

  await t.test("summary includes approval-required and blocked actions", () => {
    const bundle = buildWorkOrderGovernanceBundle(validInput("previewed", false));
    const summary = createWorkOrderGovernanceBundleSummary(bundle);

    // Approval-required actions
    assert.ok(
      summary.approvalRequiredActions.length > 0,
      "summary must include approval-required actions",
    );
    assert.ok(
      summary.text.includes("publish") || summary.text.includes("send_message"),
      "summary text must list approval-required action names",
    );

    // Blocked actions
    assert.ok(summary.blockedActions.length > 0, "summary must include blocked actions");
    assert.ok(
      summary.text.includes("runtime_dispatch") || summary.text.includes("live_execution"),
      "summary text must list blocked action names",
    );
  });

  await t.test("summary exposes workOrderId, agentId, autonomyLevel, sessionStatus", () => {
    const bundle = buildWorkOrderGovernanceBundle(validInput("awaiting_review", false));
    const summary = createWorkOrderGovernanceBundleSummary(bundle);
    assert.equal(summary.workOrderId, "wo_001");
    assert.equal(summary.agentId, "joris");
    assert.equal(summary.autonomyLevel, "autonomous_dry_run");
    assert.equal(summary.sessionStatus, "awaiting_review");
  });

  await t.test("summary exposes reviewDecision when review is present", () => {
    const session = validSession("approved_to_plan", { currentReviewId: "rev_001" });
    const bundle = buildWorkOrderGovernanceBundle({
      workOrder: validWorkOrder(),
      autonomyEnvelope: validEnvelope(),
      reviewSession: session,
      review: validReview(),
    });
    const summary = createWorkOrderGovernanceBundleSummary(bundle);
    assert.equal(summary.reviewDecision, "approve_to_plan");
  });

  await t.test("summary reviewDecision is undefined when no review", () => {
    const bundle = buildWorkOrderGovernanceBundle(validInput("previewed", false));
    const summary = createWorkOrderGovernanceBundleSummary(bundle);
    assert.equal(summary.reviewDecision, undefined);
  });

  // ---------------------------------------------------------------------------
  // mapReviewDecisionToSessionStatus helper
  // ---------------------------------------------------------------------------

  await t.test("status mapping helper maps all known review decisions", () => {
    assert.equal(mapReviewDecisionToSessionStatus("approve_to_plan"), "approved_to_plan");
    assert.equal(mapReviewDecisionToSessionStatus("request_changes"), "changes_requested");
    assert.equal(mapReviewDecisionToSessionStatus("reject"), "rejected");
    assert.equal(mapReviewDecisionToSessionStatus("ask_for_more_info"), "more_info_requested");
    assert.equal(
      mapReviewDecisionToSessionStatus("blocked_execution_request"),
      "blocked_execution_request",
    );
  });

  await t.test("invalid status mapping is safely rejected (returns null)", () => {
    assert.equal(mapReviewDecisionToSessionStatus("unknown_decision"), null);
    assert.equal(mapReviewDecisionToSessionStatus(""), null);
    assert.equal(mapReviewDecisionToSessionStatus("execute_now"), null);
    assert.equal(mapReviewDecisionToSessionStatus("approve_to_execute"), null);
  });

  // ---------------------------------------------------------------------------
  // isReviewConsistentWithSession helper
  // ---------------------------------------------------------------------------

  await t.test("isReviewConsistentWithSession returns true for matching pair", () => {
    const review = validReview({ decision: "approve_to_plan" });
    const session = validSession("approved_to_plan");
    assert.equal(isReviewConsistentWithSession(review, session), true);
  });

  await t.test("isReviewConsistentWithSession returns false for mismatched pair", () => {
    const review = validReview({ decision: "approve_to_plan" });
    const session = validSession("changes_requested");
    assert.equal(isReviewConsistentWithSession(review, session), false);
  });

  // ---------------------------------------------------------------------------
  // isEnvelopeConsistentWithWorkOrder helper
  // ---------------------------------------------------------------------------

  await t.test("isEnvelopeConsistentWithWorkOrder matches ownerAgentId", () => {
    const wo = validWorkOrder({ ownerAgentId: "joris", assignedAgentId: "joris" });
    const env = validEnvelope({ agentId: "joris" });
    assert.equal(isEnvelopeConsistentWithWorkOrder(env, wo), true);
  });

  await t.test("isEnvelopeConsistentWithWorkOrder matches assignedAgentId on mission", () => {
    const wo = validWorkOrder({ ownerAgentId: "owner_a", assignedAgentId: "worker_b" });
    const env = validEnvelope({ agentId: "worker_b" });
    assert.equal(isEnvelopeConsistentWithWorkOrder(env, wo), true);
  });

  await t.test("isEnvelopeConsistentWithWorkOrder rejects mismatch", () => {
    const wo = validWorkOrder({ ownerAgentId: "joris", assignedAgentId: "joris" });
    const env = validEnvelope({ agentId: "rogue_agent" });
    assert.equal(isEnvelopeConsistentWithWorkOrder(env, wo), false);
  });

  // ---------------------------------------------------------------------------
  // hasForbiddenGovernanceBundleFields helper
  // ---------------------------------------------------------------------------

  await t.test("hasForbiddenGovernanceBundleFields detects top-level forbidden fields", () => {
    assert.equal(hasForbiddenGovernanceBundleFields({ executeNow: true }), true);
    assert.equal(hasForbiddenGovernanceBundleFields({ liveMode: false }), true);
    assert.equal(hasForbiddenGovernanceBundleFields({ runtimeDispatch: "go" }), true);
    assert.equal(hasForbiddenGovernanceBundleFields({ deployNow: true }), true);
    assert.equal(hasForbiddenGovernanceBundleFields({ publishNow: true }), true);
    assert.equal(hasForbiddenGovernanceBundleFields({ sendNow: true }), true);
    assert.equal(hasForbiddenGovernanceBundleFields({ externalWrite: true }), true);
  });

  await t.test("hasForbiddenGovernanceBundleFields detects nested forbidden fields", () => {
    assert.equal(hasForbiddenGovernanceBundleFields({ metadata: { executeNow: true } }), true);
    assert.equal(
      hasForbiddenGovernanceBundleFields({ a: { b: { c: { deployNow: "yes" } } } }),
      true,
    );
    assert.equal(
      hasForbiddenGovernanceBundleFields({ events: [{ metadata: { liveMode: true } }] }),
      true,
    );
  });

  await t.test("hasForbiddenGovernanceBundleFields returns false for clean objects", () => {
    assert.equal(hasForbiddenGovernanceBundleFields({ id: "x", status: "previewed" }), false);
    assert.equal(hasForbiddenGovernanceBundleFields(null), false);
    assert.equal(hasForbiddenGovernanceBundleFields(undefined), false);
    assert.equal(hasForbiddenGovernanceBundleFields("string"), false);
    assert.equal(hasForbiddenGovernanceBundleFields(42), false);
  });

  // ---------------------------------------------------------------------------
  // assertPlanningOnlyStatusSemantics helper
  // ---------------------------------------------------------------------------

  await t.test("assertPlanningOnlyStatusSemantics passes on a valid bundle", () => {
    const bundle = buildWorkOrderGovernanceBundle(validInput("previewed", false));
    const issues = assertPlanningOnlyStatusSemantics(bundle);
    assert.equal(issues.filter((i) => i.severity === "error").length, 0);
  });

  await t.test("assertPlanningOnlyStatusSemantics flags humanOnTheLoop: false", () => {
    const bundle = buildWorkOrderGovernanceBundle(validInput("previewed", false));
    const tampered = { ...bundle, humanOnTheLoop: false };
    const issues = assertPlanningOnlyStatusSemantics(tampered);
    assert.ok(issues.some((i) => i.code === "planning_only_semantics_violated"));
  });

  await t.test("assertPlanningOnlyStatusSemantics flags noExecutionAuthorized: false", () => {
    const bundle = buildWorkOrderGovernanceBundle(validInput("previewed", false));
    const tampered = { ...bundle, noExecutionAuthorized: false };
    const issues = assertPlanningOnlyStatusSemantics(tampered);
    assert.ok(issues.some((i) => i.code === "planning_only_semantics_violated"));
  });

  await t.test("assertPlanningOnlyStatusSemantics flags forbidden approveToExecute field", () => {
    const bundle = buildWorkOrderGovernanceBundle(validInput("previewed", false));
    const tampered = { ...bundle, approveToExecute: true };
    const issues = assertPlanningOnlyStatusSemantics(tampered);
    assert.ok(issues.some((i) => i.code === "forbidden_execution_authorization"));
  });
});
