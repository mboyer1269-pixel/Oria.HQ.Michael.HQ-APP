/**
 * System Map — honest live-vs-incubation reachability analysis.
 *
 * Walks the real import graph of the codebase starting from the surfaces that
 * actually run in production (the Next.js app tree + the proxy/middleware entry)
 * and labels every source module as:
 *
 *   - LIVE        reachable from an app entrypoint (route, page, layout, proxy)
 *   - TEST_ONLY   not live, but exercised by a *.test.mjs / smoke script
 *   - INCUBATION  not reachable from app or tests (built ahead of need)
 *
 * It deletes nothing. It moves nothing. It only tells the truth, repeatably,
 * so the repo stays legible as it grows.
 *
 * Outputs:
 *   - docs/system-map.json   machine-readable (used by the guard test)
 *   - docs/SYSTEM_MAP.md     human-readable architecture map
 *
 * Usage:
 *   node scripts/architecture/system-map.mjs           # write outputs
 *   node scripts/architecture/system-map.mjs --check    # fail if stale (CI)
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const SRC = path.join(ROOT, "src");
const SRC_REL = "src";

const SRC_EXTS = [".ts", ".tsx"];
const RESOLVE_EXTS = [".ts", ".tsx", ".mjs", ".js", ".json"];

/** Collect every source/test file under src/. */
async function walk(dir, acc = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, acc);
    } else if (entry.isFile()) {
      acc.push(full);
    }
  }
  return acc;
}

const toPosix = (p) => p.split(path.sep).join("/");
const relSrc = (abs) => toPosix(path.relative(ROOT, abs));

/** Resolve an import specifier from a file to an absolute file path, or null. */
async function resolveImport(spec, fromFile) {
  let base;
  if (spec.startsWith("@/")) {
    base = path.join(SRC, spec.slice(2));
  } else if (spec.startsWith("./") || spec.startsWith("../")) {
    base = path.resolve(path.dirname(fromFile), spec);
  } else {
    return null; // external / bare module — out of scope
  }

  // Exact file with extension already present.
  if (await isFile(base)) return base;
  // Try appending source extensions.
  for (const ext of RESOLVE_EXTS) {
    if (await isFile(base + ext)) return base + ext;
  }
  // Directory index.
  for (const ext of RESOLVE_EXTS) {
    const idx = path.join(base, "index" + ext);
    if (await isFile(idx)) return idx;
  }
  return null;
}

async function isFile(p) {
  try {
    const st = await fs.stat(p);
    return st.isFile();
  } catch {
    return false;
  }
}

