#!/usr/bin/env node
// G1: the execution guard judges ACTIONS against core.md rule ids (not phrases).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(projectRoot, "src") } });
const guard = await jiti.import(path.join(projectRoot, "src/server/runtime/execution-guard.ts"));

function spy() {
  const calls = [];
  const fn = () => { calls.push(1); return "executed"; };
  return { fn, calls };
}

function guardFn() {
  assert.equal(typeof guard.guardGovernedAction, "function", "execution-guard.ts must export guardGovernedAction");
  return guard.guardGovernedAction;
}

test("agent merge without an approved decision is refused with R-NO-MERGE and nothing executes", () => {
  const run = spy();
  const verdict = guardFn()({ agentId: "builder", action: "merge", payloadHash: "sha256:abc" }, run.fn);
  assert.equal(verdict.allowed, false);
  assert.equal(verdict.ruleId, "R-NO-MERGE");
  assert.equal(verdict.executed, false);
  assert.equal(run.calls.length, 0);
});
