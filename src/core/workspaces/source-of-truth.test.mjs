#!/usr/bin/env node

// Locks the workspace mode / permission / tool source of truth so an invalid or
// divergent id cannot slip in silently. Pure and offline — no network, no env.
//
// Source of truth under test:
//   - workspace modes + assistant tools: src/config/workspaces/michael-hq.config.ts
//     (exposed via src/core/workspaces/registry.ts)
//   - action autonomy rules: src/features/hq/seed.ts (permissionRules)
//   - skills/tools catalog: src/features/skills/seed.ts (skillsCatalog)

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("workspace / mode / permission source of truth", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const { MICHAEL_HQ_WORKSPACE_CONFIG: config } = await jiti.import(
    path.join(projectRoot, "src/config/workspaces/michael-hq.config.ts"),
  );
  const { DEFAULT_WORKSPACE_MODE_ID, getDefaultWorkspace, getDefaultWorkspaceMode, getDefaultAssistantProfile } =
    await jiti.import(path.join(projectRoot, "src/core/workspaces/registry.ts"));
  const { permissionRules } = await jiti.import(path.join(projectRoot, "src/features/hq/seed.ts"));
  const { skillsCatalog } = await jiti.import(path.join(projectRoot, "src/features/skills/seed.ts"));

  const skillIds = new Set(skillsCatalog.map((s) => s.id));

  await t.test("the default mode id is a real configured mode", () => {
    const modeIds = config.modes.map((m) => m.id);
    assert.ok(modeIds.includes(DEFAULT_WORKSPACE_MODE_ID), `default mode "${DEFAULT_WORKSPACE_MODE_ID}" not in modes`);
    assert.equal(config.defaultModeId, DEFAULT_WORKSPACE_MODE_ID);
  });

  await t.test("workspace modes have unique, non-empty ids and labels", () => {
    const ids = config.modes.map((m) => m.id);
    assert.equal(new Set(ids).size, ids.length, "duplicate mode id");
    for (const mode of config.modes) {
      assert.ok(typeof mode.id === "string" && mode.id.length > 0, "empty mode id");
      assert.ok(typeof mode.label === "string" && mode.label.length > 0, "empty mode label");
    }
  });

  await t.test("assistant allowedTools reference real skills (no phantom tools)", () => {
    for (const tool of config.defaultAssistantAllowedTools) {
      assert.ok(skillIds.has(tool), `allowedTool "${tool}" is not a known skill id`);
    }
  });

  await t.test("permission rules have unique ids and valid autonomy levels (0..5)", () => {
    const ids = permissionRules.map((r) => r.id);
    assert.equal(new Set(ids).size, ids.length, "duplicate permission rule id");
    for (const rule of permissionRules) {
      assert.ok(Number.isInteger(rule.level) && rule.level >= 0 && rule.level <= 5, `bad level for ${rule.id}`);
      assert.equal(typeof rule.requiresConfirmation, "boolean");
    }
  });

  await t.test("calendar booking ids resolve from the source of truth (calendar-service deps)", () => {
    // calendar-service.ts depends on these exact ids across the two axes — lock
    // them so a rename in one place cannot silently diverge from the others.
    assert.ok(permissionRules.some((r) => r.id === "calendar-simple"), "permission 'calendar-simple' missing");
    assert.ok(skillIds.has("calendar.book"), "skill 'calendar.book' missing");
    assert.ok(config.defaultAssistantAllowedTools.includes("calendar.book"), "assistant cannot use 'calendar.book'");
  });

  await t.test("registry resolves a default mode + assistant consistent with the config", () => {
    const ws = getDefaultWorkspace({ ownerUserId: "test-owner" });
    const mode = getDefaultWorkspaceMode(ws);
    const assistant = getDefaultAssistantProfile(ws);

    assert.equal(mode.id, config.defaultModeId);
    assert.equal(assistant.id, config.defaultAssistantId);
    assert.deepEqual(assistant.allowedTools, config.defaultAssistantAllowedTools);
  });
});
