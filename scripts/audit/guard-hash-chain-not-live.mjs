#!/usr/bin/env node
/**
 * guard-hash-chain-not-live.mjs — CI tripwire after CEO mandate activation.
 *
 * Ensures hash-chain promotion stays disciplined:
 *   1. DDL only in approved 0022/0023 slots with verify + revert siblings.
 *   2. Live writer is wired (planChainWrite / sealNewLedgerRow in repository).
 *   3. Write flag defaults ON (opt-out via LEDGER_HASH_CHAIN_WRITE=false).
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const migrationsDir = path.join(repoRoot, "db", "migrations");

const failures = [];

const NUMBERED = /^\d{4}_.*\.sql$/i;
const CHAIN_DDL = [
  /\bentry_hash\b/i,
  /\bprev_hash\b/i,
  /action_ledger_immutable/i,
  /action_ledger_block_mutations/i,
  /before\s+update\s+or\s+delete/i,
];

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
  numbered = readdirSync(migrationsDir).filter((f) => NUMBERED.test(f));
} catch (err) {
  failures.push(`cannot read ${migrationsDir}: ${err.message}`);
}
const numberedSet = new Set(numbered);

for (const file of numbered) {
  const body = readFileSync(path.join(migrationsDir, file), "utf8");
  const hit = CHAIN_DDL.find((re) => re.test(body));
  if (hit && !allow.has(file)) {
    failures.push(
      `numbered migration ${file} contains hash-chain DDL (${hit}) outside approved 0022/0023 slots.`,
    );
  }
}

for (const p of PROMOTIONS) {
  if (!numberedSet.has(p.forward)) continue;
  if (!numberedSet.has(p.verify)) failures.push(`promoted ${p.forward} is missing verify (${p.verify}).`);
  if (!numberedSet.has(p.revert)) failures.push(`promoted ${p.forward} is missing revert (${p.revert}).`);
}

const flagPath = path.join(repoRoot, "src", "server", "ledger", "hash-chain-write-flag.ts");
try {
  const flag = readFileSync(flagPath, "utf8");
  if (!/return true/.test(flag)) {
    failures.push("hash-chain-write-flag.ts: must default ON per CEO mandate (return true when unset).");
  }
} catch (err) {
  failures.push(`cannot read hash-chain-write-flag.ts: ${err.message}`);
}

const repoPath = path.join(repoRoot, "src", "server", "actions", "action-ledger-repository.ts");
try {
  const repo = readFileSync(repoPath, "utf8");
  if (!/sealNewLedgerRow/.test(repo)) {
    failures.push("action-ledger-repository.ts: live hash-chain writer not wired (sealNewLedgerRow missing).");
  }
  if (!/isHashChainWriteEnabled/.test(repo)) {
    failures.push("action-ledger-repository.ts: hash-chain flag not consulted on write path.");
  }
} catch (err) {
  failures.push(`cannot read action-ledger-repository.ts: ${err.message}`);
}

if (failures.length > 0) {
  console.error(`[guard-not-live] FAIL — ${failures.length} issue(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = 1;
} else {
  console.log(
    "[guard-not-live] OK — 0022/0023 promotion intact; live writer wired; hash-chain write defaults ON",
  );
  process.exitCode = 0;
}
