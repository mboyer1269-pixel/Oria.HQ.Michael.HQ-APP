#!/usr/bin/env node
/**
 * guard-mission-persistence-not-live.mjs — read-only "don't activate durable
 * mission persistence by accident" tripwire for CI.
 *
 * Durable mission-draft persistence is staging-gated. This guard fails CLOSED if
 * the repo drifts toward live activation without an explicit GO:
 *
 *   1. The mission_execution_attempts DDL may appear in a NUMBERED migration
 *      ONLY inside the explicitly approved staging-promotion slot (0021), and
 *      ONLY when that forward migration also ships its read-only verify and its
 *      revert siblings (no promotion without a rollback path). The DDL in any
 *      other numbered file fails CLOSED — keep it under db/migrations/drafts/.
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

// ── Check 1: mission_execution_attempts only in the approved promotion slot ───
const NUMBERED = /^\d{4}_.*\.sql$/i;
const ATTEMPTS_DDL = /create table[^;]*\bmission_execution_attempts\b/i;

// Explicit, reviewed GO promotion (staging-first). The forward migration may
// live in the numbered sequence ONLY at this slot, and ONLY alongside its
// read-only verify and its revert (the rollback path). Anything else fails.
const PROMOTIONS = [{ forward: "0021_mission_persistence_completion.sql" }];
const allow = new Set();
for (const p of PROMOTIONS) {
  const base = p.forward.replace(/\.sql$/i, "");
  p.verify = `${base}_verify.sql`;
  p.revert = `${base}_revert.sql`;
  allow.add(p.forward).add(p.verify).add(p.revert);
}

let numbered = [];
try {
  // Non-recursive: db/migrations/drafts/ is intentionally excluded.
  numbered = readdirSync(migrationsDir).filter((f) => NUMBERED.test(f));
} catch (err) {
  failures.push(`cannot read ${migrationsDir}: ${err.message}`);
}
const numberedSet = new Set(numbered);

// 1a) The DDL may appear only inside an allowlisted promotion unit.
for (const file of numbered) {
  const body = readFileSync(path.join(migrationsDir, file), "utf8");
  if (ATTEMPTS_DDL.test(body) && !allow.has(file)) {
    failures.push(
      `numbered migration ${file} creates mission_execution_attempts outside the approved promotion slot. ` +
        `This activates durable mission persistence without GO — keep it under db/migrations/drafts/ ` +
        `or use the reviewed 0021 promotion slot.`,
    );
  }
}

// 1b) A promoted forward must ship its verify + revert (no rollback-less GO).
for (const p of PROMOTIONS) {
  if (!numberedSet.has(p.forward)) continue; // not promoted yet — drafts-only state
  if (!numberedSet.has(p.verify)) failures.push(`promoted ${p.forward} is missing its read-only verify (${p.verify}).`);
  if (!numberedSet.has(p.revert)) failures.push(`promoted ${p.forward} is missing its revert (${p.revert}).`);
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
    "[guard-mission-not-live] OK — mission_execution_attempts DDL only in the approved 0021 promotion (verify + revert present); durable flag defaults OFF",
  );
  process.exitCode = 0;
}
