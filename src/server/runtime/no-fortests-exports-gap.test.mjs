#!/usr/bin/env node
// GAP (red on purpose, npm run test:gaps) — production modules under src/ must
// not export test hooks: no exported identifier matching /ForTests$/ (Architect:
// inject through factories such as createGovernedGuard(deps) /
// createApproveHandler(deps) instead). Static scan of non-test .ts/.tsx/.mjs/.js.
import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") yield* walk(p); }
    else if (/\.(ts|tsx|mjs|js)$/.test(e.name) && !/\.test\.(mjs|ts|js)$/.test(e.name) && !p.includes(`${path.sep}smoke${path.sep}`)) yield p;
  }
}
const DECL = /export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*ForTests)\b/g;
const LIST = /export\s*\{([^}]*)\}/g;

test("src/ exports no identifier matching /ForTests$/", async () => {
  const hits = [];
  for await (const f of walk(path.join(projectRoot, "src"))) {
    const src = await readFile(f, "utf8");
    for (const m of src.matchAll(DECL)) hits.push(`${path.relative(projectRoot, f)}: ${m[1]}`);
    for (const m of src.matchAll(LIST))
      for (const part of m[1].split(",")) {
        const name = part.trim().split(/\s+as\s+/).pop().trim();
        if (/ForTests$/.test(name)) hits.push(`${path.relative(projectRoot, f)}: ${name}`);
      }
  }
  assert.deepEqual(hits, [], `test hooks exported from production code:\n${hits.join("\n")}`);
});
