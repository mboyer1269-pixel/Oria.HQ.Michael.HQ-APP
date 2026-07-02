/**
 * Layering guard — keeps the dependency arrow pointing downward.
 *
 * Enforces only the rules that are CURRENTLY clean (zero violations), so CI
 * stays green and catches *regressions* of what has been deliberately fixed.
 * Broader, not-yet-clean dependencies are reported as "tracked debt" (no fail)
 * so the honest picture stays visible without blocking.
 *
 * Tighten ENFORCED as debt is paid down. Never relax it to make a regression
 * pass — fix the import instead.
 *
 * Usage:
 *   node scripts/architecture/check-layering.mjs          # report + enforce
 *   node scripts/architecture/check-layering.mjs --quiet  # only print on fail
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const SRC = path.join(ROOT, "src");

const SRC_EXTS = new Set([".ts", ".tsx"]);
const isTest = (rel) => /\.test\.(mjs|ts|tsx)$/.test(rel) || /\/__tests__\//.test(rel);
const toPosix = (p) => p.split(path.sep).join("/");

async function walk(dir, acc = []) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, acc);
    else if (e.isFile()) acc.push(full);
  }
  return acc;
}

const IMPORT_RE =
  /(?:import|export)\s+(?:[^'"]*?\sfrom\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

async function importsOf(file) {
  const code = await fs.readFile(file, "utf8");
  const out = [];
  let m;
  while ((m = IMPORT_RE.exec(code)) !== null) {
    const spec = m[1] || m[2];
    if (spec) out.push(spec);
  }
  return out;
}

/**
 * ENFORCED rules — each currently has zero violations. A new violation fails CI.
 *   from:    source subtree (relative to src/)
 *   forbid:  predicate on the import specifier that must NOT match
 */
const ENFORCED = [
  {
    label: "server source must not import feature TYPE modules (use @/core/types)",
    from: "server",
    forbid: (s) => /^@\/features\/[a-z-]+\/types$/.test(s),
  },
  {
    label: "core must not import from the features layer",
    from: "core",
    forbid: (s) => s.startsWith("@/features/") || s === "@/features",
  },
  {
    label: "lib must not import from the features layer",
    from: "lib",
    forbid: (s) => s.startsWith("@/features/") || s === "@/features",
  },
];

/**
 * TRACKED DEBT — broader inversions that are NOT yet clean. Reported, never
 * fails. Drive these to zero, then promote the rule into ENFORCED.
 */
const TRACKED = [
  {
    label: "server -> features (seed data + venture domain logic) — debt #2",
    from: "server",
    match: (s) => s.startsWith("@/features/"),
  },
  {
    label: "core -> server (workspace-context) — debt #2",
    from: "core",
    match: (s) => s.startsWith("@/server/"),
  },
  {
    label: "lib -> server (supabase db types) — acceptable infra coupling",
    from: "lib",
    match: (s) => s.startsWith("@/server/"),
  },
];

async function collect(fromDir, predicate) {
  const base = path.join(SRC, fromDir);
  const files = (await walk(base)).filter((p) => {
    const rel = toPosix(path.relative(ROOT, p));
    return SRC_EXTS.has(path.extname(p)) && !isTest(rel);
  });
  const hits = [];
  for (const f of files) {
    const rel = toPosix(path.relative(ROOT, f));
    for (const spec of await importsOf(f)) {
      if (predicate(spec)) hits.push(`${rel}  ->  ${spec}`);
    }
  }
  return hits;
}

async function main() {
  const quiet = process.argv.includes("--quiet");
  const violations = [];

  for (const rule of ENFORCED) {
    const hits = await collect(rule.from, rule.forbid);
    if (hits.length) violations.push({ rule, hits });
  }

  if (!quiet) {
    console.log("Layering guard — tracked debt (informational):");
    for (const rule of TRACKED) {
      const hits = await collect(rule.from, rule.match);
      console.log(`  ${hits.length.toString().padStart(3)}  ${rule.label}`);
    }
    console.log("");
  }

  if (violations.length === 0) {
    console.log("Layering guard: OK — all enforced rules clean.");
    return;
  }

  console.error("Layering guard: FAILED — enforced rule(s) regressed:\n");
  for (const { rule, hits } of violations) {
    console.error(`  RULE: ${rule.label}`);
    for (const h of hits) console.error(`    ${h}`);
    console.error("");
  }
  console.error(
    "Fix the import (point it at @/core/types or the correct layer). Do not relax the guard."
  );
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
