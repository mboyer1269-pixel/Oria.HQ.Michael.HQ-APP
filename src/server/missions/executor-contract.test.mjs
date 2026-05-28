#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("Mission Executor Contract tests", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const { buildDryRunMissionExecutionPlan } = await jiti.import(
    path.join(__dirname, "executor-contract.ts")
  );

  const baseMission = {
    id: "msn_123",
    status: "queued",
    autonomyLevel: 0,
    requiresApproval: false,
    title: "Test Mission",
    assignedAgentId: "test_agent",
  };

  await t.test("dry-run mode produces a valid plan", () => {
    const res = buildDryRunMissionExecutionPlan({
      mission: baseMission,
      mode: "dry_run",
    });

    assert.equal(res.allowed, true);
    if (res.allowed) {
      assert.equal(res.plan.mode, "dry_run");
      assert.equal(res.plan.steps.length, 1);
      
      const step = res.plan.steps[0];
      assert.equal(step.ledgerMetadata.missionId, "msn_123");
      assert.equal(step.ledgerMetadata.missionStatus, "running");
      assert.equal(step.ledgerMetadata.missionTransition, "queued → running");
    }
  });

  await t.test("live mode is completely blocked", () => {
    const res = buildDryRunMissionExecutionPlan({
      mission: baseMission,
      mode: "live",
    });

    assert.equal(res.allowed, false);
    if (!res.allowed) {
      assert.ok(res.blockReasons.includes("live_mode_not_implemented"));
    }
  });

  await t.test("approval confirmed flag is accurately passed to the plan", () => {
    const res = buildDryRunMissionExecutionPlan({
      mission: baseMission,
      mode: "dry_run",
      approvalConfirmed: true,
    });

    assert.equal(res.allowed, true);
    if (res.allowed) {
      assert.equal(res.plan.steps[0].ledgerMetadata.approvalConfirmed, true);
    }
  });

  await t.test("rejects plan if underlying transition is blocked", () => {
    const res = buildDryRunMissionExecutionPlan({
      mission: { ...baseMission, status: "completed" }, // Terminal state
      mode: "dry_run",
    });

    assert.equal(res.allowed, false);
    if (!res.allowed) {
      assert.ok(res.blockReasons.includes("terminal_state"));
    }
  });

  await t.test("rejects plan if approval is required but missing", () => {
    const res = buildDryRunMissionExecutionPlan({
      mission: { ...baseMission, requiresApproval: true },
      mode: "dry_run",
      approvalConfirmed: false,
    });

    assert.equal(res.allowed, false);
    if (!res.allowed) {
      assert.ok(res.blockReasons.includes("approval_required"));
      assert.ok(res.blockReasons.includes("approval_not_confirmed"));
    }
  });
});
