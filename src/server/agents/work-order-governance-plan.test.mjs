// src/server/agents/work-order-governance-plan.test.mjs

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("Work Order Governance Plan tests", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(path.join(__dirname, "work-order-governance-plan.ts"));
  const {
    isBundleApprovedToPlan,
    buildWorkOrderGovernancePlan,
    validateWorkOrderGovernancePlan,
    formatWorkOrderGovernancePlan,
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
      id: "wo_plan_001",
      type: "mission",
      title: "Plan Test Mission",
      ownerAgentId: "joris",
      assignedAgentId: "joris",
      objective: "Cartographier le marché des assistants IA",
      expectedOutput: { description: "Rapport de recherche interne", outputType: "report" },
      boostersRequested: [],
      riskLevel: "low",
      approvalGates: [],
      successMetric: { description: "Tests pass" },
      nextAction: { description: "Collecter les sources de données", actor: "joris" },
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

  function approvedBundle(overrides) {
    const application = applyReviewToGovernanceBundle({
      bundle: previewBundle(overrides),
      message: "Approuve pour le plan",
      reviewerId: "michael",
      reviewerRole: "ceo",
      createdAt: "2026-05-29T11:00:00.000Z",
    });
    assert.equal(application.bundle.status, "approved_to_plan");
    return application.bundle;
  }

  // ---------------------------------------------------------------------------
  // isBundleApprovedToPlan
  // ---------------------------------------------------------------------------

  await t.test("isBundleApprovedToPlan true only for approved bundles", () => {
    assert.equal(isBundleApprovedToPlan(approvedBundle()), true);
    assert.equal(isBundleApprovedToPlan(previewBundle()), false);
  });

  // ---------------------------------------------------------------------------
  // buildWorkOrderGovernancePlan
  // ---------------------------------------------------------------------------

  await t.test("builds a valid plan from an approved bundle", () => {
    const bundle = approvedBundle();
    const plan = buildWorkOrderGovernancePlan({ bundle });

    assert.equal(plan.workOrderId, bundle.workOrder.id);
    assert.equal(plan.bundleId, bundle.id);
    assert.equal(plan.agentId, "joris");
    assert.equal(plan.autonomyLevel, bundle.autonomyEnvelope.autonomyLevel);
    assert.equal(plan.objective, "Cartographier le marché des assistants IA");
    assert.equal(plan.expectedOutput, "Rapport de recherche interne");
    assert.equal(plan.humanOnTheLoop, true);
    assert.equal(plan.noExecutionAuthorized, true);
    assert.ok(plan.steps.length >= 2);
    assert.equal(validateWorkOrderGovernancePlan(plan).valid, true);
  });

  await t.test("first step is the Work Order next action", () => {
    const plan = buildWorkOrderGovernancePlan({ bundle: approvedBundle() });
    assert.equal(plan.steps[0].order, 1);
    assert.equal(plan.steps[0].description, "Collecter les sources de données");
    assert.equal(plan.steps[0].kind, "autonomous_internal");
  });

  await t.test("every plan step is internal/no-execution", () => {
    const plan = buildWorkOrderGovernancePlan({ bundle: approvedBundle() });
    assert.ok(plan.steps.every((s) => s.kind === "autonomous_internal"));
  });

  await t.test("includes one step per allowed autonomous action plus a deliverable step", () => {
    const bundle = approvedBundle();
    const plan = buildWorkOrderGovernancePlan({ bundle });
    const allowedCount = bundle.autonomyEnvelope.allowedAutonomousActions.length;
    // next action + allowed actions + deliverable
    assert.equal(plan.steps.length, 1 + allowedCount + 1);
  });

  await t.test("surfaces approval-required and blocked actions as boundaries, not steps", () => {
    const bundle = approvedBundle();
    const plan = buildWorkOrderGovernancePlan({ bundle });
    assert.ok(plan.approvalRequiredActions.includes("publish"));
    assert.ok(plan.blockedActions.includes("runtime_dispatch"));
    // Boundaries must not appear as plan steps.
    assert.ok(!plan.steps.some((s) => s.description.includes("publish")));
    assert.ok(!plan.steps.some((s) => s.description.includes("runtime_dispatch")));
  });

  await t.test("derives objective from businessIdea for venture work orders", () => {
    const venture = {
      id: "wo_v1",
      type: "venture",
      title: "Venture",
      ownerAgentId: "revenue-operator",
      businessIdea: "Lancer un SaaS de veille IA",
      revenueModel: "SaaS Subscription",
      profitTarget: 1000,
      validationTest: { description: "100 signups", evaluationMethod: "analytics" },
      expectedOutput: { description: "Landing page + pricing", outputType: "product" },
      boostersRequested: [],
      budgetRequested: { amount: 50, currency: "EUR" },
      approvalGates: [],
      promotionOpportunity: { targetLevel: 3, criteria: "Hit target", originalOryaEligible: false },
      successMetric: { description: "Profit" },
      nextAction: { description: "Rédiger la landing", actor: "revenue-operator" },
      businessValue: { valueType: "revenue", expectedValue: 1000, currency: "EUR", confidence: "medium" },
      status: "draft",
      createdByType: "joris",
      createdById: "joris",
      createdAt: "2026-05-29T10:00:00.000Z",
    };
    const bundle = approvedBundle();
    // Re-build a venture-approved bundle.
    const ventureApplication = applyReviewToGovernanceBundle({
      bundle: buildJorisGovernanceBundlePreview({
        workOrder: venture,
        reviewerId: "michael",
        reviewerRole: "ceo",
        createdAt: "2026-05-29T10:00:00.000Z",
      }).bundle,
      message: "Approuve pour le plan",
      reviewerId: "michael",
      reviewerRole: "ceo",
      createdAt: "2026-05-29T11:00:00.000Z",
    });
    assert.equal(ventureApplication.bundle.status, "approved_to_plan");
    const plan = buildWorkOrderGovernancePlan({ bundle: ventureApplication.bundle });
    assert.equal(plan.objective, "Lancer un SaaS de veille IA");
    assert.notEqual(bundle.workOrder.id, plan.workOrderId);
  });

  await t.test("builder does not mutate the bundle", () => {
    const bundle = approvedBundle();
    const snapshot = JSON.stringify(bundle);
    buildWorkOrderGovernancePlan({ bundle });
    assert.equal(JSON.stringify(bundle), snapshot);
  });

  // ---------------------------------------------------------------------------
  // validateWorkOrderGovernancePlan
  // ---------------------------------------------------------------------------

  await t.test("empty steps is rejected", () => {
    const plan = buildWorkOrderGovernancePlan({ bundle: approvedBundle() });
    const result = validateWorkOrderGovernancePlan({ ...plan, steps: [] });
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "empty_plan"));
  });

  await t.test("a non-internal step kind is rejected", () => {
    const plan = buildWorkOrderGovernancePlan({ bundle: approvedBundle() });
    const tampered = {
      ...plan,
      steps: [{ id: "x", order: 1, description: "deploy", actor: "joris", kind: "blocked" }],
    };
    const result = validateWorkOrderGovernancePlan(tampered);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "non_internal_step"));
  });

  await t.test("noExecutionAuthorized false is rejected", () => {
    const plan = buildWorkOrderGovernancePlan({ bundle: approvedBundle() });
    const result = validateWorkOrderGovernancePlan({ ...plan, noExecutionAuthorized: false });
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "no_execution_authorized_required"));
  });

  await t.test("forbidden live-execution field is rejected", () => {
    const plan = buildWorkOrderGovernancePlan({ bundle: approvedBundle() });
    const result = validateWorkOrderGovernancePlan({ ...plan, deployNow: true });
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "forbidden_execution_field"));
  });

  // ---------------------------------------------------------------------------
  // formatWorkOrderGovernancePlan
  // ---------------------------------------------------------------------------

  await t.test("formatted plan carries planning-only and no-execution wording", () => {
    const text = formatWorkOrderGovernancePlan(buildWorkOrderGovernancePlan({ bundle: approvedBundle() }));
    assert.ok(text.includes("Human-on-the-Loop"));
    assert.ok(text.includes("Aucune action exécutée"));
    assert.ok(text.includes("approve_to_plan") && text.includes("planification uniquement"));
    assert.ok(text.includes("Collecter les sources de données"));
  });
});
