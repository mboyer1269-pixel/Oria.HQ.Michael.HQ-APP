#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
  },
});

const displayPath = path.join(projectRoot, "src/features/missions/mission-display.ts");
const { classifyMissionDisplayKind, isConfirmedCalendarDraftMission } = await jiti.import(displayPath);

const baseMission = {
  id: "mission_test",
  workspaceId: "michael-hq",
  modeId: "hq",
  title: "Test",
  objective: "Objectif",
  assignedAgentId: "joris",
  autonomyLevel: 2,
  status: "draft",
  riskLevel: "low",
  input: {},
  expectedOutput: "Sortie",
  requiresApproval: false,
  createdAt: "2026-05-27T00:00:00.000Z",
  updatedAt: "2026-05-27T00:00:00.000Z",
};

test("classifyMissionDisplayKind detects confirmed calendar draft missions", () => {
  const bySkill = {
    ...baseMission,
    id: "mission_draft_123_abc",
    input: { skillId: "calendar.book", actionType: "calendar.book" },
  };

  assert.equal(classifyMissionDisplayKind(bySkill), "calendar_draft_confirmed");
  assert.equal(isConfirmedCalendarDraftMission(bySkill), true);
});

test("classifyMissionDisplayKind flags mock executor approval missions", () => {
  const needsApproval = {
    ...baseMission,
    id: "mission_client_message",
    status: "needs_approval",
    requiresApproval: true,
    riskLevel: "high",
    autonomyLevel: 5,
  };

  assert.equal(classifyMissionDisplayKind(needsApproval), "needs_executor_approval");
  assert.equal(isConfirmedCalendarDraftMission(needsApproval), false);
});

test("classifyMissionDisplayKind treats seed pipeline missions as seed_pipeline", () => {
  const seedDraft = {
    ...baseMission,
    id: "mission_venture_lab_plan_2026_05_21",
    status: "draft",
    input: { reference: "docs/ROADMAP.md" },
  };

  assert.equal(classifyMissionDisplayKind(seedDraft), "seed_pipeline");
});
