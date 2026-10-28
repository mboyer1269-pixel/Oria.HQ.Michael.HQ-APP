#!/usr/bin/env node
// (force_push is a known, governed action — R-NO-FORCE-PUSH gap test — so a
// truly unknown name is used here.)
// G1: default deny — an action or rule id the guard does not know
// (incl. a rule id passed as action, prototype keys, empty string) is BLOCK
// R-RISK-ROUND-UP even with a matching "approved" decision; execute() never
// called. SIMULATED: pure guard, no repo, no network.
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

for (const action of ["R-NO-MERGE", "zz_g1_never_an_action", "unknown", "toString", "__proto__", ""]) {
  test(`default deny: unknown action/rule id "${action}" -> BLOCK R-RISK-ROUND-UP even with a matching approval`, () => {
    const s = spy();
    const v = guard.guardGovernedAction({ agentId: "a", action, payloadHash: "h",
      approvedDecision: { status: "approved", action, payloadHash: "h" } }, s.fn);
    assert.deepEqual([v.allowed, v.verdict, v.ruleId], [false, "BLOCK", "R-RISK-ROUND-UP"]);
    assert.equal(s.n, 0);
  });
}
