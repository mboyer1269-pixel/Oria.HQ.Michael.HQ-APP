#!/usr/bin/env node
// GAP (red on purpose, npm run test:gaps): at 867d4f2 this action is not governed (falls to BLOCK R-RISK-ROUND-UP) and its rule sits in NON_ACTION_RULE_IDS, i.e. misclassified as process.
// R-NO-FORCE-PUSH: "git_push" without an approved decision must be refused (REQUIRE_APPROVAL
// with ruleId R-NO-FORCE-PUSH), the executor never called, and R-NO-FORCE-PUSH must not be
// exempted in NON_ACTION_RULE_IDS. SIMULATED: in-memory spy executor.
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

test("R-NO-FORCE-PUSH: git_push without any decision -> REQUIRE_APPROVAL R-NO-FORCE-PUSH, not executed", () => {
  const s = spy();
  const v = guard.guardGovernedAction({ agentId: "a", action: "git_push", payloadHash: "h" }, s.fn);
  assert.deepEqual([v.allowed, v.verdict, v.ruleId, v.executed], [false, "REQUIRE_APPROVAL", "R-NO-FORCE-PUSH", false]);
  assert.equal(s.n, 0);
});

for (const status of ["pending", "rejected", "expired", undefined]) {
  test(`R-NO-FORCE-PUSH: decision with status ${status} does not unlock git_push`, () => {
    const s = spy();
    const v = guard.guardGovernedAction({ agentId: "a", action: "git_push", payloadHash: "h",
      approvedDecision: { status, action: "git_push", payloadHash: "h" } }, s.fn);
    assert.equal(v.allowed, false);
    assert.equal(v.ruleId, "R-NO-FORCE-PUSH");
    assert.equal(s.n, 0);
  });
}

test("R-NO-FORCE-PUSH is mapped from git_push and not exempted as non-action", () => {
  assert.equal(guard.GOVERNED_ACTION_RULES["git_push"], "R-NO-FORCE-PUSH");
  assert.ok(!(guard.NON_ACTION_RULE_IDS ?? []).includes("R-NO-FORCE-PUSH"));
});
