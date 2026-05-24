#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

process.env.NODE_ENV = "development";
delete process.env.MICHAEL_HQ_OWNER_ID;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});

const ledgerPath = path.join(projectRoot, "src/server/actions/ledger-events.ts");
const skillsPath = path.join(projectRoot, "src/features/skills/seed.ts");

const {
  LedgerEventValidationError,
  recordLedgerEvent,
  requireLedgerForEffectfulSkill,
  validateLedgerEventPayload,
} = await jiti.import(ledgerPath);
const { skillsCatalog } = await jiti.import(skillsPath);

const workspace = {
  id: "workspace_test",
  slug: "workspace-test",
  displayName: "Workspace Test",
  ownerUserId: "owner_test",
  modes: [{ id: "hq", label: "HQ" }],
  defaultAssistantId: "joris",
};

const ctx = {
  activeWorkspace: workspace,
  activeMode: workspace.modes[0],
  activeAgentProfile: {
    id: "joris",
    workspaceId: workspace.id,
    name: "Joris",
    runtimeId: "local-runtime",
    allowedTools: [],
  },
  currentOwnerUser: {
    id: "owner_test",
  },
  workspace,
  userId: "owner_test",
  storagePreference: "local",
};

function baseSkill(overrides = {}) {
  return {
    id: "test.skill",
    label: "Test Skill",
    category: "automation",
    description: "Skill de test.",
    status: "planned",
    autonomyLevel: 1,
    assignedRoles: ["operator"],
    inputs: [{ name: "input", type: "string", required: true }],
    outputs: [{ name: "output", type: "string", required: true }],
    sideEffects: "none",
    canWriteDB: false,
    canTriggerExternal: false,
    requiresHumanApproval: false,
    logsRequired: [],
    testsRequired: ["Critere minimal"],
    ...overrides,
  };
}

function validEvent(overrides = {}) {
  return {
    eventType: "action",
    actionType: "calendar.book",
    summary: "Creation calendrier 2026-05-24 10:00-11:00",
    autonomyLevel: 3,
    requiresConfirmation: false,
    workspaceId: workspace.id,
    modeId: "hq",
    skillId: "calendar.book",
    agentId: "joris",
    effect: {
      kind: "schedule",
      operation: "create",
      target: "calendar_events",
    },
    metadata: {
      calendarEventId: "evt_test",
      source: "joris",
      remindersMinutes: [60, 15],
      storageMode: "local",
    },
    ...overrides,
  };
}

test("effectful skill without ledger event is rejected", () => {
  const skill = baseSkill({
    sideEffects: "reversible-write",
    canWriteDB: true,
    logsRequired: ["action"],
  });

  assert.throws(
    () => requireLedgerForEffectfulSkill(skill),
    (error) =>
      error instanceof LedgerEventValidationError &&
      error.code === "SKILL_LEDGER_REQUIRED",
  );
});

test("read-only skill without ledger event is accepted", () => {
  const skill = baseSkill();

  assert.doesNotThrow(() => requireLedgerForEffectfulSkill(skill));
});

test("valid ledger event is accepted and recorded locally", async () => {
  const skill = skillsCatalog.find((candidate) => candidate.id === "calendar.book");
  assert.ok(skill, "calendar.book skill must exist");

  const entry = await recordLedgerEvent(ctx, validEvent(), { skill });

  assert.equal(entry.eventType, "action");
  assert.equal(entry.actionType, "calendar.book");
  assert.equal(entry.workspaceId, workspace.id);
  assert.equal(entry.skillId, "calendar.book");
  assert.equal(entry.agentId, "joris");
  assert.equal(entry.storageMode, "local");
  assert.equal(entry.payload.effect.kind, "schedule");
  assert.equal(entry.metadata.eventType, "action");
  assert.equal(entry.metadata.workspaceId, workspace.id);
});

test("ledger event workspace must match active workspace context", async () => {
  await assert.rejects(
    () => recordLedgerEvent(ctx, validEvent({ workspaceId: "other_workspace" })),
    (error) =>
      error instanceof LedgerEventValidationError &&
      error.code === "INVALID_LEDGER_FIELD",
  );
});

test("invalid event_type is rejected", () => {
  assert.throws(
    () => validateLedgerEventPayload(validEvent({ eventType: "invalid" })),
    (error) =>
      error instanceof LedgerEventValidationError &&
      error.code === "INVALID_LEDGER_EVENT_TYPE",
  );
});

test("missionId is required when requested for mission-linked execution", () => {
  const skill = baseSkill({
    sideEffects: "reversible-write",
    canWriteDB: true,
    logsRequired: ["action"],
  });

  assert.throws(
    () =>
      requireLedgerForEffectfulSkill(
        skill,
        {
          eventType: "action",
          workspaceId: workspace.id,
          skillId: "test.skill",
          agentId: "builder",
        },
        { missionIdRequired: true },
      ),
    (error) =>
      error instanceof LedgerEventValidationError &&
      error.code === "INVALID_LEDGER_FIELD",
  );
});

test("sensitive metadata keys are rejected", () => {
  assert.throws(
    () =>
      validateLedgerEventPayload(
        validEvent({
          metadata: {
            rawPrompt: "Book a private meeting with all details.",
          },
        }),
      ),
    (error) =>
      error instanceof LedgerEventValidationError &&
      error.code === "SENSITIVE_LEDGER_METADATA",
  );
});
