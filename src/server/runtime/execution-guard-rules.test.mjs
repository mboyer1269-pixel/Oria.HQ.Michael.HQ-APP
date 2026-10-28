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

const APPROVED = (action, payloadHash) => ({ status: "approved", action, payloadHash });

test("every governed action maps to an id declared in core.md", async () => {
  const core = await readFile(path.join(projectRoot, ".agents/rules/core.md"), "utf8");
  const ids = new Set([...core.matchAll(/^- \*\*(R-[A-Z0-9-]+)\*\*/gm)].map((m) => m[1]));
  for (const [action, id] of Object.entries(guard.GOVERNED_ACTION_RULES)) assert.ok(ids.has(id), `${action} -> ${id}`);
  assert.ok(ids.has("R-RISK-ROUND-UP"));
  for (const a of ["merge", "deploy", "remote_migration", "spend", "pay", "delete", "secret_access", "external_contact"]) {
    assert.ok(a in guard.GOVERNED_ACTION_RULES, a);
  }
});

test("each governed action without approval is refused and nothing executes", () => {
  for (const [action, id] of Object.entries(guard.GOVERNED_ACTION_RULES)) {
    const run = spy();
    const v = guardFn()({ agentId: "builder", action, payloadHash: "sha256:x" }, run.fn);
    assert.deepEqual([v.allowed, v.ruleId, v.executed, run.calls.length], [false, id, false, 0], action);
  }
});

test("approved decision with a mismatched payload_hash is refused and nothing executes", () => {
  const run = spy();
  const v = guardFn()({ agentId: "builder", action: "merge", payloadHash: "sha256:new",
    approvedDecision: APPROVED("merge", "sha256:old") }, run.fn);
  assert.equal(v.allowed, false);
  assert.equal(v.ruleId, "R-NO-MERGE");
  assert.equal(run.calls.length, 0);
});

test("approved decision for another action does not unlock this one", () => {
  const run = spy();
  const v = guardFn()({ agentId: "builder", action: "deploy", payloadHash: "sha256:x",
    approvedDecision: APPROVED("merge", "sha256:x") }, run.fn);
  assert.deepEqual([v.allowed, v.ruleId, run.calls.length], [false, "R-NO-DEPLOY", 0]);
});

test("unknown action or tool is refused (fail-closed) even with an approval", () => {
  for (const action of ["land_to_main", "ship", "", "MERGE"]) {
    const run = spy();
    const v = guardFn()({ agentId: "builder", action, payloadHash: "sha256:x",
      approvedDecision: APPROVED(action, "sha256:x") }, run.fn);
    assert.deepEqual([v.allowed, v.ruleId, run.calls.length], [false, "R-RISK-ROUND-UP", 0], action);
  }
});

test("matching approved decision runs the action exactly once", () => {
  const run = spy();
  const v = guardFn()({ agentId: "builder", action: "merge", payloadHash: "sha256:x",
    approvedDecision: APPROVED("merge", "sha256:x") }, run.fn);
  assert.deepEqual([v.allowed, v.executed, v.result, run.calls.length], [true, true, "executed", 1]);
});
