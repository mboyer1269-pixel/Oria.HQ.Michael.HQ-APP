#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("Work Order Contract tests", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(path.join(__dirname, "work-order-contract.ts"));

  const {
    validateMissionWorkOrder,
    validateVentureWorkOrder,
    validateWorkOrder,
    validateWorkOrderBoosterRequests,
    hasLiveExecutionFields,
  } = mod;

  // ----- Shared helpers for building valid fixtures -----

  function validMissionWorkOrder() {
    return {
      id: "wo-m-001",
      type: "mission",
      title: "Analyse Q3 revenue",
      ownerAgentId: "agent-analyst-01",
      assignedAgentId: "agent-analyst-01",
      objective: "Produce a revenue analysis for Q3 2026",
      expectedOutput: { description: "Revenue analysis report", outputType: "report" },
      boostersRequested: [],
      riskLevel: "low",
      approvalGates: [],
      successMetric: { description: "Report delivered and accepted", target: 1, unit: "count" },
      nextAction: { description: "Draft the report outline", actor: "agent-analyst-01" },
      businessValue: { valueType: "learning", confidence: "medium" },
      status: "draft",
      createdByType: "human",
      createdById: "michael",
      createdAt: "2026-05-28T00:00:00Z",
    };
  }

  function validVentureWorkOrder() {
    return {
      id: "wo-v-001",
      type: "venture",
      title: "Launch micro-SaaS analytics tool",
      ownerAgentId: "agent-builder-01",
      businessIdea: "Build a lightweight analytics dashboard for indie creators",
      revenueModel: "Freemium with $9/mo premium tier",
      profitTarget: 5000,
      validationTest: {
        description: "Run a 2-week beta with 50 users",
        evaluationMethod: "Track activation rate and NPS score",
      },
      expectedOutput: { description: "Working MVP with landing page", outputType: "code" },
      boostersRequested: [
        {
          boosterType: "model",
          reason: "Code generation assistance",
          expectedOutput: "Generated boilerplate code",
          modelTier: "standard",
          costTier: "medium",
        },
      ],
      budgetRequested: { amount: 200, currency: "EUR", justification: "Hosting and domain" },
      approvalGates: ["money"],
      promotionOpportunity: {
        targetLevel: 3,
        criteria: "Achieve 100 paying users within 90 days",
        originalOryaEligible: false,
      },
      successMetric: { description: "Reach 100 paying users in 90 days" },
      nextAction: { description: "Create project scaffold", actor: "agent-builder-01" },
      businessValue: { valueType: "revenue", expectedValue: 5000, currency: "EUR", confidence: "medium" },
      status: "draft",
      createdByType: "agent",
      createdById: "agent-builder-01",
      requestedById: "michael",
      createdAt: "2026-05-28T00:00:00Z",
    };
  }

  // ================================================================
  // 1. Valid MissionWorkOrder passes
  // ================================================================
  await t.test("valid MissionWorkOrder passes validation", () => {
    const result = validateMissionWorkOrder(validMissionWorkOrder());
    assert.equal(result.valid, true, `Expected valid but got issues: ${JSON.stringify(result.issues)}`);
    assert.equal(result.issues.length, 0);
  });

  // ================================================================
  // 2. Valid VentureWorkOrder passes
  // ================================================================
  await t.test("valid VentureWorkOrder passes validation", () => {
    const result = validateVentureWorkOrder(validVentureWorkOrder());
    assert.equal(result.valid, true, `Expected valid but got issues: ${JSON.stringify(result.issues)}`);
    assert.equal(result.issues.length, 0);
  });

  // ================================================================
  // 3. Mission missing expectedOutput is blocked
  // ================================================================
  await t.test("mission missing expectedOutput is blocked", () => {
    const wo = validMissionWorkOrder();
    delete wo.expectedOutput;
    const result = validateMissionWorkOrder(wo);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "missing_expected_output"));
  });

  // ================================================================
  // 4. Mission missing nextAction is blocked
  // ================================================================
  await t.test("mission missing nextAction is blocked", () => {
    const wo = validMissionWorkOrder();
    delete wo.nextAction;
    const result = validateMissionWorkOrder(wo);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "missing_next_action"));
  });

  // ================================================================
  // 5. Venture missing profitTarget is blocked
  // ================================================================
  await t.test("venture missing profitTarget is blocked", () => {
    const wo = validVentureWorkOrder();
    delete wo.profitTarget;
    const result = validateVentureWorkOrder(wo);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "missing_profit_target"));
  });

  // ================================================================
  // 6. Venture missing validationTest is blocked
  // ================================================================
  await t.test("venture missing validationTest is blocked", () => {
    const wo = validVentureWorkOrder();
    delete wo.validationTest;
    const result = validateVentureWorkOrder(wo);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "missing_validation_test"));
  });

  // ================================================================
  // 7. Venture missing revenueModel is blocked
  // ================================================================
  await t.test("venture missing revenueModel is blocked", () => {
    const wo = validVentureWorkOrder();
    delete wo.revenueModel;
    const result = validateVentureWorkOrder(wo);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "missing_revenue_model"));
  });

  // ================================================================
  // 8. High-risk work order without approval gates is blocked
  // ================================================================
  await t.test("high-risk work order without approval gates is blocked", () => {
    const wo = validMissionWorkOrder();
    wo.riskLevel = "high";
    wo.approvalGates = [];
    const result = validateMissionWorkOrder(wo);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "risky_work_order_requires_approval"));
  });

  await t.test("critical-risk work order without approval gates is blocked", () => {
    const wo = validMissionWorkOrder();
    wo.riskLevel = "critical";
    wo.approvalGates = [];
    const result = validateMissionWorkOrder(wo);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "risky_work_order_requires_approval"));
  });

  await t.test("high-risk work order with approval gates passes", () => {
    const wo = validMissionWorkOrder();
    wo.riskLevel = "high";
    wo.approvalGates = ["money"];
    const result = validateMissionWorkOrder(wo);
    assert.equal(result.valid, true);
  });

  // ================================================================
  // 9. Booster request missing expectedOutput/modelTier/costTier is blocked
  // ================================================================
  await t.test("booster request missing expectedOutput is blocked", () => {
    const issues = validateWorkOrderBoosterRequests([
      { boosterType: "model", reason: "Needed", modelTier: "standard", costTier: "low" },
    ]);
    assert.ok(issues.some((i) => i.code === "invalid_booster_request" && i.message.includes("expectedOutput")));
  });

  await t.test("booster request missing modelTier is blocked", () => {
    const issues = validateWorkOrderBoosterRequests([
      { boosterType: "model", reason: "Needed", expectedOutput: "Output", costTier: "low" },
    ]);
    assert.ok(issues.some((i) => i.code === "invalid_booster_request" && i.message.includes("modelTier")));
  });

  await t.test("booster request missing costTier is blocked", () => {
    const issues = validateWorkOrderBoosterRequests([
      { boosterType: "model", reason: "Needed", expectedOutput: "Output", modelTier: "standard" },
    ]);
    assert.ok(issues.some((i) => i.code === "invalid_booster_request" && i.message.includes("costTier")));
  });

  await t.test("booster request missing both boosterId and boosterType is blocked", () => {
    const issues = validateWorkOrderBoosterRequests([
      { reason: "Needed", expectedOutput: "Output", modelTier: "standard", costTier: "low" },
    ]);
    assert.ok(issues.some((i) => i.code === "invalid_booster_request" && i.message.includes("boosterId or boosterType")));
  });

  // ================================================================
  // 10. Live/runtime execution fields are forbidden
  // ================================================================
  await t.test("hasLiveExecutionFields detects forbidden fields", () => {
    assert.equal(hasLiveExecutionFields({ executeNow: true }), true);
    assert.equal(hasLiveExecutionFields({ liveMode: true }), true);
    assert.equal(hasLiveExecutionFields({ runtimeDispatch: true }), true);
    assert.equal(hasLiveExecutionFields({ externalWrite: true }), true);
    assert.equal(hasLiveExecutionFields({ publishNow: true }), true);
    assert.equal(hasLiveExecutionFields({ sendNow: true }), true);
    assert.equal(hasLiveExecutionFields({ deployNow: true }), true);
    assert.equal(hasLiveExecutionFields({}), false);
    assert.equal(hasLiveExecutionFields({ title: "ok" }), false);
  });

  await t.test("mission with live execution field is blocked", () => {
    const wo = { ...validMissionWorkOrder(), executeNow: true };
    const result = validateMissionWorkOrder(wo);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "live_execution_field_forbidden"));
  });

  await t.test("venture with live execution field is blocked", () => {
    const wo = { ...validVentureWorkOrder(), deployNow: true };
    const result = validateVentureWorkOrder(wo);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "live_execution_field_forbidden"));
  });

  // ================================================================
  // 11. Promotion opportunity must include criteria
  // ================================================================
  await t.test("promotion opportunity without criteria is blocked", () => {
    const wo = validVentureWorkOrder();
    wo.promotionOpportunity = { targetLevel: 3, criteria: "", originalOryaEligible: false };
    const result = validateVentureWorkOrder(wo);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "invalid_promotion_opportunity"));
  });

  await t.test("promotion opportunity without targetLevel is blocked", () => {
    const wo = validVentureWorkOrder();
    wo.promotionOpportunity = { criteria: "Something", originalOryaEligible: false };
    const result = validateVentureWorkOrder(wo);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "invalid_promotion_opportunity"));
  });

  await t.test("originalOryaEligible is not automatically true", () => {
    const wo = validVentureWorkOrder();
    assert.equal(wo.promotionOpportunity.originalOryaEligible, false);
  });

  // ================================================================
  // 12. validateWorkOrder dispatches correctly by type
  // ================================================================
  await t.test("validateWorkOrder dispatches mission type correctly", () => {
    const result = validateWorkOrder(validMissionWorkOrder());
    assert.equal(result.valid, true);
  });

  await t.test("validateWorkOrder dispatches venture type correctly", () => {
    const result = validateWorkOrder(validVentureWorkOrder());
    assert.equal(result.valid, true);
  });

  await t.test("validateWorkOrder dispatches venture and catches missing fields", () => {
    const wo = validVentureWorkOrder();
    delete wo.profitTarget;
    const result = validateWorkOrder(wo);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "missing_profit_target"));
  });

  // ================================================================
  // 13. Invalid/unknown type is blocked
  // ================================================================
  await t.test("unknown type is blocked", () => {
    const result = validateWorkOrder({ type: "unknown_type" });
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "invalid_type"));
  });

  await t.test("missing type is blocked", () => {
    const result = validateWorkOrder({ id: "wo-1" });
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "invalid_type"));
  });

  // ================================================================
  // 14. Helpers do not mutate the input object
  // ================================================================
  await t.test("validateMissionWorkOrder does not mutate input", () => {
    const wo = validMissionWorkOrder();
    const snapshot = JSON.stringify(wo);
    validateMissionWorkOrder(wo);
    assert.equal(JSON.stringify(wo), snapshot);
  });

  await t.test("validateVentureWorkOrder does not mutate input", () => {
    const wo = validVentureWorkOrder();
    const snapshot = JSON.stringify(wo);
    validateVentureWorkOrder(wo);
    assert.equal(JSON.stringify(wo), snapshot);
  });

  await t.test("validateWorkOrder does not mutate input", () => {
    const wo = validMissionWorkOrder();
    const snapshot = JSON.stringify(wo);
    validateWorkOrder(wo);
    assert.equal(JSON.stringify(wo), snapshot);
  });

  await t.test("hasLiveExecutionFields does not mutate input", () => {
    const obj = { executeNow: true, title: "test" };
    const snapshot = JSON.stringify(obj);
    hasLiveExecutionFields(obj);
    assert.equal(JSON.stringify(obj), snapshot);
  });

  // ================================================================
  // 15. Missing createdById is blocked
  // ================================================================
  await t.test("mission missing createdById is blocked", () => {
    const wo = validMissionWorkOrder();
    delete wo.createdById;
    const result = validateMissionWorkOrder(wo);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "missing_created_by_id"));
  });

  await t.test("venture missing createdById is blocked", () => {
    const wo = validVentureWorkOrder();
    delete wo.createdById;
    const result = validateVentureWorkOrder(wo);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "missing_created_by_id"));
  });

  await t.test("mission missing createdByType is blocked", () => {
    const wo = validMissionWorkOrder();
    delete wo.createdByType;
    const result = validateMissionWorkOrder(wo);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "missing_created_by_type"));
  });

  // ================================================================
  // 16. Missing ownerAgentId is blocked
  // ================================================================
  await t.test("mission missing ownerAgentId is blocked", () => {
    const wo = validMissionWorkOrder();
    delete wo.ownerAgentId;
    const result = validateMissionWorkOrder(wo);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "missing_owner_agent"));
  });

  await t.test("venture missing ownerAgentId is blocked", () => {
    const wo = validVentureWorkOrder();
    delete wo.ownerAgentId;
    const result = validateVentureWorkOrder(wo);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "missing_owner_agent"));
  });

  // ================================================================
  // 17. businessValue must be structured (not a loose string)
  // ================================================================
  await t.test("mission with string businessValue is blocked", () => {
    const wo = validMissionWorkOrder();
    wo.businessValue = "just a string";
    const result = validateMissionWorkOrder(wo);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "invalid_business_value"));
  });

  await t.test("mission with missing businessValue is blocked", () => {
    const wo = validMissionWorkOrder();
    delete wo.businessValue;
    const result = validateMissionWorkOrder(wo);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "invalid_business_value"));
  });

  await t.test("venture with string businessValue is blocked", () => {
    const wo = validVentureWorkOrder();
    wo.businessValue = "loose string";
    const result = validateVentureWorkOrder(wo);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "invalid_business_value"));
  });

  await t.test("businessValue object without valueType is blocked", () => {
    const wo = validMissionWorkOrder();
    wo.businessValue = { confidence: "high" };
    const result = validateMissionWorkOrder(wo);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "invalid_business_value"));
  });

  // ================================================================
  // 18. Revenue VentureWorkOrder without profitTarget is blocked
  // ================================================================
  await t.test("revenue venture without profitTarget is blocked", () => {
    const wo = validVentureWorkOrder();
    wo.businessValue = { valueType: "revenue", confidence: "high" };
    delete wo.profitTarget;
    const result = validateVentureWorkOrder(wo);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "missing_profit_target"));
  });

  await t.test("revenue venture without validationTest is blocked", () => {
    const wo = validVentureWorkOrder();
    wo.businessValue = { valueType: "revenue", confidence: "high" };
    delete wo.validationTest;
    const result = validateVentureWorkOrder(wo);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "missing_validation_test"));
  });

  // ================================================================
  // 19. Helpers do not mutate work orders with new fields
  // ================================================================
  await t.test("validateMissionWorkOrder does not mutate input (with provenance + businessValue)", () => {
    const wo = validMissionWorkOrder();
    const snapshot = JSON.stringify(wo);
    validateMissionWorkOrder(wo);
    assert.equal(JSON.stringify(wo), snapshot);
  });

  await t.test("validateVentureWorkOrder does not mutate input (with provenance + businessValue)", () => {
    const wo = validVentureWorkOrder();
    const snapshot = JSON.stringify(wo);
    validateVentureWorkOrder(wo);
    assert.equal(JSON.stringify(wo), snapshot);
  });
});
