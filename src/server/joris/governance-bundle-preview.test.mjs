// src/server/joris/governance-bundle-preview.test.mjs

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("Joris Governance Bundle Preview tests", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(
    path.join(__dirname, "governance-bundle-preview.ts"),
  );
  const {
    buildJorisGovernanceBundlePreview,
    formatJorisGovernanceBundlePreview,
    inputContainsForbiddenExecutionFields,
  } = mod;

  // ---------------------------------------------------------------------------
  // Fixture helpers
  // ---------------------------------------------------------------------------

  function validMissionWorkOrder(overrides) {
    return {
      id: "wo_001",
      type: "mission",
      title: "Test Mission",
      ownerAgentId: "joris",
      assignedAgentId: "joris",
      objective: "Validate governance bundle preview",
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

  function validVentureWorkOrder(overrides) {
    return {
      id: "wo_v_001",
      type: "venture",
      title: "Test Venture",
      ownerAgentId: "revenue-operator",
      businessIdea: "Sell widgets",
      revenueModel: "SaaS",
      profitTarget: 1000,
      validationTest: { description: "100 signups", evaluationMethod: "analytics" },
      expectedOutput: { description: "Landing page", outputType: "product" },
      boostersRequested: [],
      budgetRequested: { amount: 50, currency: "EUR" },
      approvalGates: [],
      promotionOpportunity: { targetLevel: 3, criteria: "Hit target", originalOryaEligible: false },
      successMetric: { description: "Reach target" },
      nextAction: { description: "Draft copy", actor: "revenue-operator" },
      businessValue: { valueType: "revenue", expectedValue: 1000, currency: "EUR", confidence: "medium" },
      status: "draft",
      createdByType: "joris",
      createdById: "joris",
      createdAt: new Date().toISOString(),
      ...overrides,
    };
  }

  function validInput(overrides) {
    return {
      workOrder: validMissionWorkOrder(),
      reviewerId: "michael",
      reviewerRole: "ceo",
      createdAt: "2026-05-29T10:00:00.000Z",
      ...overrides,
    };
  }

  // ---------------------------------------------------------------------------
  // Happy path
  // ---------------------------------------------------------------------------

  await t.test("builds a valid preview bundle from a mission work order", () => {
    const preview = buildJorisGovernanceBundlePreview(validInput());

    assert.ok(preview.bundle, "preview must include a bundle");
    assert.equal(preview.bundle.workOrder.id, "wo_001");
    assert.equal(preview.bundle.reviewSession.workOrderId, "wo_001");
    assert.equal(preview.bundle.autonomyEnvelope.workOrderId, "wo_001");
    assert.equal(preview.bundle.review, undefined, "preview must not include a review");
    assert.equal(preview.bundle.status, "preview");
    assert.equal(preview.bundle.reviewSession.status, "previewed");
  });

  await t.test("preview validates as a valid Governance Bundle", () => {
    const preview = buildJorisGovernanceBundlePreview(validInput());
    assert.equal(
      preview.validation.valid,
      true,
      JSON.stringify(preview.validation.issues),
    );
  });

  await t.test("preview returns humanOnTheLoop true and noExecutionAuthorized true", () => {
    const preview = buildJorisGovernanceBundlePreview(validInput());
    assert.equal(preview.humanOnTheLoop, true);
    assert.equal(preview.noExecutionAuthorized, true);
    assert.equal(preview.bundle.humanOnTheLoop, true);
    assert.equal(preview.bundle.noExecutionAuthorized, true);
    assert.equal(preview.bundle.reviewSession.humanOnTheLoop, true);
    assert.equal(preview.bundle.reviewSession.noExecutionAuthorized, true);
    assert.equal(preview.bundle.autonomyEnvelope.humanOnTheLoop, true);
    assert.equal(preview.bundle.autonomyEnvelope.noExecutionAuthorized, true);
  });

  await t.test("preview wires autonomyEnvelopeId on the session", () => {
    const preview = buildJorisGovernanceBundlePreview(validInput());
    assert.equal(
      preview.bundle.reviewSession.autonomyEnvelopeId,
      preview.bundle.autonomyEnvelope.id,
      "session must reference the envelope it was built with",
    );
  });

  // ---------------------------------------------------------------------------
  // Envelope agent resolution
  // ---------------------------------------------------------------------------

  await t.test("envelope.agentId matches assignedAgentId for mission work order", () => {
    const wo = validMissionWorkOrder({ ownerAgentId: "owner_a", assignedAgentId: "worker_b" });
    const preview = buildJorisGovernanceBundlePreview(validInput({ workOrder: wo }));
    assert.equal(preview.bundle.autonomyEnvelope.agentId, "worker_b");
    assert.equal(preview.validation.valid, true, JSON.stringify(preview.validation.issues));
  });

  await t.test("envelope.agentId matches ownerAgentId for venture work order", () => {
    const wo = validVentureWorkOrder({ ownerAgentId: "revenue-operator" });
    const preview = buildJorisGovernanceBundlePreview(validInput({ workOrder: wo }));
    assert.equal(preview.bundle.autonomyEnvelope.agentId, "revenue-operator");
    assert.equal(preview.validation.valid, true, JSON.stringify(preview.validation.issues));
  });

  // ---------------------------------------------------------------------------
  // Risk level derivation
  // ---------------------------------------------------------------------------

  await t.test("low-risk mission derives autonomous_dry_run autonomy level", () => {
    const wo = validMissionWorkOrder({ riskLevel: "low" });
    const preview = buildJorisGovernanceBundlePreview(validInput({ workOrder: wo }));
    assert.equal(preview.bundle.autonomyEnvelope.autonomyLevel, "autonomous_dry_run");
  });

  await t.test("high-risk mission derives supervised autonomy level", () => {
    // High risk must have approval gates per WorkOrder contract
    const wo = validMissionWorkOrder({
      riskLevel: "high",
      approvalGates: ["deployment"],
    });
    const preview = buildJorisGovernanceBundlePreview(validInput({ workOrder: wo }));
    assert.equal(preview.bundle.autonomyEnvelope.autonomyLevel, "supervised");
  });

  // ---------------------------------------------------------------------------
  // Reviewer defaults
  // ---------------------------------------------------------------------------

  await t.test("reviewerRole defaults to ceo when not provided", () => {
    const input = { workOrder: validMissionWorkOrder(), reviewerId: "michael" };
    const preview = buildJorisGovernanceBundlePreview(input);
    assert.equal(preview.bundle.reviewSession.reviewerRole, "ceo");
  });

  await t.test("reviewerRole override is respected", () => {
    const preview = buildJorisGovernanceBundlePreview(
      validInput({ reviewerRole: "workflow_owner" }),
    );
    assert.equal(preview.bundle.reviewSession.reviewerRole, "workflow_owner");
  });

  // ---------------------------------------------------------------------------
  // Read-only / no mutation proofs
  // ---------------------------------------------------------------------------

  await t.test("helper does not mutate input", () => {
    const input = validInput();
    const snapshot = JSON.stringify(input);
    buildJorisGovernanceBundlePreview(input);
    assert.equal(JSON.stringify(input), snapshot, "input must be unchanged");
  });

  await t.test("helper does not mutate input workOrder", () => {
    const wo = validMissionWorkOrder({ status: "draft" });
    const snapshot = JSON.stringify(wo);
    buildJorisGovernanceBundlePreview({
      workOrder: wo,
      reviewerId: "michael",
    });
    assert.equal(JSON.stringify(wo), snapshot, "workOrder must be unchanged");
    assert.equal(wo.status, "draft", "workOrder.status must not be mutated to approved");
  });

  await t.test("preview does not promote workOrder.status to approved or in_progress", () => {
    const wo = validMissionWorkOrder({ status: "draft" });
    const preview = buildJorisGovernanceBundlePreview({
      workOrder: wo,
      reviewerId: "michael",
    });
    assert.notEqual(preview.bundle.workOrder.status, "approved");
    assert.notEqual(preview.bundle.workOrder.status, "in_progress");
    assert.equal(preview.bundle.workOrder.status, "draft");
  });

  // ---------------------------------------------------------------------------
  // Forbidden execution fields are caught
  // ---------------------------------------------------------------------------

  await t.test("forbidden field in workOrder is caught by validation", () => {
    const wo = validMissionWorkOrder();
    wo.metadata = { deployNow: true };
    const preview = buildJorisGovernanceBundlePreview(validInput({ workOrder: wo }));
    assert.equal(preview.validation.valid, false);
    assert.ok(
      preview.validation.issues.some((i) => i.code.includes("forbidden_execution_field")),
    );
  });

  await t.test("inputContainsForbiddenExecutionFields detects nested forbidden fields", () => {
    const input = validInput();
    input.workOrder = {
      ...input.workOrder,
      metadata: { runtimeDispatch: true },
    };
    assert.equal(inputContainsForbiddenExecutionFields(input), true);
  });

  await t.test("inputContainsForbiddenExecutionFields returns false for clean input", () => {
    assert.equal(inputContainsForbiddenExecutionFields(validInput()), false);
  });

  // ---------------------------------------------------------------------------
  // Message content
  // ---------------------------------------------------------------------------

  await t.test("preview message includes Human-on-the-Loop wording", () => {
    const preview = buildJorisGovernanceBundlePreview(validInput());
    assert.ok(
      preview.message.includes("Human-on-the-Loop"),
      "preview message must include Human-on-the-Loop",
    );
  });

  await t.test("preview message includes Aucune action no-execution wording", () => {
    const preview = buildJorisGovernanceBundlePreview(validInput());
    assert.ok(
      preview.message.includes("Aucune action"),
      "preview message must include Aucune action",
    );
  });

  await t.test("preview message includes approve_to_plan planning-only note", () => {
    const preview = buildJorisGovernanceBundlePreview(validInput());
    assert.ok(
      preview.message.includes("approve_to_plan") && preview.message.includes("planning"),
      "preview message must reference approve_to_plan as planning only",
    );
  });

  await t.test("preview message reports validation status", () => {
    const preview = buildJorisGovernanceBundlePreview(validInput());
    assert.ok(
      preview.message.includes("Intégrité du bundle"),
      "preview message must report bundle integrity",
    );
    assert.ok(
      preview.message.includes("validée") || preview.message.includes("✅"),
      "valid preview must show success marker",
    );
  });

  await t.test("preview message shows invalid status for bundles with errors", () => {
    const wo = validMissionWorkOrder();
    wo.metadata = { executeNow: true };
    const preview = buildJorisGovernanceBundlePreview(validInput({ workOrder: wo }));
    assert.ok(
      preview.message.includes("⚠️") || preview.message.includes("erreur"),
      "invalid preview must surface error indicator",
    );
  });

  // ---------------------------------------------------------------------------
  // Formatter as a standalone function
  // ---------------------------------------------------------------------------

  await t.test("formatJorisGovernanceBundlePreview is pure on bundle + validation", () => {
    const preview = buildJorisGovernanceBundlePreview(validInput());
    const snapshot = JSON.stringify({
      bundle: preview.bundle,
      validation: preview.validation,
    });
    formatJorisGovernanceBundlePreview(preview.bundle, preview.validation);
    assert.equal(
      JSON.stringify({ bundle: preview.bundle, validation: preview.validation }),
      snapshot,
      "formatter must not mutate inputs",
    );
  });

  await t.test("formatter output is deterministic for identical inputs", () => {
    const input = validInput();
    const preview1 = buildJorisGovernanceBundlePreview(input);
    const out1 = formatJorisGovernanceBundlePreview(preview1.bundle, preview1.validation);
    const out2 = formatJorisGovernanceBundlePreview(preview1.bundle, preview1.validation);
    assert.equal(out1, out2);
  });

  // ---------------------------------------------------------------------------
  // Cross-artifact consistency emerges naturally
  // ---------------------------------------------------------------------------

  await t.test("preview bundle passes all PR124 cross-artifact checks", () => {
    const preview = buildJorisGovernanceBundlePreview(validInput());
    // All workOrderIds must agree
    const wid = preview.bundle.workOrder.id;
    assert.equal(preview.bundle.autonomyEnvelope.workOrderId, wid);
    assert.equal(preview.bundle.reviewSession.workOrderId, wid);
    // Session points at the envelope
    assert.equal(
      preview.bundle.reviewSession.autonomyEnvelopeId,
      preview.bundle.autonomyEnvelope.id,
    );
    // Envelope agent matches the work order owner or assigned
    const wo = preview.bundle.workOrder;
    const env = preview.bundle.autonomyEnvelope;
    const validAgent =
      env.agentId === wo.ownerAgentId ||
      (wo.type === "mission" && env.agentId === wo.assignedAgentId);
    assert.ok(validAgent, "envelope agent must match owner or assigned agent");
    // Validation passes
    assert.equal(preview.validation.valid, true, JSON.stringify(preview.validation.issues));
  });
});
