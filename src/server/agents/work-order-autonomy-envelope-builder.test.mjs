import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("Work Order Autonomy Envelope Builder tests", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const builderMod = await jiti.import(path.join(__dirname, "work-order-autonomy-envelope-builder.ts"));
  const contractMod = await jiti.import(path.join(__dirname, "work-order-autonomy-envelope-contract.ts"));

  const { buildDefaultAutonomyEnvelope } = builderMod;
  const { validateWorkOrderAutonomyEnvelope, hasForbiddenAutonomyFields } = contractMod;

  function createMockInput(overrides) {
    return {
      workOrderId: "wo_test_123",
      agentId: "test_agent",
      ...overrides,
    };
  }

  await t.test("builds valid default envelope", () => {
    const input = createMockInput();
    const envelope = buildDefaultAutonomyEnvelope(input);
    
    assert.equal(typeof envelope.id, "string");
    assert.equal(envelope.workOrderId, "wo_test_123");
    assert.equal(envelope.agentId, "test_agent");
    
    const validation = validateWorkOrderAutonomyEnvelope(envelope);
    assert.equal(validation.valid, true, "Generated envelope should be valid");
  });

  await t.test("low risk derives autonomous_dry_run", () => {
    const input = createMockInput({ riskLevel: "low" });
    const envelope = buildDefaultAutonomyEnvelope(input);
    assert.equal(envelope.autonomyLevel, "autonomous_dry_run");
  });

  await t.test("medium risk derives delegated", () => {
    const input = createMockInput({ riskLevel: "medium" });
    const envelope = buildDefaultAutonomyEnvelope(input);
    assert.equal(envelope.autonomyLevel, "delegated");
  });

  await t.test("high risk derives supervised", () => {
    const input = createMockInput({ riskLevel: "high" });
    const envelope = buildDefaultAutonomyEnvelope(input);
    assert.equal(envelope.autonomyLevel, "supervised");
  });

  await t.test("critical risk derives supervised", () => {
    const input = createMockInput({ riskLevel: "critical" });
    const envelope = buildDefaultAutonomyEnvelope(input);
    assert.equal(envelope.autonomyLevel, "supervised");
  });

  await t.test("safe internal actions are allowed", () => {
    const input = createMockInput();
    const envelope = buildDefaultAutonomyEnvelope(input);
    const allowed = envelope.allowedAutonomousActions;
    assert.ok(allowed.includes("research"));
    assert.ok(allowed.includes("analyze"));
    assert.ok(allowed.includes("score"));
    assert.ok(allowed.includes("summarize"));
    assert.ok(allowed.includes("draft"));
    assert.ok(allowed.includes("compare"));
    assert.ok(allowed.includes("estimate_roi"));
    assert.ok(allowed.includes("prepare_options"));
    assert.ok(allowed.includes("create_internal_plan"));
    assert.ok(allowed.includes("generate_internal_asset"));
  });

  await t.test("publish requires approval", () => {
    const input = createMockInput();
    const envelope = buildDefaultAutonomyEnvelope(input);
    assert.ok(envelope.approvalRequiredActions.includes("publish"));
  });

  await t.test("spend_money requires approval", () => {
    const input = createMockInput();
    const envelope = buildDefaultAutonomyEnvelope(input);
    assert.ok(envelope.approvalRequiredActions.includes("spend_money"));
  });

  await t.test("deploy requires approval", () => {
    const input = createMockInput();
    const envelope = buildDefaultAutonomyEnvelope(input);
    assert.ok(envelope.approvalRequiredActions.includes("deploy"));
  });

  await t.test("schedule_calendar_event requires approval", () => {
    const input = createMockInput();
    const envelope = buildDefaultAutonomyEnvelope(input);
    assert.ok(envelope.approvalRequiredActions.includes("schedule_calendar_event"));
  });

  await t.test("runtime_dispatch is blocked", () => {
    const input = createMockInput();
    const envelope = buildDefaultAutonomyEnvelope(input);
    assert.ok(envelope.blockedActions.includes("runtime_dispatch"));
  });

  await t.test("live_execution is blocked", () => {
    const input = createMockInput();
    const envelope = buildDefaultAutonomyEnvelope(input);
    assert.ok(envelope.blockedActions.includes("live_execution"));
  });

  await t.test("hardcode_secret is blocked", () => {
    const input = createMockInput();
    const envelope = buildDefaultAutonomyEnvelope(input);
    assert.ok(envelope.blockedActions.includes("hardcode_secret"));
  });

  await t.test("modify_rls is blocked", () => {
    const input = createMockInput();
    const envelope = buildDefaultAutonomyEnvelope(input);
    assert.ok(envelope.blockedActions.includes("modify_rls"));
  });

  await t.test("requested budget creates budgetLimit/escalation trigger", () => {
    const input = createMockInput({ requestedBudget: 500 });
    const envelope = buildDefaultAutonomyEnvelope(input);
    assert.equal(envelope.budgetLimit, 500);
    assert.ok(envelope.escalationTriggers.some(t => t.condition === "budget_limit_reached"));
  });

  await t.test("high risk creates escalation trigger", () => {
    const input = createMockInput({ riskLevel: "high" });
    const envelope = buildDefaultAutonomyEnvelope(input);
    assert.ok(envelope.escalationTriggers.some(t => t.condition === "high_risk_operation"));
  });

  await t.test("generated envelope validates with validateWorkOrderAutonomyEnvelope", () => {
    const input = createMockInput({ requestedBudget: 1000, riskLevel: "medium" });
    const envelope = buildDefaultAutonomyEnvelope(input);
    const validation = validateWorkOrderAutonomyEnvelope(envelope);
    assert.equal(validation.valid, true);
    assert.equal(validation.issues.length, 0);
  });

  await t.test("builder does not mutate input", () => {
    const input = createMockInput({ requestedBudget: 50, riskLevel: "critical" });
    const snapshot = JSON.stringify(input);
    buildDefaultAutonomyEnvelope(input);
    assert.equal(JSON.stringify(input), snapshot);
  });

  await t.test("no live execution fields are introduced", () => {
    const input = createMockInput();
    const envelope = buildDefaultAutonomyEnvelope(input);
    assert.equal(hasForbiddenAutonomyFields(envelope), false);
  });

  await t.test("noExecutionAuthorized remains true", () => {
    const input = createMockInput();
    const envelope = buildDefaultAutonomyEnvelope(input);
    assert.equal(envelope.noExecutionAuthorized, true);
  });

  await t.test("humanOnTheLoop remains true", () => {
    const input = createMockInput();
    const envelope = buildDefaultAutonomyEnvelope(input);
    assert.equal(envelope.humanOnTheLoop, true);
  });
});
