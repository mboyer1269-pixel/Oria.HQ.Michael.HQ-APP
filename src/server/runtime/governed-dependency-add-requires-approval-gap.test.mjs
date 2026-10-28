#!/usr/bin/env node
// GAP (red on purpose, npm run test:gaps): at 867d4f2 this action is not governed (falls to BLOCK R-RISK-ROUND-UP) and its rule sits in NON_ACTION_RULE_IDS, i.e. misclassified as process.
// R-ZONE-YELLOW: "dependency_add" without an approved decision must be refused (REQUIRE_APPROVAL
// with ruleId R-ZONE-YELLOW), the executor never called, and R-ZONE-YELLOW must not be
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

test("R-ZONE-YELLOW: dependency_add without any decision -> REQUIRE_APPROVAL R-ZONE-YELLOW, not executed", () => {
  const s = spy();
  const v = guard.guardGovernedAction({ agentId: "a", action: "dependency_add", payloadHash: "h" }, s.fn);
  assert.deepEqual([v.allowed, v.verdict, v.ruleId, v.executed], [false, "REQUIRE_APPROVAL", "R-ZONE-YELLOW", false]);
  assert.equal(s.n, 0);
});

for (const status of ["pending", "rejected", "expired", undefined]) {
  test(`R-ZONE-YELLOW: decision with status ${status} does not unlock dependency_add`, () => {
    const s = spy();
    const v = guard.guardGovernedAction({ agentId: "a", action: "dependency_add", payloadHash: "h",
      approvedDecision: { status, action: "dependency_add", payloadHash: "h" } }, s.fn);
    assert.equal(v.allowed, false);
    assert.equal(v.ruleId, "R-ZONE-YELLOW");
    assert.equal(s.n, 0);
  });
}

test("R-ZONE-YELLOW is mapped from dependency_add and not exempted as non-action", () => {
  assert.equal(guard.GOVERNED_ACTION_RULES["dependency_add"], "R-ZONE-YELLOW");
  assert.ok(!(guard.NON_ACTION_RULE_IDS ?? []).includes("R-ZONE-YELLOW"));
});
