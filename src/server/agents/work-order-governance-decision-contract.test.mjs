// src/server/agents/work-order-governance-decision-contract.test.mjs

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("Work Order Governance Decision contract tests", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(path.join(__dirname, "work-order-governance-decision-contract.ts"));
  const {
    isGovernanceDecisionOutcome,
    buildGovernanceDecisionRecord,
    validateGovernanceDecisionRecord,
  } = mod;

  const previewMod = await jiti.import(
    path.join(projectRoot, "src/server/joris/governance-bundle-preview.ts"),
  );
  const { buildJorisGovernanceBundlePreview } = previewMod;

  const applicatorMod = await jiti.import(
    path.join(projectRoot, "src/server/joris/governance-bundle-review-applicator.ts"),
  );
  const { applyReviewToGovernanceBundle } = applicatorMod;

  function validMissionWorkOrder(overrides) {
    return {
      id: "wo_dec_001",
      type: "mission",
      title: "Decision Test Mission",
      ownerAgentId: "joris",
      assignedAgentId: "joris",
      objective: "Validate the decision contract",
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

  function previewBundle(overrides) {
    return buildJorisGovernanceBundlePreview({
      workOrder: validMissionWorkOrder(overrides),
      reviewerId: "michael",
      reviewerRole: "ceo",
      createdAt: "2026-05-29T10:00:00.000Z",
    }).bundle;
  }

  function decidedBundle(message) {
    const application = applyReviewToGovernanceBundle({
      bundle: previewBundle(),
      message,
      reviewerId: "michael",
      reviewerRole: "ceo",
      createdAt: "2026-05-29T11:00:00.000Z",
    });
    assert.equal(application.applied, true, `"${message}" must apply`);
    return application.bundle;
  }

  // ---------------------------------------------------------------------------
  // isGovernanceDecisionOutcome
  // ---------------------------------------------------------------------------

  await t.test("isGovernanceDecisionOutcome recognizes decided outcomes only", () => {
    assert.equal(isGovernanceDecisionOutcome("approved_to_plan"), true);
    assert.equal(isGovernanceDecisionOutcome("changes_requested"), true);
    assert.equal(isGovernanceDecisionOutcome("rejected"), true);
    assert.equal(isGovernanceDecisionOutcome("more_info_requested"), true);
    assert.equal(isGovernanceDecisionOutcome("blocked_execution_request"), true);
    assert.equal(isGovernanceDecisionOutcome("preview"), false);
    assert.equal(isGovernanceDecisionOutcome("awaiting_review"), false);
    assert.equal(isGovernanceDecisionOutcome("invalid"), false);
  });

  // ---------------------------------------------------------------------------
  // buildGovernanceDecisionRecord
  // ---------------------------------------------------------------------------

  await t.test("builds a valid approved_to_plan decision record", () => {
    const bundle = decidedBundle("Approuve pour le plan");
    const record = buildGovernanceDecisionRecord({ bundle, workspaceId: "ws1" });

    assert.ok(record.id.startsWith("govdec_"));
    assert.equal(record.workspaceId, "ws1");
    assert.equal(record.workOrderId, bundle.workOrder.id);
    assert.equal(record.bundleId, bundle.id);
    assert.equal(record.outcome, "approved_to_plan");
    assert.equal(record.sessionStatus, "approved_to_plan");
    assert.equal(record.reviewId, bundle.review.id);
    assert.equal(record.reviewDecision, "approve_to_plan");
    assert.equal(record.reviewerId, "michael");
    assert.equal(record.reviewerRole, "ceo");
    assert.equal(record.humanOnTheLoop, true);
    assert.equal(record.noExecutionAuthorized, true);

    const result = validateGovernanceDecisionRecord(record);
    assert.equal(result.valid, true, JSON.stringify(result.issues));
  });

  await t.test("blocked_execution_request record has no reviewId", () => {
    const bundle = decidedBundle("Déploie maintenant !");
    assert.equal(bundle.status, "blocked_execution_request");
    const record = buildGovernanceDecisionRecord({ bundle, workspaceId: "ws1" });
    assert.equal(record.outcome, "blocked_execution_request");
    assert.equal(record.reviewId, undefined);
    assert.equal(record.reviewDecision, undefined);
    const result = validateGovernanceDecisionRecord(record);
    assert.equal(result.valid, true, JSON.stringify(result.issues));
  });

  await t.test("reject and changes records validate", () => {
    for (const [message, outcome] of [
      ["Non, rejette cette idée", "rejected"],
      ["Modifie le budget stp", "changes_requested"],
      ["Pourquoi ce budget ? Explique.", "more_info_requested"],
    ]) {
      const bundle = decidedBundle(message);
      const record = buildGovernanceDecisionRecord({ bundle, workspaceId: "ws1" });
      assert.equal(record.outcome, outcome, `"${message}" → ${outcome}`);
      assert.equal(validateGovernanceDecisionRecord(record).valid, true);
    }
  });

  await t.test("builder does not mutate the bundle", () => {
    const bundle = decidedBundle("Approuve pour le plan");
    const snapshot = JSON.stringify(bundle);
    buildGovernanceDecisionRecord({ bundle, workspaceId: "ws1" });
    assert.equal(JSON.stringify(bundle), snapshot);
  });

  await t.test("reviewerId override is respected", () => {
    const bundle = decidedBundle("Approuve pour le plan");
    const record = buildGovernanceDecisionRecord({ bundle, workspaceId: "ws1", reviewerId: "delegate-9" });
    assert.equal(record.reviewerId, "delegate-9");
  });

  // ---------------------------------------------------------------------------
  // validateGovernanceDecisionRecord
  // ---------------------------------------------------------------------------

  await t.test("a non-decided (preview) bundle yields an invalid record", () => {
    const bundle = previewBundle();
    const record = buildGovernanceDecisionRecord({ bundle, workspaceId: "ws1" });
    assert.equal(record.outcome, "preview");
    const result = validateGovernanceDecisionRecord(record);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "invalid_outcome"));
  });

  await t.test("humanOnTheLoop false is rejected", () => {
    const bundle = decidedBundle("Approuve pour le plan");
    const record = { ...buildGovernanceDecisionRecord({ bundle, workspaceId: "ws1" }), humanOnTheLoop: false };
    const result = validateGovernanceDecisionRecord(record);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "human_on_the_loop_required"));
  });

  await t.test("noExecutionAuthorized false is rejected", () => {
    const bundle = decidedBundle("Approuve pour le plan");
    const record = { ...buildGovernanceDecisionRecord({ bundle, workspaceId: "ws1" }), noExecutionAuthorized: false };
    const result = validateGovernanceDecisionRecord(record);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "no_execution_authorized_required"));
  });

  await t.test("missing identifiers are rejected", () => {
    const bundle = decidedBundle("Approuve pour le plan");
    const record = { ...buildGovernanceDecisionRecord({ bundle, workspaceId: "ws1" }), workspaceId: "" };
    const result = validateGovernanceDecisionRecord(record);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "missing_workspace_id"));
  });

  await t.test("forbidden live-execution field is rejected", () => {
    const bundle = decidedBundle("Approuve pour le plan");
    const record = { ...buildGovernanceDecisionRecord({ bundle, workspaceId: "ws1" }), deployNow: true };
    const result = validateGovernanceDecisionRecord(record);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "forbidden_execution_field"));
  });
});
