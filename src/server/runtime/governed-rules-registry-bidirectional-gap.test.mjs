#!/usr/bin/env node
// GAP (red on purpose) — Architecte ruling (3): the rules registry
// (.agents/rules/core.md, ids **R-…**) and the guard (GOVERNED_ACTION_RULES in
// execution-guard.ts) must agree in BOTH directions:
//   - every guard entry names an id that exists in core.md;
//   - every R-… id in core.md has a guard entry (rule ids are hardcoded today,
//     so most registry ids are unknown to the guard).
// Ids that are deliberately not action-governed must be listed explicitly by
// the implementer (e.g. an exported NON_ACTION_RULE_IDS), never silently skipped.
// SIMULATED: reads the repo file and the guard module, no network.
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
import { readFile } from "node:fs/promises";

const core = await readFile(path.join(projectRoot, ".agents/rules/core.md"), "utf8");
const registry = new Set([...core.matchAll(/\*\*(R-[A-Z0-9-]+)\*\*/g)].map((m) => m[1]));
const guardIds = new Set([...Object.values(guard.GOVERNED_ACTION_RULES), "R-RISK-ROUND-UP"]);
const exempt = new Set(guard.NON_ACTION_RULE_IDS ?? []);

test("registry is non-empty and contains R-NO-MERGE", () => {
  assert.ok(registry.size > 10);
  assert.ok(registry.has("R-NO-MERGE"));
});

test("guard -> registry: every guard rule id exists in core.md", () => {
  const missing = [...guardIds].filter((id) => !registry.has(id));
  assert.deepEqual(missing, [], `guard ids absent from core.md: ${missing.join(", ")}`);
});

test("registry -> guard: every core.md R-… id has a guard entry or an explicit exemption", () => {
  const missing = [...registry].filter((id) => !guardIds.has(id) && !exempt.has(id));
  assert.deepEqual(missing, [], `core.md ids unknown to the guard: ${missing.join(", ")}`);
});

test("exemptions are real registry ids and never overlap guard entries", () => {
  for (const id of exempt) {
    assert.ok(registry.has(id), `exempt id ${id} not in core.md`);
    assert.ok(!guardIds.has(id), `${id} is both guarded and exempt`);
  }
});
