#!/usr/bin/env node
// Red proof: apply each mutation to the real file ON DISK, run the real guard
// (rules-single-source.test.mjs), require it to FAIL with an assertion (not a
// module/load error), then restore the file byte-for-byte.
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CASES } from "./rules-mutation-cases.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const GUARD = "src/scripts/ci/rules-single-source.test.mjs";
let bad = 0;
for (const c of CASES) {
  const f = path.join(root, c.file);
  const orig = await readFile(f);
  try {
    await writeFile(f, c.apply(orig.toString("utf8")));
    const r = spawnSync(process.execPath, ["--test", GUARD], { cwd: root, encoding: "utf8" });
    const out = `${r.stdout}${r.stderr}`;
    const failed = out.split("\n").filter((l) => /^not ok /.test(l));
    const asserts = out.split("\n").filter((l) => /error: '|AssertionError|^\s+\+ |violation|drifted/.test(l)).slice(0, 4);
    const loadErr = /ERR_MODULE_NOT_FOUND|SyntaxError/.test(out);
    const red = r.status !== 0 && failed.length > 0 && !loadErr;
    if (!red) bad++;
    console.log(`\n=== ${red ? "RED (expected)" : "NOT RED"}: ${c.name} [${c.file}]`);
    console.log(`exit=${r.status}`);
    for (const l of failed) console.log(l);
    for (const l of asserts) console.log(l.slice(0, 220));
  } finally {
    await writeFile(f, orig);
  }
}
console.log(`\n${CASES.length - bad}/${CASES.length} mutations red`);
process.exit(bad ? 1 : 0);
