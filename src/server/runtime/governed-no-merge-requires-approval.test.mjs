#!/usr/bin/env node
// G1: R-NO-MERGE (.agents/rules/core.md) is refused without an APPROVED
// decision (none, pending, rejected, expired-status, missing status), and
// execute() is never called. SIMULATED: pure guard, no repo, no network.
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

test("R-NO-MERGE: merge without any decision -> REQUIRE_APPROVAL, not executed", () => {
  const s = spy();
  const v = guard.guardGovernedAction({ agentId: "a", action: "merge", payloadHash: "h" }, s.fn);
  assert.deepEqual([v.allowed, v.verdict, v.ruleId, v.executed], [false, "REQUIRE_APPROVAL", "R-NO-MERGE", false]);
  assert.equal(s.n, 0);
});

for (const status of ["pending", "rejected", "expired", undefined]) {
  test(`R-NO-MERGE: decision with status ${status} does not unlock merge`, () => {
    const s = spy();
    const v = guard.guardGovernedAction({ agentId: "a", action: "merge", payloadHash: "h",
      approvedDecision: { status, action: "merge", payloadHash: "h" } }, s.fn);
    assert.equal(v.allowed, false);
    assert.equal(v.ruleId, "R-NO-MERGE");
    assert.equal(s.n, 0);
  });
}

test("core.md still defines R-NO-MERGE and the guard maps merge to it", async () => {
  const { readFile } = await import("node:fs/promises");
  const core = await readFile(path.join(projectRoot, ".agents/rules/core.md"), "utf8");
  assert.match(core, /\*\*R-NO-MERGE\*\*/);
  assert.equal(guard.GOVERNED_ACTION_RULES.merge, "R-NO-MERGE");
});
