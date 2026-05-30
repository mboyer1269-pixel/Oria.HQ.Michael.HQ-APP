// src/server/joris/governance-bundle-review-applicator.test.mjs

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("Joris Governance Bundle Review Applicator tests", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const applicatorMod = await jiti.import(
    path.join(__dirname, "governance-bundle-review-applicator.ts"),
  );
  const {
    applyReviewToGovernanceBundle,
    isBundleReviewable,
    formatApplicationMessage,
  } = applicatorMod;

  const previewMod = await jiti.import(
    path.join(__dirname, "governance-bundle-preview.ts"),
  );
  const { buildJorisGovernanceBundlePreview } = previewMod;

  const bundleMod = await jiti.import(
    path.join(projectRoot, "src/server/agents/work-order-governance-bundle.ts"),
  );
  const { buildWorkOrderGovernanceBundle } = bundleMod;

  // ---------------------------------------------------------------------------
  // Fixtures
  // ---------------------------------------------------------------------------

  function validMissionWorkOrder(overrides) {
    return {
      id: "wo_001",
      type: "mission",
      title: "Test Mission",
      ownerAgentId: "joris",
      assignedAgentId: "joris",
      objective: "Validate the review applicator",
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
      createdAt: "2026-05-29T10:00:00.000Z",
      ...overrides,
    };
  }

  /** A realistic preview bundle (session status: previewed) via the PR125 helper. */
  function makePreviewBundle(workOrderOverrides) {
    const preview = buildJorisGovernanceBundlePreview({
      workOrder: validMissionWorkOrder(workOrderOverrides),
      reviewerId: "michael",
      reviewerRole: "ceo",
      createdAt: "2026-05-29T10:00:00.000Z",
    });
    return preview.bundle;
  }

  /** Direct bundle construction for arbitrary session states. */
  function makeBundle(sessionStatus, withReview) {
    const envelope = {
      id: "env_001",
      workOrderId: "wo_001",
      agentId: "joris",
      autonomyLevel: "autonomous_dry_run",
      allowedAutonomousActions: ["research", "analyze", "summarize"],
      approvalRequiredActions: ["publish", "send_message"],
      blockedActions: ["runtime_dispatch", "live_execution"],
      escalationTriggers: [],
      humanOnTheLoop: true,
      noExecutionAuthorized: true,
      createdAt: "2026-05-29T10:00:00.000Z",
    };
    const session = {
      id: "sess_001",
      workOrderId: "wo_001",
      status: sessionStatus,
      reviewerId: "michael",
      reviewerRole: "ceo",
      createdAt: "2026-05-29T10:00:00.000Z",
      updatedAt: "2026-05-29T10:00:00.000Z",
      humanOnTheLoop: true,
      noExecutionAuthorized: true,
      autonomyEnvelopeId: "env_001",
    };
    const args = {
      workOrder: validMissionWorkOrder(),
      autonomyEnvelope: envelope,
      reviewSession: session,
    };
    if (withReview) {
      session.currentReviewId = "rev_001";
      args.review = {
        id: "rev_001",
        workOrderId: "wo_001",
        decision: "approve_to_plan",
        reviewerId: "michael",
        reviewerRole: "ceo",
        createdAt: "2026-05-29T10:00:00.000Z",
        humanOnTheLoop: true,
        noExecutionAuthorized: true,
      };
    }
    return buildWorkOrderGovernanceBundle(args);
  }

  function applyMsg(bundle, message, extra) {
    return applyReviewToGovernanceBundle({
      bundle,
      message,
      createdAt: "2026-05-29T11:00:00.000Z",
      ...extra,
    });
  }

  // ---------------------------------------------------------------------------
  // isBundleReviewable
  // ---------------------------------------------------------------------------

  await t.test("isBundleReviewable true for previewed and awaiting_review", () => {
    assert.equal(isBundleReviewable(makeBundle("previewed", false)), true);
    assert.equal(isBundleReviewable(makeBundle("awaiting_review", false)), true);
  });

  await t.test("isBundleReviewable false for terminal session states", () => {
    assert.equal(isBundleReviewable(makeBundle("approved_to_plan", true)), false);
    assert.equal(isBundleReviewable(makeBundle("rejected", true)), false);
    assert.equal(isBundleReviewable(makeBundle("blocked_execution_request", false)), false);
  });

  // ---------------------------------------------------------------------------
  // approve_to_plan
  // ---------------------------------------------------------------------------

  await t.test("applies approve_to_plan from a preview bundle", () => {
    const result = applyMsg(makePreviewBundle(), "ok pour planifier");
    assert.equal(result.applied, true);
    assert.equal(result.intent, "approve_to_plan");
    assert.equal(result.previousStatus, "preview");
    assert.equal(result.nextStatus, "approved_to_plan");
    assert.equal(result.bundle.reviewSession.status, "approved_to_plan");
    assert.ok(result.bundle.review, "a review must be attached");
    assert.equal(result.bundle.review.decision, "approve_to_plan");
    assert.equal(result.validation.valid, true, JSON.stringify(result.validation.issues));
  });

  await t.test("approve_to_plan wires currentReviewId to the attached review", () => {
    const result = applyMsg(makePreviewBundle(), "ok pour planifier");
    assert.equal(
      result.bundle.reviewSession.currentReviewId,
      result.bundle.review.id,
    );
  });

  await t.test("approve_to_plan does NOT authorize execution", () => {
    const result = applyMsg(makePreviewBundle(), "ok pour planifier");
    assert.equal(result.noExecutionAuthorized, true);
    assert.equal(result.bundle.noExecutionAuthorized, true);
    assert.equal(result.bundle.reviewSession.noExecutionAuthorized, true);
    assert.equal(result.bundle.review.noExecutionAuthorized, true);
    assert.equal(result.bundle.autonomyEnvelope.noExecutionAuthorized, true);
  });

  await t.test("approve_to_plan does NOT mutate workOrder.status", () => {
    const result = applyMsg(makePreviewBundle({ status: "draft" }), "ok pour planifier");
    assert.notEqual(result.bundle.workOrder.status, "approved");
    assert.notEqual(result.bundle.workOrder.status, "in_progress");
    assert.equal(result.bundle.workOrder.status, "draft");
  });

  // ---------------------------------------------------------------------------
  // request_changes
  // ---------------------------------------------------------------------------

  await t.test("applies request_changes with requestedChanges", () => {
    const result = applyMsg(makePreviewBundle(), "Modifie le budget stp");
    assert.equal(result.applied, true);
    assert.equal(result.intent, "request_changes");
    assert.equal(result.nextStatus, "changes_requested");
    assert.equal(result.bundle.reviewSession.status, "changes_requested");
    assert.ok(result.bundle.review.requestedChanges.length > 0);
    assert.equal(result.validation.valid, true, JSON.stringify(result.validation.issues));
  });

  // ---------------------------------------------------------------------------
  // reject
  // ---------------------------------------------------------------------------

  await t.test("applies reject with a reason", () => {
    const result = applyMsg(makePreviewBundle(), "Non, on abandonne");
    assert.equal(result.applied, true);
    assert.equal(result.intent, "reject");
    assert.equal(result.nextStatus, "rejected");
    assert.equal(result.bundle.reviewSession.status, "rejected");
    assert.ok(result.bundle.review.reason);
    assert.equal(result.validation.valid, true, JSON.stringify(result.validation.issues));
  });

  // ---------------------------------------------------------------------------
  // ask_for_more_info
  // ---------------------------------------------------------------------------

  await t.test("applies ask_for_more_info", () => {
    const result = applyMsg(makePreviewBundle(), "Pourquoi ce budget ? Explique.");
    assert.equal(result.applied, true);
    assert.equal(result.intent, "ask_for_more_info");
    assert.equal(result.nextStatus, "more_info_requested");
    assert.equal(result.bundle.reviewSession.status, "more_info_requested");
    assert.equal(result.validation.valid, true, JSON.stringify(result.validation.issues));
  });

  // ---------------------------------------------------------------------------
  // blocked_execution_request
  // ---------------------------------------------------------------------------

  await t.test("blocks execution language and moves to blocked_execution_request", () => {
    const result = applyMsg(makePreviewBundle(), "Déploie maintenant !");
    assert.equal(result.applied, true);
    assert.equal(result.intent, "blocked_execution_request");
    assert.equal(result.nextStatus, "blocked_execution_request");
    assert.equal(result.bundle.reviewSession.status, "blocked_execution_request");
  });

  await t.test("blocked_execution_request attaches NO review and sets no currentReviewId", () => {
    const result = applyMsg(makePreviewBundle(), "publie maintenant");
    assert.equal(result.bundle.review, undefined, "no review must be attached");
    assert.equal(
      result.bundle.reviewSession.currentReviewId,
      undefined,
      "no dangling currentReviewId must be set",
    );
    assert.equal(result.validation.valid, true, JSON.stringify(result.validation.issues));
  });

  await t.test("blocked_execution_request still enforces no-execution invariants", () => {
    const result = applyMsg(makePreviewBundle(), "envoie le message maintenant");
    assert.equal(result.bundle.humanOnTheLoop, true);
    assert.equal(result.bundle.noExecutionAuthorized, true);
    assert.equal(result.bundle.reviewSession.noExecutionAuthorized, true);
  });

  await t.test("approval-looking message containing execution verb is still blocked", () => {
    // "approuve et publie maintenant" contains approval language but also
    // execution language — safety must win.
    const result = applyMsg(makePreviewBundle(), "approuve et publie maintenant");
    assert.equal(result.intent, "blocked_execution_request");
    assert.equal(result.nextStatus, "blocked_execution_request");
  });

  // ---------------------------------------------------------------------------
  // ambiguous
  // ---------------------------------------------------------------------------

  await t.test("ambiguous message does not change state", () => {
    const bundle = makePreviewBundle();
    const result = applyMsg(bundle, "zzzz qqqq");
    assert.equal(result.applied, false);
    assert.equal(result.intent, "ambiguous");
    assert.equal(result.nextStatus, "preview");
    assert.equal(result.bundle.reviewSession.status, "previewed");
    assert.ok(result.issues.some((i) => i.code === "ambiguous_review_intent"));
  });

  // ---------------------------------------------------------------------------
  // Guards
  // ---------------------------------------------------------------------------

  await t.test("refuses to apply to a non-reviewable (terminal) session", () => {
    const bundle = makeBundle("approved_to_plan", true);
    const result = applyMsg(bundle, "ok pour planifier");
    assert.equal(result.applied, false);
    assert.ok(result.issues.some((i) => i.code === "session_not_reviewable"));
    assert.equal(result.nextStatus, result.previousStatus);
  });

  await t.test("refuses to apply to an invalid incoming bundle", () => {
    const bundle = makePreviewBundle();
    // Tamper: inject a forbidden execution field deep in the bundle.
    const tampered = {
      ...bundle,
      reviewSession: {
        ...bundle.reviewSession,
        metadata: { deployNow: true },
      },
    };
    const result = applyMsg(tampered, "ok pour planifier");
    assert.equal(result.applied, false);
    assert.ok(result.issues.some((i) => i.code === "bundle_not_valid"));
  });

  // ---------------------------------------------------------------------------
  // Starting from awaiting_review directly
  // ---------------------------------------------------------------------------

  await t.test("applies a decision when session is already awaiting_review", () => {
    const bundle = makeBundle("awaiting_review", false);
    const result = applyMsg(bundle, "ok pour planifier");
    assert.equal(result.applied, true);
    assert.equal(result.nextStatus, "approved_to_plan");
    assert.equal(result.validation.valid, true, JSON.stringify(result.validation.issues));
  });

  // ---------------------------------------------------------------------------
  // Identity preservation & purity
  // ---------------------------------------------------------------------------

  await t.test("preserves bundle id and createdAt across application", () => {
    const bundle = makePreviewBundle();
    const result = applyMsg(bundle, "ok pour planifier");
    assert.equal(result.bundle.id, bundle.id);
    assert.equal(result.bundle.createdAt, bundle.createdAt);
  });

  await t.test("does not mutate the input bundle", () => {
    const bundle = makePreviewBundle();
    const snapshot = JSON.stringify(bundle);
    applyMsg(bundle, "ok pour planifier");
    assert.equal(JSON.stringify(bundle), snapshot, "input bundle must be unchanged");
  });

  await t.test("does not mutate input on blocked execution path", () => {
    const bundle = makePreviewBundle();
    const snapshot = JSON.stringify(bundle);
    applyMsg(bundle, "déploie maintenant");
    assert.equal(JSON.stringify(bundle), snapshot);
  });

  // ---------------------------------------------------------------------------
  // Reviewer identity defaults / overrides
  // ---------------------------------------------------------------------------

  await t.test("reviewer identity defaults from the session", () => {
    const result = applyMsg(makePreviewBundle(), "ok pour planifier");
    assert.equal(result.bundle.review.reviewerId, "michael");
    assert.equal(result.bundle.review.reviewerRole, "ceo");
  });

  await t.test("reviewer identity overrides are respected", () => {
    const result = applyMsg(makePreviewBundle(), "ok pour planifier", {
      reviewerId: "delegate-1",
      reviewerRole: "workflow_owner",
    });
    assert.equal(result.bundle.review.reviewerId, "delegate-1");
    assert.equal(result.bundle.review.reviewerRole, "workflow_owner");
  });

  // ---------------------------------------------------------------------------
  // Message content
  // ---------------------------------------------------------------------------

  await t.test("message includes Human-on-the-Loop and no-execution wording", () => {
    const result = applyMsg(makePreviewBundle(), "ok pour planifier");
    assert.ok(result.message.includes("Human-on-the-Loop"));
    assert.ok(result.message.includes("Aucune action"));
  });

  await t.test("approve_to_plan message states planning only, not execution", () => {
    const result = applyMsg(makePreviewBundle(), "ok pour planifier");
    assert.ok(
      result.message.includes("approve_to_plan") && result.message.includes("planning only"),
    );
  });

  await t.test("blocked message states the execution request was blocked", () => {
    const result = applyMsg(makePreviewBundle(), "déploie maintenant");
    assert.ok(
      result.message.includes("bloquée") || result.message.toLowerCase().includes("block"),
      "blocked message must mention the block",
    );
    assert.ok(result.message.includes("Aucune action"));
  });

  await t.test("not-applied message still carries Human-on-the-Loop note", () => {
    const result = applyMsg(makeBundle("rejected", true), "ok pour planifier");
    assert.equal(result.applied, false);
    assert.ok(result.message.includes("Human-on-the-Loop"));
  });

  // ---------------------------------------------------------------------------
  // Full re-validation of applied bundles
  // ---------------------------------------------------------------------------

  await t.test("every applied bundle passes full PR124 validation", () => {
    const messages = [
      "ok pour planifier",
      "Modifie le budget stp",
      "Non, on abandonne",
      "Pourquoi ce budget ? Explique.",
      "déploie maintenant",
    ];
    for (const msg of messages) {
      const result = applyMsg(makePreviewBundle(), msg);
      assert.equal(result.applied, true, `intent for "${msg}" should apply`);
      assert.equal(
        result.validation.valid,
        true,
        `bundle for "${msg}" must be valid: ${JSON.stringify(result.validation.issues)}`,
      );
    }
  });

  // ---------------------------------------------------------------------------
  // formatApplicationMessage purity
  // ---------------------------------------------------------------------------

  await t.test("formatApplicationMessage does not mutate inputs", () => {
    const result = applyMsg(makePreviewBundle(), "ok pour planifier");
    const snap = JSON.stringify({
      bundle: result.bundle,
      validation: result.validation,
      interpretation: result.interpretation,
    });
    formatApplicationMessage(result.bundle, result.validation, result.interpretation);
    assert.equal(
      JSON.stringify({
        bundle: result.bundle,
        validation: result.validation,
        interpretation: result.interpretation,
      }),
      snap,
    );
  });
});
