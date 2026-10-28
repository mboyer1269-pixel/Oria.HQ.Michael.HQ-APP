#!/usr/bin/env node
// Wired at 867d4f2 (GOVERNED_ACTION_RULES) — regular test, runs in verify.
// R-NO-DEPLOY: "deploy" without an approved decision must be refused (REQUIRE_APPROVAL
// with ruleId R-NO-DEPLOY), the executor never called, and R-NO-DEPLOY must not be
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

test("R-NO-DEPLOY: deploy without any decision -> REQUIRE_APPROVAL R-NO-DEPLOY, not executed", () => {
  const s = spy();
  const v = guard.guardGovernedAction({ agentId: "a", action: "deploy", payloadHash: "h" }, s.fn);
  assert.deepEqual([v.allowed, v.verdict, v.ruleId, v.executed], [false, "REQUIRE_APPROVAL", "R-NO-DEPLOY", false]);
  assert.equal(s.n, 0);
});

for (const status of ["pending", "rejected", "expired", undefined]) {
  test(`R-NO-DEPLOY: decision with status ${status} does not unlock deploy`, () => {
    const s = spy();
    const v = guard.guardGovernedAction({ agentId: "a", action: "deploy", payloadHash: "h",
      approvedDecision: { status, action: "deploy", payloadHash: "h" } }, s.fn);
    assert.equal(v.allowed, false);
    assert.equal(v.ruleId, "R-NO-DEPLOY");
    assert.equal(s.n, 0);
  });
}

test("R-NO-DEPLOY is mapped from deploy and not exempted as non-action", () => {
  assert.equal(guard.GOVERNED_ACTION_RULES["deploy"], "R-NO-DEPLOY");
  assert.ok(!(guard.NON_ACTION_RULE_IDS ?? []).includes("R-NO-DEPLOY"));
});
