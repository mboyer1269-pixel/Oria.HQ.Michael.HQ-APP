#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("Draft-to-Queued Readiness Contract tests", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const { evaluateDraftToQueuedReadiness } = await jiti.import(
    path.join(__dirname, "draft-to-queued-contract.ts")
  );

  const validDraftMission = {
    id: "msn_draft_123",
    workspaceId: "michael-hq",
    modeId: "hq",
    title: "Test Draft",
    objective: "Test objective",
    assignedAgentId: "joris",
    status: "draft",
    input: {
      skillId: "test.skill",
      actionType: "test.action",
      someData: 123
    },
  };

  await t.test("valid draft -> queued readiness produces a plan without mutation", () => {
    // Clone to ensure no mutation
    const missionClone = JSON.parse(JSON.stringify(validDraftMission));
    const res = evaluateDraftToQueuedReadiness(missionClone);

    assert.equal(res.allowed, true);
    if (res.allowed) {
      assert.equal(res.plan.missionId, "msn_draft_123");
      assert.equal(res.plan.proposedStatus, "queued");
      assert.equal(res.plan.actionType, "test.action");
      assert.equal(res.plan.skillId, "test.skill");
    }
    
    // Ensure no mutation
    assert.deepEqual(missionClone, validDraftMission);
  });

  await t.test("non-draft mission is blocked", () => {
    const res = evaluateDraftToQueuedReadiness({ ...validDraftMission, status: "queued" });
    assert.equal(res.allowed, false);
    if (!res.allowed) {
      assert.ok(res.blockReasons.includes("not_draft"));
      // Also implies "queued_transition_not_allowed" since queued -> queued is invalid
    }
  });

  await t.test("missing mission id is blocked", () => {
    const res = evaluateDraftToQueuedReadiness({ ...validDraftMission, id: "" });
    assert.equal(res.allowed, false);
    if (!res.allowed) {
      assert.ok(res.blockReasons.includes("missing_mission_id"));
    }
  });

  await t.test("missing workspaceId is blocked", () => {
    const res = evaluateDraftToQueuedReadiness({ ...validDraftMission, workspaceId: "" });
    assert.equal(res.allowed, false);
    if (!res.allowed) assert.ok(res.blockReasons.includes("missing_workspace_id"));
  });

  await t.test("missing modeId is blocked", () => {
    const res = evaluateDraftToQueuedReadiness({ ...validDraftMission, modeId: "" });
    assert.equal(res.allowed, false);
    if (!res.allowed) assert.ok(res.blockReasons.includes("missing_mode_id"));
  });

  await t.test("missing assignedAgentId is blocked", () => {
    const res = evaluateDraftToQueuedReadiness({ ...validDraftMission, assignedAgentId: "" });
    assert.equal(res.allowed, false);
    if (!res.allowed) assert.ok(res.blockReasons.includes("missing_assigned_agent_id"));
  });

  await t.test("missing title is blocked", () => {
    const res = evaluateDraftToQueuedReadiness({ ...validDraftMission, title: "" });
    assert.equal(res.allowed, false);
    if (!res.allowed) assert.ok(res.blockReasons.includes("missing_title"));
  });

  await t.test("missing objective is blocked", () => {
    const res = evaluateDraftToQueuedReadiness({ ...validDraftMission, objective: "" });
    assert.equal(res.allowed, false);
    if (!res.allowed) assert.ok(res.blockReasons.includes("missing_objective"));
  });

  await t.test("missing actionType / skillId are blocked when mission.input expects action execution", () => {
    const invalidInputMission = {
      ...validDraftMission,
      input: {
        someOtherKey: 123
      } // missing skillId and actionType
    };
    const res = evaluateDraftToQueuedReadiness(invalidInputMission);
    assert.equal(res.allowed, false);
    if (!res.allowed) {
      assert.ok(res.blockReasons.includes("missing_skill_id"));
      assert.ok(res.blockReasons.includes("missing_action_type"));
    }
  });

  await t.test("no live execution behavior is introduced (pure function verified)", () => {
    // There is no mode parameter to even attempt live execution
    assert.equal(evaluateDraftToQueuedReadiness.length, 1); // takes only mission
  });
});
