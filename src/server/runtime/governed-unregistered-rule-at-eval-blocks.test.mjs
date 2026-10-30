#!/usr/bin/env node
// Evaluation-time fail-closed (execution-guard.ts ~l.794-795): if
// GOVERNED_ACTION_RULES is mutated after load so an action maps to an id
// absent from the core.md registry, guardGovernedAction must BLOCK with
// R-RISK-ROUND-UP and never execute — even with an approved decision.
// SIMULATED: in-memory mutation of the exported map (bypasses the load-time
// check on purpose), restored in finally.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: { "@": path.join(projectRoot, "src"), "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs") },
});
const guard = await jiti.import("@/server/runtime/execution-guard");

const spy = () => { const s = { n: 0, fn: () => { s.n += 1; return "ran"; } }; return s; };

test("merge remapped at runtime to an unregistered id -> BLOCK R-RISK-ROUND-UP, not executed", () => {
  const map = guard.GOVERNED_ACTION_RULES;
  const original = map.merge;
  assert.equal(original, "R-NO-MERGE");
  map.merge = "R-BOGUS-UNREGISTERED";
  try {
    assert.equal(map.merge, "R-BOGUS-UNREGISTERED", "map must be mutable for this probe");
    const s = spy();
    const v = guard.guardGovernedAction({ agentId: "a", action: "merge", payloadHash: "h",
      approvedDecision: { status: "approved", action: "merge", payloadHash: "h" } }, s.fn);
    assert.deepEqual([v.allowed, v.verdict, v.ruleId, v.executed], [false, "BLOCK", "R-RISK-ROUND-UP", false]);
    assert.equal(s.n, 0);
  } finally {
    map.merge = original;
  }
  assert.equal(map.merge, "R-NO-MERGE");
});
