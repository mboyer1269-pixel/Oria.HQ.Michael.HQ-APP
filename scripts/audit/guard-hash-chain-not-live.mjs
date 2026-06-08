#!/usr/bin/env node
/**
 * guard-hash-chain-not-live.mjs — read-only "don't activate the chain by
 * accident" tripwire for CI.
 *
 * The hash-chain migration is mandate-gated. This guard fails CLOSED if the
 * repo drifts toward live activation without an explicit GO:
 *
 *   1. No NUMBERED migration (db/migrations/NNNN_*.sql) may contain hash-chain
 *      DDL. The migration must stay under db/migrations/drafts/ until GO; at GO
 *      it is promoted to a numbered file AND this guard is relaxed in the same
 *      reviewed PR (see docs/security/action-ledger-hash-chain-migration-runbook.md).
 *   2. The live write flag (hash-chain-write-flag.ts) must keep its fail-safe
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

// ── Check 1: no hash-chain DDL in the numbered (applyable) migration sequence ──
const NUMBERED = /^\d{4}_.*\.sql$/i;
const CHAIN_DDL = [
  /\bentry_hash\b/i,
  /\bprev_hash\b/i,
  /action_ledger_immutable/i,
  /action_ledger_block_mutations/i,
  /before\s+update\s+or\s+delete/i,
];

let numbered = [];
try {
  // Non-recursive: db/migrations/drafts/ is intentionally excluded.
  numbered = readdirSync(migrationsDir).filter((f) => NUMBERED.test(f));
} catch (err) {
  failures.push(`cannot read ${migrationsDir}: ${err.message}`);
}

for (const file of numbered) {
  const body = readFileSync(path.join(migrationsDir, file), "utf8");
  const hit = CHAIN_DDL.find((re) => re.test(body));
  if (hit) {
    failures.push(
      `numbered migration ${file} contains hash-chain DDL (${hit}). This would activate the live chain. ` +
        `Promotion requires explicit GO — relax this guard in the same reviewed PR ` +
        `(docs/security/action-ledger-hash-chain-migration-runbook.md).`,
    );
  }
}

// ── Check 2: live write flag stays OFF by default ─────────────────────────────
const flagPath = path.join(repoRoot, "src", "server", "ledger", "hash-chain-write-flag.ts");
try {
  const flag = readFileSync(flagPath, "utf8");
  if (!/return false/.test(flag)) {
    failures.push("hash-chain-write-flag.ts: lost its fail-safe `return false` default.");
  }
  if (/return true\b/.test(flag)) {
    failures.push("hash-chain-write-flag.ts: contains an unconditional `return true` — the flag must default OFF.");
  }
} catch (err) {
  failures.push(`cannot read hash-chain-write-flag.ts: ${err.message}`);
}

if (failures.length > 0) {
  console.error(`[guard-not-live] FAIL — ${failures.length} issue(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = 1;
} else {
  console.log(
    "[guard-not-live] OK — no hash-chain DDL in the numbered migration sequence; write flag defaults OFF",
  );
  process.exitCode = 0;
}
