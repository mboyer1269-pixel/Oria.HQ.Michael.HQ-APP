#!/usr/bin/env node
// /hq/memory must render a "no active workspace" state, not throw, when
// workspace resolution raises WorkspaceAccessError.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

async function loadModule() {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });
  return jiti.import(path.join(__dirname, "resolve-memory-workspace.ts"));
}

test("identity with no resolvable workspace returns no-workspace state instead of throwing", async () => {
  const { resolveMemoryWorkspace } = await loadModule();
  let result;
  assert.doesNotThrow(() => {
    result = resolveMemoryWorkspace({ userId: "" });
  });
  assert.equal(result.status, "no-workspace");
  assert.equal(result.message, "Aucun espace actif, choisis ou crée un espace.");
  assert.equal(result.code, "NOT_A_MEMBER");
});
