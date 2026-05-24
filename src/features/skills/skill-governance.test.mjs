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
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});

const governancePath = path.join(projectRoot, "src/features/skills/skill-governance.ts");
const seedPath = path.join(projectRoot, "src/features/skills/seed.ts");

const { validateSkillProfile, validateSkillsCatalog } = await jiti.import(governancePath);
const { skillsCatalog } = await jiti.import(seedPath);

function baseSkill(overrides = {}) {
  return {
    id: "test.skill",
    label: "Test Skill",
    category: "automation",
    description: "Skill de test pour la gouvernance.",
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
    testsRequired: ["Critère de test minimal"],
    ...overrides,
  };
}

test("skillsCatalog passes governance validation", () => {
  const result = validateSkillsCatalog(skillsCatalog);
  assert.equal(result.valid, true, result.issues.map((issue) => issue.message).join("; "));
  assert.equal(result.issues.length, 0);
});

test("detects duplicate skill ids", () => {
  const duplicate = baseSkill({ id: "dup.skill" });
  const result = validateSkillsCatalog([duplicate, { ...duplicate, label: "Duplicate copy" }]);

  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.code === "DUPLICATE_ID"));
});

test("detects missing required fields", () => {
  const result = validateSkillProfile(
    baseSkill({
      description: "   ",
      inputs: [],
      outputs: [],
      testsRequired: [],
    }),
  );

  assert.ok(result.some((issue) => issue.code === "DESCRIPTION_REQUIRED"));
  assert.ok(result.some((issue) => issue.code === "INPUTS_REQUIRED"));
  assert.ok(result.some((issue) => issue.code === "OUTPUTS_REQUIRED"));
  assert.ok(result.some((issue) => issue.code === "TESTS_REQUIRED"));
});

test("detects invalid assigned role", () => {
  const result = validateSkillProfile(
    baseSkill({
      assignedRoles: ["unknown-role"],
    }),
  );

  assert.ok(result.some((issue) => issue.code === "INVALID_ASSIGNED_ROLE"));
});

test("detects autonomy level out of range", () => {
  const result = validateSkillProfile(
    baseSkill({
      autonomyLevel: 9,
    }),
  );

  assert.ok(result.some((issue) => issue.code === "AUTONOMY_OUT_OF_RANGE"));
});

test("detects db write without required ledger events", () => {
  const result = validateSkillProfile(
    baseSkill({
      canWriteDB: true,
      logsRequired: [],
    }),
  );

  assert.ok(result.some((issue) => issue.code === "DB_WRITE_REQUIRES_LEDGER"));
});

test("detects external trigger without human approval", () => {
  const result = validateSkillProfile(
    baseSkill({
      canTriggerExternal: true,
      requiresHumanApproval: false,
    }),
  );

  assert.ok(result.some((issue) => issue.code === "EXTERNAL_TRIGGER_REQUIRES_APPROVAL"));
});
