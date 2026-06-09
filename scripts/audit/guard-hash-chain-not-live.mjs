#!/usr/bin/env node
/**
 * guard-hash-chain-not-live.mjs — read-only "don't activate the chain by
 * accident" tripwire for CI.
 *
 * The hash-chain migration is mandate-gated. This guard fails CLOSED if the
 * repo drifts toward live activation without an explicit GO:
 *
 *   1. Hash-chain DDL may appear in a NUMBERED migration ONLY inside the
 *      explicitly approved staging-promotion slots (0022 Phase 1 columns, 0023
 *      Phase 2 seal), and ONLY when each promoted forward also ships its
 *      read-only verify and its revert siblings (no promotion without a rollback
 *      path). Hash-chain DDL in any other numbered file fails CLOSED — keep it
 *      under db/migrations/drafts/ (see
 *      docs/security/action-ledger-hash-chain-migration-runbook.md).
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

// ── Check 1: hash-chain DDL only in the approved promotion slots ──────────────
const NUMBERED = /^\d{4}_.*\.sql$/i;
const CHAIN_DDL = [
  /\bentry_hash\b/i,
  /\bprev_hash\b/i,
  /action_ledger_immutable/i,
  /action_ledger_block_mutations/i,
  /before\s+update\s+or\s+delete/i,
];

// Explicit, reviewed GO promotion (staging-first). Each forward migration may
// live in the numbered sequence ONLY at its slot, and ONLY alongside its
// read-only verify and its revert. The forward, verify, and revert of an
// approved unit all legitimately mention chain identifiers, so all three are
// allowlisted; chain DDL anywhere else fails CLOSED.
const PROMOTIONS = [
  { forward: "0022_action_ledger_hash_chain_phase1.sql" },
  { forward: "0023_action_ledger_hash_chain_phase2.sql" },
];
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

// 1a) Chain DDL may appear only inside an allowlisted promotion unit.
for (const file of numbered) {
  const body = readFileSync(path.join(migrationsDir, file), "utf8");
  const hit = CHAIN_DDL.find((re) => re.test(body));
  if (hit && !allow.has(file)) {
    failures.push(
      `numbered migration ${file} contains hash-chain DDL (${hit}) outside the approved 0022/0023 promotion slots. ` +
        `This would activate the live chain without GO — keep it under db/migrations/drafts/ ` +
        `(docs/security/action-ledger-hash-chain-migration-runbook.md).`,
    );
  }
}

// 1b) A promoted forward must ship its verify + revert (no rollback-less GO).
for (const p of PROMOTIONS) {
  if (!numberedSet.has(p.forward)) continue; // not promoted yet — drafts-only state
  if (!numberedSet.has(p.verify)) failures.push(`promoted ${p.forward} is missing its read-only verify (${p.verify}).`);
  if (!numberedSet.has(p.revert)) failures.push(`promoted ${p.forward} is missing its revert (${p.revert}).`);
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
    "[guard-not-live] OK — hash-chain DDL only in the approved 0022/0023 promotion (verify + revert present); write flag defaults OFF",
  );
  process.exitCode = 0;
}
