#!/usr/bin/env node
// GAP (red on purpose, npm run test:gaps) — Architect: the guard must read its
// rule registry from a generated src/server/runtime/core-rules.generated.ts
// (built from .agents/rules/core.md) and CI must catch drift. Asserts:
//   1. the generated file exists;
//   2. its ids/kinds match core.md exactly (drift test);
//   3. if the generated import is empty or malformed, the guard fails closed:
//      every governed action is refused, even with an approved decision.
// (3) builds a guard through the ASSUMED production factory
// createGovernedGuard(deps) (GUARD_FACTORY, one constant) with an injected
// registry — no *ForTests hook, no NODE_ENV, the real core.md is never touched. SIMULATED: in-memory spy executor.
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
import { readFile, access } from "node:fs/promises";

const GUARD_FACTORY = "createGovernedGuard"; // execution-guard.ts export: (deps: { registry }) => { guardGovernedAction }
const GEN = path.join(projectRoot, "src/server/runtime/core-rules.generated.ts");
const coreRules = async () => {
  const core = await readFile(path.join(projectRoot, ".agents/rules/core.md"), "utf8");
  const m = new Map();
  for (const line of core.split(/\r?\n/)) {
    const r = line.match(/^\s*-\s*\*\*(R-[A-Z0-9-]+)\*\*(.*)$/);
    if (r) m.set(r[1], (r[2].match(/\bkind:\s*(action|process)\b/) || [])[1] ?? null);
  }
  return m;
};

test("core-rules.generated.ts exists", async () => {
  await access(GEN);
});

test("core-rules.generated.ts matches core.md (ids and kinds, no drift)", async () => {
  const gen = await jiti.import(GEN);
  const rules = gen.CORE_RULES ?? gen.default;
  assert.ok(Array.isArray(rules) && rules.length > 0, "CORE_RULES must be a non-empty array");
  const fromGen = new Map(rules.map((r) => [r.id, r.kind]));
  assert.deepEqual([...fromGen].sort(), [...(await coreRules())].sort());
});

for (const [label, registry] of [["empty", []], ["malformed", [{ nope: 1 }, "R-NO-MERGE", null]], ["not an array", "garbage"]]) {
  test(`${label} generated registry -> guard refuses every governed action (fail closed)`, () => {
    assert.equal(typeof guard[GUARD_FACTORY], "function", `missing factory ${GUARD_FACTORY}(deps)`);
    let g;
    try { g = guard[GUARD_FACTORY]({ registry }); } catch { return; } // throwing at load is fail-closed too
    for (const action of Object.keys(guard.GOVERNED_ACTION_RULES)) {
      const s = spy();
      const v = g.guardGovernedAction({ agentId: "a", action, payloadHash: "h",
        approvedDecision: { status: "approved", action, payloadHash: "h" } }, s.fn);
      assert.equal(v.allowed, false, action);
      assert.equal(s.n, 0, action);
    }
  });
}
