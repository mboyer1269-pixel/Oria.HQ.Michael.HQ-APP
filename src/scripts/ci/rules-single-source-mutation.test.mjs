#!/usr/bin/env node

// src/scripts/ci/rules-single-source-mutation.test.mjs
//
// In-memory mutation tests: each case in rules-mutation-cases.mjs rewrites a
// REAL file and the scanner must flag it. On-disk red proof against the full
// guard: node src/scripts/ci/rules-mutation-red.mjs

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { CASES } from "./rules-mutation-cases.mjs";
import { uncitedRuleLines } from "./rules-scan.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const sha = (s) => createHash("sha256").update(s).digest("hex");

for (const c of CASES) {
  test(`mutation caught: ${c.name}`, async () => {
    const text = await readFile(path.join(root, c.file), "utf8");
    const mutated = c.apply(text);
    assert.notEqual(mutated, text, "mutation did not apply");
    if (c.lock) {
      // Lock-file cases: the note must be gone or point at an undeclared id.
      const core = await readFile(path.join(root, ".agents/rules/core.md"), "utf8");
      const ids = new Set([...core.matchAll(/^- \*\*(R-[A-Z0-9-]+)\*\*/gm)].map((m) => m[1]));
      const notes = JSON.parse(mutated).overlaps ?? [];
      const ok = notes.some((o) => o.file === "supabase/SKILL.md" && o.line === 44 && ids.has(o.overlaps));
      assert.equal(ok, false, "lock mutation left a valid line-44 note");
      return;
    }
    if (c.vendored) {
      assert.notEqual(sha(mutated), sha(text), "vendored drift must change the content hash");
      return;
    }
    const hits = uncitedRuleLines(mutated, c.file);
    assert.ok(hits.some((h) => h.includes(c.probe)), `not detected in ${c.file}: ${c.probe}`);
  });
}

test("unmutated files are clean (no false positives)", async () => {
  for (const f of new Set(CASES.filter((c) => !c.vendored && !c.lock).map((c) => c.file))) {
    assert.deepEqual(uncitedRuleLines(await readFile(path.join(root, f), "utf8"), f), [], f);
  }
});
