#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("Mission State Machine tests", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const { evaluateMissionTransition } = await jiti.import(
    path.join(__dirname, "state-machine.ts")
  );

  const baseMission = {
    id: "msn_123",
    status: "queued",
    autonomyLevel: 3,
    requiresApproval: true,
  };

  await t.test("allows valid structural transitions without approval check", () => {
    const res = evaluateMissionTransition({
      mission: { ...baseMission, status: "draft" },
      to: "queued",
    });
    assert.equal(res.allowed, true);
    assert.deepEqual(res.blockReasons, []);
  });

  await t.test("rejects invalid structural transitions", () => {
    const res = evaluateMissionTransition({
      mission: { ...baseMission, status: "draft" },
      to: "running",
    });
    assert.equal(res.allowed, false);
    assert.ok(res.blockReasons.includes("invalid_transition"));
  });

  await t.test("rejects transitions from terminal states", () => {
    const terminalStates = ["completed", "failed", "cancelled"];
    for (const state of terminalStates) {
      const res = evaluateMissionTransition({
        mission: { ...baseMission, status: state },
        to: "queued", // arbitrary
      });
      assert.equal(res.allowed, false);
      assert.ok(res.blockReasons.includes("terminal_state"));
    }
  });

  await t.test("rejects transition to running if approval is required but not confirmed", () => {
    const res = evaluateMissionTransition({
      mission: { ...baseMission, status: "queued", requiresApproval: true },
      to: "running",
      approvalConfirmed: false,
    });
    assert.equal(res.allowed, false);
    assert.ok(res.blockReasons.includes("approval_required"));
    assert.ok(res.blockReasons.includes("approval_not_confirmed"));
  });

  await t.test("allows transition to running if approval is required AND confirmed", () => {
    const res = evaluateMissionTransition({
      mission: { ...baseMission, status: "queued", requiresApproval: true },
      to: "running",
      approvalConfirmed: true,
    });
    assert.equal(res.allowed, true);
    assert.deepEqual(res.blockReasons, []);
  });

  await t.test("allows transition to running if approval is NOT required", () => {
    // Autonomy level 0 doesn't automatically block if requiresApproval is false
    const res = evaluateMissionTransition({
      mission: { ...baseMission, status: "queued", requiresApproval: false, autonomyLevel: 0 },
      to: "running",
      approvalConfirmed: false,
    });
    assert.equal(res.allowed, true);
    assert.deepEqual(res.blockReasons, []);
  });
});
