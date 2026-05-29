#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("Work Order Autonomy Envelope Contract tests", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(path.join(__dirname, "work-order-autonomy-envelope-contract.ts"));
  const {
    validateWorkOrderAutonomyEnvelope,
    evaluateAutonomyRequest,
    hasForbiddenAutonomyFields,
    createAutonomyEnvelopeSummary,
  } = mod;

  // Helper to build a minimal valid envelope
  function validEnvelope(overrides) {
    return {
      id: "env_001",
      workOrderId: "wo_venture_123",
      agentId: "joris",
      autonomyLevel: "delegated",
      allowedAutonomousActions: ["research", "analyze", "draft"],
      approvalRequiredActions: ["publish", "spend_money", "deploy"],
      blockedActions: ["runtime_dispatch", "live_execution", "bypass_approval"],
      escalationTriggers: [
        { condition: "budget_exceeded", description: "Estimated cost exceeds envelope limit", severity: "critical" },
      ],
      humanOnTheLoop: true,
      noExecutionAuthorized: true,
      createdAt: new Date().toISOString(),
      ...overrides,
    };
  }

  // ========================================================================
  // Happy path — all autonomy levels
  // ========================================================================

  await t.test("valid autonomy envelope passes", () => {
    const envelope = validEnvelope();
    const result = validateWorkOrderAutonomyEnvelope(envelope);

    assert.equal(result.valid, true);
    assert.equal(result.issues.length, 0);
  });

  await t.test("supervised envelope passes", () => {
    const envelope = validEnvelope({ autonomyLevel: "supervised" });
    const result = validateWorkOrderAutonomyEnvelope(envelope);

    assert.equal(result.valid, true);
    assert.equal(result.issues.length, 0);
  });

  await t.test("delegated envelope passes", () => {
    const envelope = validEnvelope({ autonomyLevel: "delegated" });
    const result = validateWorkOrderAutonomyEnvelope(envelope);

    assert.equal(result.valid, true);
    assert.equal(result.issues.length, 0);
  });

  await t.test("autonomous_dry_run envelope passes", () => {
    const envelope = validEnvelope({ autonomyLevel: "autonomous_dry_run" });
    const result = validateWorkOrderAutonomyEnvelope(envelope);

    assert.equal(result.valid, true);
    assert.equal(result.issues.length, 0);
  });

  // ========================================================================
  // Missing required fields
  // ========================================================================

  await t.test("missing id is blocked", () => {
    const envelope = validEnvelope({ id: undefined });
    const result = validateWorkOrderAutonomyEnvelope(envelope);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "missing_id"));
  });

  await t.test("missing workOrderId is blocked", () => {
    const envelope = validEnvelope({ workOrderId: undefined });
    const result = validateWorkOrderAutonomyEnvelope(envelope);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "missing_work_order_id"));
  });

  await t.test("missing agentId is blocked", () => {
    const envelope = validEnvelope({ agentId: undefined });
    const result = validateWorkOrderAutonomyEnvelope(envelope);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "missing_agent_id"));
  });

  await t.test("invalid autonomy level is blocked", () => {
    const envelope = validEnvelope({ autonomyLevel: "fully_autonomous" });
    const result = validateWorkOrderAutonomyEnvelope(envelope);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "invalid_autonomy_level"));
  });

  // ========================================================================
  // Allowed autonomous actions safety
  // ========================================================================

  await t.test("allowed research/analyze/draft passes as autonomous", () => {
    const envelope = validEnvelope({
      allowedAutonomousActions: ["research", "analyze", "draft"],
    });
    const result = validateWorkOrderAutonomyEnvelope(envelope);

    assert.equal(result.valid, true);
    assert.equal(result.issues.length, 0);
  });

  await t.test("publish cannot be allowed autonomous", () => {
    const envelope = validEnvelope({
      allowedAutonomousActions: ["research", "publish"],
    });
    const result = validateWorkOrderAutonomyEnvelope(envelope);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) =>
      i.code === "invalid_allowed_action" || i.code === "unsafe_autonomous_action"
    ));
  });

  await t.test("spend_money cannot be allowed autonomous", () => {
    const envelope = validEnvelope({
      allowedAutonomousActions: ["research", "spend_money"],
    });
    const result = validateWorkOrderAutonomyEnvelope(envelope);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) =>
      i.code === "invalid_allowed_action" || i.code === "unsafe_autonomous_action"
    ));
  });

  await t.test("contact_human cannot be allowed autonomous", () => {
    const envelope = validEnvelope({
      allowedAutonomousActions: ["research", "contact_human"],
    });
    const result = validateWorkOrderAutonomyEnvelope(envelope);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) =>
      i.code === "invalid_allowed_action" || i.code === "unsafe_autonomous_action"
    ));
  });

  await t.test("deploy cannot be allowed autonomous", () => {
    const envelope = validEnvelope({
      allowedAutonomousActions: ["research", "deploy"],
    });
    const result = validateWorkOrderAutonomyEnvelope(envelope);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) =>
      i.code === "invalid_allowed_action" || i.code === "unsafe_autonomous_action"
    ));
  });

  await t.test("modify_database cannot be allowed autonomous", () => {
    const envelope = validEnvelope({
      allowedAutonomousActions: ["research", "modify_database"],
    });
    const result = validateWorkOrderAutonomyEnvelope(envelope);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) =>
      i.code === "invalid_allowed_action" || i.code === "unsafe_autonomous_action"
    ));
  });

  // ========================================================================
  // Blocked actions
  // ========================================================================

  await t.test("runtime_dispatch is blocked", () => {
    const envelope = validEnvelope();
    assert.ok(envelope.blockedActions.includes("runtime_dispatch"));
    const result = validateWorkOrderAutonomyEnvelope(envelope);
    assert.equal(result.valid, true);
  });

  await t.test("live_execution is blocked", () => {
    const envelope = validEnvelope();
    assert.ok(envelope.blockedActions.includes("live_execution"));
    const result = validateWorkOrderAutonomyEnvelope(envelope);
    assert.equal(result.valid, true);
  });

  await t.test("hardcode_secret is always blocked", () => {
    const envelope = validEnvelope({
      blockedActions: ["runtime_dispatch", "live_execution", "bypass_approval", "hardcode_secret"],
    });
    const result = validateWorkOrderAutonomyEnvelope(envelope);
    assert.equal(result.valid, true);
  });

  await t.test("modify_rls is always blocked", () => {
    const envelope = validEnvelope({
      blockedActions: ["runtime_dispatch", "live_execution", "bypass_approval", "modify_rls"],
    });
    const result = validateWorkOrderAutonomyEnvelope(envelope);
    assert.equal(result.valid, true);
  });

  // ========================================================================
  // Evaluation: action decisions
  // ========================================================================

  await t.test("evaluate research returns allowed_autonomous", () => {
    const envelope = validEnvelope();
    const evaluation = evaluateAutonomyRequest(envelope, "research");

    assert.equal(evaluation.decision, "allowed_autonomous");
    assert.equal(evaluation.humanOnTheLoop, true);
    assert.equal(evaluation.noExecutionAuthorized, true);
  });

  await t.test("evaluate publish returns requires_approval", () => {
    const envelope = validEnvelope();
    const evaluation = evaluateAutonomyRequest(envelope, "publish");

    assert.equal(evaluation.decision, "requires_approval");
    assert.equal(evaluation.humanOnTheLoop, true);
    assert.equal(evaluation.noExecutionAuthorized, true);
  });

  await t.test("evaluate spend_money returns requires_approval", () => {
    const envelope = validEnvelope();
    const evaluation = evaluateAutonomyRequest(envelope, "spend_money");

    assert.equal(evaluation.decision, "requires_approval");
    assert.equal(evaluation.humanOnTheLoop, true);
    assert.equal(evaluation.noExecutionAuthorized, true);
  });

  await t.test("evaluate runtime_dispatch returns blocked", () => {
    const envelope = validEnvelope();
    const evaluation = evaluateAutonomyRequest(envelope, "runtime_dispatch");

    assert.equal(evaluation.decision, "blocked");
    assert.equal(evaluation.humanOnTheLoop, true);
    assert.equal(evaluation.noExecutionAuthorized, true);
  });

  await t.test("unknown action returns requires_clarification", () => {
    const envelope = validEnvelope();
    const evaluation = evaluateAutonomyRequest(envelope, "teleport_to_mars");

    assert.equal(evaluation.decision, "requires_clarification");
    assert.equal(evaluation.humanOnTheLoop, true);
    assert.equal(evaluation.noExecutionAuthorized, true);
  });

  await t.test("budget over limit returns escalation_required", () => {
    const envelope = validEnvelope({ budgetLimit: 50 });
    const evaluation = evaluateAutonomyRequest(envelope, "research", { estimatedCost: 100 });

    assert.equal(evaluation.decision, "escalation_required");
    assert.ok(evaluation.reason.includes("100"));
    assert.ok(evaluation.reason.includes("50"));
  });

  await t.test("risk over threshold returns escalation_required", () => {
    const envelope = validEnvelope({ riskThreshold: "medium" });
    const evaluation = evaluateAutonomyRequest(envelope, "research", { riskLevel: "high" });

    assert.equal(evaluation.decision, "escalation_required");
    assert.ok(evaluation.reason.includes("high"));
    assert.ok(evaluation.reason.includes("medium"));
  });

  // ========================================================================
  // Human-on-the-Loop enforcement
  // ========================================================================

  await t.test("humanOnTheLoop false is blocked", () => {
    const envelope = validEnvelope({ humanOnTheLoop: false });
    const result = validateWorkOrderAutonomyEnvelope(envelope);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "human_on_the_loop_required"));
  });

  await t.test("noExecutionAuthorized false is blocked", () => {
    const envelope = validEnvelope({ noExecutionAuthorized: false });
    const result = validateWorkOrderAutonomyEnvelope(envelope);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "no_execution_authorized_required"));
  });

  // ========================================================================
  // Forbidden execution fields
  // ========================================================================

  await t.test("nested forbidden execution field in metadata is blocked", () => {
    const envelope = validEnvelope({ metadata: { nested: { deployNow: true } } });
    const result = validateWorkOrderAutonomyEnvelope(envelope);

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === "forbidden_execution_field"));
  });

  await t.test("hasForbiddenAutonomyFields detects top-level forbidden fields", () => {
    assert.equal(hasForbiddenAutonomyFields({ executeNow: true }), true);
    assert.equal(hasForbiddenAutonomyFields({ liveMode: true }), true);
    assert.equal(hasForbiddenAutonomyFields({ runtimeDispatch: true }), true);
  });

  await t.test("hasForbiddenAutonomyFields returns false for clean objects", () => {
    assert.equal(hasForbiddenAutonomyFields({ id: "test", level: "delegated" }), false);
  });

  // ========================================================================
  // Immutability
  // ========================================================================

  await t.test("validateWorkOrderAutonomyEnvelope does not mutate input", () => {
    const envelope = validEnvelope();
    const snapshot = JSON.stringify(envelope);
    validateWorkOrderAutonomyEnvelope(envelope);
    assert.equal(JSON.stringify(envelope), snapshot);
  });

  await t.test("evaluateAutonomyRequest does not mutate input", () => {
    const envelope = validEnvelope();
    const snapshot = JSON.stringify(envelope);
    evaluateAutonomyRequest(envelope, "research");
    assert.equal(JSON.stringify(envelope), snapshot);
  });

  await t.test("createAutonomyEnvelopeSummary does not mutate input", () => {
    const envelope = validEnvelope();
    const snapshot = JSON.stringify(envelope);
    createAutonomyEnvelopeSummary(envelope);
    assert.equal(JSON.stringify(envelope), snapshot);
  });

  // ========================================================================
  // Summary helper
  // ========================================================================

  await t.test("summary includes Human-on-the-Loop and no-execution wording", () => {
    const envelope = validEnvelope();
    const summary = createAutonomyEnvelopeSummary(envelope);

    assert.ok(summary.includes("Human-on-the-Loop"), "Summary must include Human-on-the-Loop");
    assert.ok(
      summary.includes("exécution") || summary.includes("autorisée"),
      "Summary must reference no-execution policy"
    );
    assert.ok(summary.includes("wo_venture_123"));
    assert.ok(summary.includes("joris"));
  });

  await t.test("summary renders allowed autonomous actions", () => {
    const envelope = validEnvelope();
    const summary = createAutonomyEnvelopeSummary(envelope);

    assert.ok(summary.includes("research"));
    assert.ok(summary.includes("analyze"));
    assert.ok(summary.includes("draft"));
  });

  await t.test("summary renders approval required actions", () => {
    const envelope = validEnvelope();
    const summary = createAutonomyEnvelopeSummary(envelope);

    assert.ok(summary.includes("publish"));
    assert.ok(summary.includes("spend_money"));
    assert.ok(summary.includes("deploy"));
  });

  await t.test("summary renders blocked actions", () => {
    const envelope = validEnvelope();
    const summary = createAutonomyEnvelopeSummary(envelope);

    assert.ok(summary.includes("runtime_dispatch"));
    assert.ok(summary.includes("live_execution"));
  });

  await t.test("summary renders constraints when present", () => {
    const envelope = validEnvelope({
      budgetLimit: 100,
      timeLimitMinutes: 60,
      riskThreshold: "medium",
    });
    const summary = createAutonomyEnvelopeSummary(envelope);

    assert.ok(summary.includes("100"));
    assert.ok(summary.includes("60"));
    assert.ok(summary.includes("medium"));
  });
});
