#!/usr/bin/env node

// src/scripts/ci/rules-single-source-mutation.test.mjs
//
// Mutation tests for the rules single-source guard: a rule restated in other
// words (English or French) outside core.md, without citing an R- id, must be
// caught. Each case injects the phrase into the REAL file content in memory.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { uncitedRuleLines } from "./rules-scan.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SKILL = ".agents/skills/orya-pr-planner/SKILL.md";
const CHARTER = "src/features/agents/charter-seed.ts";

test("mutation: rephrased English rule in a SKILL.md is caught", async () => {
  const text = await readFile(path.join(root, SKILL), "utf8");
  const mutated = `${text}\n- Only Michael may merge into main; agents never merge.\n`;
  const hits = uncitedRuleLines(mutated, SKILL);
  assert.ok(
    hits.some((h) => h.includes("Only Michael may merge into main")),
    `rephrased rule not detected in ${SKILL}`,
  );
});

test("mutation: French rule restated in charter-seed.ts is caught", async () => {
  const text = await readFile(path.join(root, CHARTER), "utf8");
  const mutated = text.replace(
    "successCriteria: [",
    'successCriteria: [\n      "Aucune exécution live sans MissionApprovalRecord",',
  );
  assert.notEqual(mutated, text);
  const hits = uncitedRuleLines(mutated, CHARTER);
  assert.ok(
    hits.some((h) => h.includes("Aucune exécution live sans MissionApprovalRecord")),
    `French rule not detected in ${CHARTER}`,
  );
});

test("unmutated files are clean (no false positives)", async () => {
  for (const f of [SKILL, CHARTER]) {
    assert.deepEqual(uncitedRuleLines(await readFile(path.join(root, f), "utf8"), f), [], f);
  }
});
