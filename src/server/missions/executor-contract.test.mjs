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

  const validDerivationMock = {
    approvalConfirmed: true,
    record: { id: "record_1" }
  };

  const invalidDerivationMock = {
    approvalConfirmed: false,
    reason: "not_approved",
    record: null
  };

  await t.test("dry-run mode produces a valid plan without approval if not required", () => {
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
      assert.equal(step.ledgerMetadata.approvalConfirmed, false);
    }
  });

  await t.test("live mode is completely blocked even with valid derivation", () => {
    const res = buildDryRunMissionExecutionPlan({
      mission: baseMission,
      mode: "live",
      approvalDerivation: validDerivationMock,
    });

    assert.equal(res.allowed, false);
    if (!res.allowed) {
      assert.ok(res.blockReasons.includes("live_mode_not_implemented"));
    }
  });

  await t.test("dry_run with valid approvalDerivation can pass the approval gate", () => {
    const res = buildDryRunMissionExecutionPlan({
      mission: { ...baseMission, requiresApproval: true },
      mode: "dry_run",
      approvalDerivation: validDerivationMock,
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

  await t.test("dry_run without approvalDerivation remains blocked when approval is required", () => {
    const res = buildDryRunMissionExecutionPlan({
      mission: { ...baseMission, requiresApproval: true },
      mode: "dry_run",
    });

    assert.equal(res.allowed, false);
    if (!res.allowed) {
      assert.ok(res.blockReasons.includes("approval_required"));
      assert.ok(res.blockReasons.includes("approval_not_confirmed"));
    }
  });

  await t.test("dry_run with invalid approvalDerivation remains blocked", () => {
    const res = buildDryRunMissionExecutionPlan({
      mission: { ...baseMission, requiresApproval: true },
      mode: "dry_run",
      approvalDerivation: invalidDerivationMock,
    });

    assert.equal(res.allowed, false);
    if (!res.allowed) {
      assert.ok(res.blockReasons.includes("approval_required"));
      assert.ok(res.blockReasons.includes("approval_not_confirmed"));
    }
  });

  await t.test("no caller can pass approvalConfirmed: true as a trusted unlock anymore", () => {
    // If a caller attempts to spoof the legacy property by passing it anyway (ignoring TS),
    // it will not unlock the execution because it is not destructured.
    const res = buildDryRunMissionExecutionPlan({
      mission: { ...baseMission, requiresApproval: true },
      mode: "dry_run",
      // @ts-expect-error Intentionally spoofing to prove runtime protection
      approvalConfirmed: true,
    });

    assert.equal(res.allowed, false);
    if (!res.allowed) {
      assert.ok(res.blockReasons.includes("approval_required"));
      assert.ok(res.blockReasons.includes("approval_not_confirmed"));
    }
  });
});
