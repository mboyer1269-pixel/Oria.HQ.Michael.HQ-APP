#!/usr/bin/env node
// GAP (red on purpose, npm run test:gaps) — git_push targeting main must be
// governed by R-NO-MERGE AND R-NO-FORCE-PUSH in addition to R-ZONE-YELLOW.
// ASSUMED shape: the request carries { target: "main" } and the refusal
// verdict exposes every applicable rule in verdict.ruleIds.
// SIMULATED: in-memory spy executor.
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

for (const target of ["main", "refs/heads/main"]) {
  test(`git_push to ${target} without decision -> REQUIRE_APPROVAL under R-NO-MERGE + R-NO-FORCE-PUSH + R-ZONE-YELLOW`, () => {
    const s = spy();
    const v = guard.guardGovernedAction({ agentId: "a", action: "git_push", target, payloadHash: "h" }, s.fn);
    assert.equal(v.allowed, false);
    assert.equal(v.verdict, "REQUIRE_APPROVAL");
    assert.ok(Array.isArray(v.ruleIds), "verdict.ruleIds missing");
    for (const r of ["R-NO-MERGE", "R-NO-FORCE-PUSH", "R-ZONE-YELLOW"]) assert.ok(v.ruleIds.includes(r), r);
    assert.equal(s.n, 0);
  });
}

test("none of those rules is exempted as non-action", () => {
  for (const r of ["R-NO-MERGE", "R-NO-FORCE-PUSH", "R-ZONE-YELLOW"]) assert.ok(!(guard.NON_ACTION_RULE_IDS ?? []).includes(r), r);
});
