#!/usr/bin/env node
/**
 * guard-mission-persistence-not-live.mjs — read-only "don't activate durable
 * mission persistence by accident" tripwire for CI.
 *
 * Durable mission-draft persistence is staging-gated. This guard fails CLOSED if
 * the repo drifts toward live activation without an explicit GO:
 *
 *   1. No NUMBERED migration (db/migrations/NNNN_*.sql) may create the
 *      mission_execution_attempts table. The migration must stay under
 *      db/migrations/drafts/ until an intentional GO promotion (relaxed in the
 *      same reviewed PR).
 *   2. The durable flag (mission-persistence-flag.ts) must keep its fail-safe
 *      OFF default — no unconditional enable.
 *
 * Pure: reads only repo files. No DB, no env, no apply.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const migrationsDir = path.join(repoRoot, "db", "migrations");

const failures = [];

// ── Check 1: mission_execution_attempts not in the numbered apply sequence ────
const NUMBERED = /^\d{4}_.*\.sql$/i;
const ATTEMPTS_DDL = /create table[^;]*\bmission_execution_attempts\b/i;

let numbered = [];
try {
  // Non-recursive: db/migrations/drafts/ is intentionally excluded.
  numbered = readdirSync(migrationsDir).filter((f) => NUMBERED.test(f));
} catch (err) {
  failures.push(`cannot read ${migrationsDir}: ${err.message}`);
}

for (const file of numbered) {
  const body = readFileSync(path.join(migrationsDir, file), "utf8");
  if (ATTEMPTS_DDL.test(body)) {
    failures.push(
      `numbered migration ${file} creates mission_execution_attempts. This activates durable mission persistence. ` +
        `Promotion requires explicit GO — relax this guard in the same reviewed PR.`,
    );
  }
}

// ── Check 2: durable mission-draft flag stays OFF by default ───────────────────
const flagPath = path.join(repoRoot, "src", "server", "missions", "mission-persistence-flag.ts");
try {
  const flag = readFileSync(flagPath, "utf8");
  if (!/return false/.test(flag)) {
    failures.push("mission-persistence-flag.ts: lost its fail-safe `return false` default.");
  }
  if (/return true\b/.test(flag)) {
    failures.push("mission-persistence-flag.ts: contains an unconditional `return true` — the flag must default OFF.");
  }
} catch (err) {
  failures.push(`cannot read mission-persistence-flag.ts: ${err.message}`);
}

if (failures.length > 0) {
  console.error(`[guard-mission-not-live] FAIL — ${failures.length} issue(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = 1;
} else {
  console.log(
    "[guard-mission-not-live] OK — mission_execution_attempts not in the numbered migration sequence; durable flag defaults OFF",
  );
  process.exitCode = 0;
}
