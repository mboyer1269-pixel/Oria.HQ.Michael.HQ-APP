#!/usr/bin/env node

// Locks the workspace config resolver contract: the registered list is
// default-first, slugs are unique, and slug resolution falls back to the
// default config instead of failing. Pure and offline — no network, no env.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("workspace config resolver", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const { DEFAULT_WORKSPACE_SLUG, listWorkspaceConfigs, getWorkspaceConfigBySlug } =
    await jiti.import(path.join(projectRoot, "src/core/workspaces/registry.ts"));

  await t.test("the registered list is non-empty and default-first", () => {
    const configs = listWorkspaceConfigs();
    assert.ok(configs.length >= 1, "at least one workspace config must be registered");
    assert.equal(configs[0].slug, DEFAULT_WORKSPACE_SLUG);
  });

  await t.test("registered slugs are unique", () => {
    const slugs = listWorkspaceConfigs().map((config) => config.slug);
    assert.equal(new Set(slugs).size, slugs.length);
  });

  await t.test("every registered slug resolves to its own config", () => {
    for (const config of listWorkspaceConfigs()) {
      assert.equal(getWorkspaceConfigBySlug(config.slug).slug, config.slug);
    }
  });

  await t.test("an unknown slug falls back to the default config", () => {
    const resolved = getWorkspaceConfigBySlug("no-such-workspace");
    assert.equal(resolved.slug, DEFAULT_WORKSPACE_SLUG);
  });
});
