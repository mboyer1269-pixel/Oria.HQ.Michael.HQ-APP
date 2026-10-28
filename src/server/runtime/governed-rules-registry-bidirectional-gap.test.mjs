#!/usr/bin/env node
// GAP (red on purpose) — rules registry ↔ guard, driven by core.md itself.
// Each rule in .agents/rules/core.md must declare `kind: action` or
// `kind: process` (on its bullet line). Then:
//   - a rule without kind fails;
//   - every action-kind id has a guard entry (GOVERNED_ACTION_RULES value)
//     and is NOT exempted in NON_ACTION_RULE_IDS;
//   - every process-kind id is in NON_ACTION_RULE_IDS (explicit exemption);
//   - every guard id (incl. R-RISK-ROUND-UP) exists in core.md.
// The guard's hardcoded NON_ACTION_RULE_IDS (867d4f2) is NOT trusted as the
// source of truth: emptying it or moving R-NO-MERGE into it kept the previous
// version green (Sentinelle). Red on 867d4f2: core.md declares no kind.
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
const rules = new Map();
for (const line of core.split(/\r?\n/)) {
  const m = line.match(/^\s*-\s*\*\*(R-[A-Z0-9-]+)\*\*(.*)$/);
  if (!m) continue;
  const k = m[2].match(/\bkind:\s*(action|process)\b/);
  rules.set(m[1], k ? k[1] : null);
}
const guardIds = new Set([...Object.values(guard.GOVERNED_ACTION_RULES), "R-RISK-ROUND-UP"]);
const nonAction = new Set(guard.NON_ACTION_RULE_IDS ?? []);
const ids = (kind) => [...rules].filter(([, k]) => k === kind).map(([id]) => id);

test("core.md parses into a non-empty registry that contains R-NO-MERGE", () => {
  assert.ok(rules.size > 10, String(rules.size));
  assert.ok(rules.has("R-NO-MERGE"));
});

test("every core.md rule declares kind: action|process", () => {
  const missing = [...rules].filter(([, k]) => k === null).map(([id]) => id);
  assert.deepEqual(missing, [], `rules without kind: ${missing.join(", ")}`);
});

test("R-NO-MERGE is kind: action (sanity anchor)", () => {
  assert.equal(rules.get("R-NO-MERGE"), "action");
});

test("every action-kind rule has a guard entry and is not exempted", () => {
  const bad = ids("action").filter((id) => !guardIds.has(id) || nonAction.has(id));
  assert.deepEqual(bad, [], `action rules unguarded or exempted: ${bad.join(", ")}`);
});

test("every process-kind rule is explicitly exempted, and no exemption is an action rule", () => {
  const notExempt = ids("process").filter((id) => !nonAction.has(id));
  assert.deepEqual(notExempt, [], `process rules not in NON_ACTION_RULE_IDS: ${notExempt.join(", ")}`);
  const wrong = [...nonAction].filter((id) => rules.get(id) !== "process");
  assert.deepEqual(wrong, [], `NON_ACTION_RULE_IDS entries not kind: process in core.md: ${wrong.join(", ")}`);
});

test("guard ids ⊆ core.md", () => {
  const missing = [...guardIds].filter((id) => !rules.has(id));
  assert.deepEqual(missing, [], `guard ids absent from core.md: ${missing.join(", ")}`);
});
