#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..", "..");

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});

const mod = await jiti.import(path.join(__dirname, "local-runtime-dispatch.ts"));
const { planLocalRuntimeDryRun, buildLocalRuntimeArgv } = mod;

const NOW = "2026-07-11T12:00:00.000Z";

test("local-runtime-dispatch dry-run", async (t) => {
  await t.test("plans claude argv without executing", () => {
    const result = planLocalRuntimeDryRun({
      kind: "claude_code_cli",
      prompt: "summarize AGENTS.md",
      requestedBy: "michael",
      permissionMode: "plan",
      nowIso: NOW,
    });
    assert.equal(result.ok, true);
    assert.equal(result.executed, false);
    assert.equal(result.enablesDispatch, false);
    assert.equal(result.binaryName, "claude");
    assert.ok(result.plannedArgv.includes("-p"));
    assert.ok(result.plannedArgv.includes("summarize AGENTS.md"));
    assert.equal(result.evidencePack.mode, "dry_run");
    assert.equal(result.evidencePack.enablesDispatch, false);
    assert.equal(result.evidencePack.outcome, "dry_run_completed");
    assert.deepEqual(result.evidencePack.filesTouched, []);
  });

  await t.test("plans codex argv", () => {
    const built = buildLocalRuntimeArgv("codex_cli", "list open todos");
    assert.equal(built.ok, true);
    assert.equal(built.binaryName, "codex");
    assert.deepEqual(built.argv, ["codex", "exec", "list open todos"]);
  });

  await t.test("rejects empty prompt", () => {
    const result = planLocalRuntimeDryRun({
      kind: "claude_code_cli",
      prompt: "   ",
      requestedBy: "michael",
      nowIso: NOW,
    });
    assert.equal(result.ok, false);
    assert.equal(result.executed, false);
    assert.equal(result.enablesDispatch, false);
  });

  await t.test("rejects secret-shaped argv material", () => {
    const result = planLocalRuntimeDryRun({
      kind: "claude_code_cli",
      prompt: "use sk-abcdefghijklmnopqrstuvwxyz123456",
      requestedBy: "michael",
      nowIso: NOW,
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("secret-shaped")));
  });
});
