#!/usr/bin/env node
// GAP (red on purpose, npm run test:gaps) — git_push target normalization:
// every spelling of the protected default branch must be governed by
// R-NO-MERGE (verdict.ruleIds, ASSUMED shape). An absent target is treated as
// the default branch (fail closed); an unknown default branch makes ANY
// git_push refused under R-NO-MERGE (Ronny). ASSUMED request field defaultBranch for a
// repo whose default branch is not main. SIMULATED: spy executor.
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

const cases = [
  ["refs/heads/main", { target: "refs/heads/main" }],
  ["origin/main", { target: "origin/main" }],
  ["Main", { target: "Main" }],
  ["'main ' (trailing space)", { target: "main " }],
  ["master", { target: "master" }],
  ["absent target", {}],
  ["repo default branch 'trunk' (not main)", { target: "trunk", defaultBranch: "trunk" }],
  ["upstream/main", { target: "upstream/main" }],
  ["refs/remotes/upstream/main", { target: "refs/remotes/upstream/main" }],
  ["refspec src:refs/heads/main", { target: "src:refs/heads/main" }],
  ["HEAD", { target: "HEAD" }],
  ["main, default branch not provided", { target: "main" }],
  ["master, default branch not provided", { target: "master" }],
  // Ronny: default branch unknown -> ANY git_push refused under R-NO-MERGE.
  ["feature branch, default branch unknown", { target: "feature/x" }],
  ["default branch 'develop' configured, push to develop", { target: "develop", defaultBranch: "develop" }],
];
for (const [label, extra] of cases) {
  test(`git_push -> ${label} is governed by R-NO-MERGE`, () => {
    const s = spy();
    const v = guard.guardGovernedAction({ agentId: "a", action: "git_push", payloadHash: "h", ...extra }, s.fn);
    assert.equal(v.allowed, false);
    assert.ok(Array.isArray(v.ruleIds) && v.ruleIds.includes("R-NO-MERGE"), JSON.stringify(v.ruleIds ?? v.ruleId));
    assert.equal(s.n, 0);
  });
}