const IMPORT_RE =
  /(?:import|export)\s+(?:[^'"]*?\sfrom\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

async function importsOf(file) {
  const code = await fs.readFile(file, "utf8");
  const specs = new Set();
  let m;
  while ((m = IMPORT_RE.exec(code)) !== null) {
    const spec = m[1] || m[2];
    if (spec) specs.add(spec);
  }
  return [...specs];
}

/** BFS the import graph from a set of root files. Returns a Set of abs paths. */
async function reachableFrom(roots, allFiles) {
  const known = new Set(allFiles);
  const seen = new Set();
  const queue = [...roots];
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    let specs;
    try {
      specs = await importsOf(file);
    } catch {
      continue;
    }
    for (const spec of specs) {
      const resolved = await resolveImport(spec, file);
      if (resolved && known.has(resolved) && !seen.has(resolved)) {
        queue.push(resolved);
      }
    }
  }
  return seen;
}

function isTestFile(rel) {
  return /\.test\.(mjs|ts|tsx)$/.test(rel) || /\/__tests__\//.test(rel);
}

function topArea(rel) {
  // rel like src/server/agents/foo.ts -> server/agents
  const parts = rel.split("/");
  if (parts[0] !== "src") return parts[0];
  return parts.slice(1, 3).join("/");
}

async function main() {
  const check = process.argv.includes("--check");
  const all = (await walk(SRC)).map((p) => p); // absolute
  const allRel = all.map(relSrc);

  const sourceFiles = all.filter((p) => {
    const rel = relSrc(p);
    return SRC_EXTS.includes(path.extname(p)) && !isTestFile(rel);
  });

  // Roots that actually run in production.
  const appRoots = all.filter((p) => {
    const rel = relSrc(p);
    return rel.startsWith("src/app/") && SRC_EXTS.includes(path.extname(p));
  });
  const proxy = all.filter((p) => /^src\/proxy\.(ts|tsx)$/.test(relSrc(p)));
  const appEntryRoots = [...appRoots, ...proxy];

  // Test/smoke roots.
  const testRoots = all.filter((p) => {
    const rel = relSrc(p);
    return isTestFile(rel) || rel.startsWith("src/scripts/smoke/");
  });

  const liveSet = await reachableFrom(appEntryRoots, all);
  const testSet = await reachableFrom(testRoots, all);

  const live = [];
  const testOnly = [];
  const incubation = [];

  for (const p of sourceFiles) {
    const rel = relSrc(p);
    if (rel.startsWith("src/app/")) {
      live.push(rel); // app tree is the surface itself
      continue;
    }
    if (liveSet.has(p)) live.push(rel);
    else if (testSet.has(p)) testOnly.push(rel);
    else incubation.push(rel);
  }

  live.sort();
  testOnly.sort();
  incubation.sort();

  const byArea = (list) => {
    const m = {};
    for (const rel of list) {
      const a = topArea(rel);
      m[a] = (m[a] || 0) + 1;
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  };

  const summary = {
    generatedBy: "scripts/architecture/system-map.mjs",
    totals: {
      sourceFiles: sourceFiles.length,
      live: live.length,
      testOnly: testOnly.length,
      incubation: incubation.length,
    },
    incubationByArea: Object.fromEntries(byArea(incubation)),
    live,
    testOnly,
    incubation,
  };

  const jsonPath = path.join(ROOT, "docs", "system-map.json");
  const mdPath = path.join(ROOT, "docs", "SYSTEM_MAP.md");

  const md = renderMarkdown(summary, byArea);
  const json = JSON.stringify(summary, null, 2) + "\n";

  if (check) {
    const prev = await fs.readFile(jsonPath, "utf8").catch(() => "");
    if (prev.trim() !== json.trim()) {
      console.error(
        "system-map is stale. Run: node scripts/architecture/system-map.mjs"
      );
      process.exit(1);
    }
    console.log("system-map up to date.");
    return;
  }

  await fs.writeFile(jsonPath, json);
  await fs.writeFile(mdPath, md);
  console.log(
    `System map written.\n  live:       ${live.length}\n  test-only:  ${testOnly.length}\n  incubation: ${incubation.length}`
  );
}

function renderMarkdown(summary, byArea) {
  const { totals } = summary;
  const lines = [];
  lines.push("# System Map — what is live vs incubation");
  lines.push("");
  lines.push(
    "> Auto-generated by `scripts/architecture/system-map.mjs`. Do not edit by hand."
  );
  lines.push("> Run `npm run map` to refresh. This file deletes nothing — it");
  lines.push("> classifies every source module by real import reachability.");
  lines.push("");
  lines.push("## Definitions");
  lines.push("");
  lines.push(
    "- **LIVE** — reachable from a Next.js app entrypoint (route, page, layout) or the proxy. This runs in production."
  );
  lines.push(
    "- **TEST_ONLY** — not reachable from the app, but exercised by a test or smoke script."
  );
  lines.push(
    "- **INCUBATION** — not reachable from the app or any test. Built ahead of need; not wired to anything yet."
  );
  lines.push("");
  lines.push("## Totals");
  lines.push("");
  lines.push("| Class | Files |");
  lines.push("|---|---|");
  lines.push(`| LIVE | ${totals.live} |`);
  lines.push(`| TEST_ONLY | ${totals.testOnly} |`);
  lines.push(`| INCUBATION | ${totals.incubation} |`);
  lines.push(`| **Total source** | **${totals.sourceFiles}** |`);
  lines.push("");
  lines.push("## Incubation by area (built, not wired)");
  lines.push("");
  lines.push("| Area | Incubation files |");
  lines.push("|---|---|");
  for (const [area, n] of byArea(summary.incubation)) {
    lines.push(`| ${area} | ${n} |`);
  }
  lines.push("");
  lines.push("## Incubation files (full list)");
  lines.push("");
  lines.push(
    "These are healthy to keep — they are tested scaffolding. But nothing in the running product depends on them yet. Wire them to a route/page to graduate them to LIVE."
  );
  lines.push("");
  for (const rel of summary.incubation) {
    lines.push(`- \`${rel}\``);
  }
  lines.push("");
  return lines.join("\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
