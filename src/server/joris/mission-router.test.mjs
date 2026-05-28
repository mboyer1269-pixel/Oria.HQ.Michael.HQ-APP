#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("Mission Router tests", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const routerMod = await jiti.import(path.join(__dirname, "mission-router.ts"));
  const contractMod = await jiti.import(path.join(__dirname, "..", "agents", "work-order-contract.ts"));

  const { routeMissionRequest } = routerMod;
  const { hasLiveExecutionFields } = contractMod;

  await t.test("unknown/ambiguous input returns safe fallback", () => {
    const result = routeMissionRequest("Hello Joris", "user_123");
    
    assert.equal(result.workOrder.type, "mission");
    assert.equal(result.workOrder.ownerAgentId, "joris");
    assert.equal(result.workOrder.riskLevel, "low");
    assert.deepEqual(result.workOrder.approvalGates, []);
    assert.equal(result.validation.valid, true);
    assert.ok(result.humanOnTheLoopSummary.includes("générique"));
    assert.equal(hasLiveExecutionFields(result.workOrder), false);
  });

  await t.test("business opportunity request routes to VentureWorkOrder", () => {
    const result = routeMissionRequest("We should launch a new SaaS for revenue", "user_123");
    
    assert.equal(result.workOrder.type, "venture");
    assert.equal(result.workOrder.ownerAgentId, "revenue-operator");
    assert.equal(result.workOrder.riskLevel, "high");
    assert.ok(result.workOrder.approvalGates.includes("money"));
    assert.ok(result.workOrder.approvalGates.includes("publishing"));
    assert.ok(result.workOrder.approvalGates.includes("deployment"));
    
    if (result.workOrder.type === "venture") {
      assert.equal(result.workOrder.businessValue.valueType, "revenue");
      assert.ok(result.workOrder.profitTarget);
      assert.ok(result.workOrder.validationTest);
    } else {
      assert.fail("Expected venture work order");
    }

    assert.equal(result.validation.valid, true);
    assert.equal(hasLiveExecutionFields(result.workOrder), false);
  });

  await t.test("research request routes to MissionWorkOrder for Innovation Scout", () => {
    const result = routeMissionRequest("Can you analyze the current market trends?", "user_123");
    
    assert.equal(result.workOrder.type, "mission");
    assert.equal(result.workOrder.ownerAgentId, "innovation-scout");
    assert.equal(result.workOrder.riskLevel, "low");
    assert.equal(result.validation.valid, true);
    assert.ok(result.humanOnTheLoopSummary.includes("analyse"));
    assert.equal(hasLiveExecutionFields(result.workOrder), false);
  });

  await t.test("code request routes to MissionWorkOrder for Product Builder with high risk", () => {
    const result = routeMissionRequest("We need to build and deploy the new dashboard", "user_123");
    
    assert.equal(result.workOrder.type, "mission");
    assert.equal(result.workOrder.ownerAgentId, "product-builder");
    assert.equal(result.workOrder.riskLevel, "high");
    assert.ok(result.workOrder.approvalGates.includes("deployment"));
    assert.ok(result.workOrder.approvalGates.includes("live_runtime"));
    assert.equal(result.validation.valid, true);
    assert.equal(hasLiveExecutionFields(result.workOrder), false);
  });

  await t.test("multiple keyword overlap prioritizes venture", () => {
    const result = routeMissionRequest("Analyze the market to find new revenue streams", "user_123");
    assert.equal(result.workOrder.type, "venture");
    assert.equal(result.workOrder.ownerAgentId, "revenue-operator");
    assert.equal(result.validation.valid, true);
  });

  await t.test("does not mutate input", () => {
    const input = "research something";
    const result = routeMissionRequest(input, "user_123");
    
    assert.equal(input, "research something");
    assert.equal(result.validation.valid, true);
  });
});
