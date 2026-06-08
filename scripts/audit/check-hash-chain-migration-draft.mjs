#!/usr/bin/env node
/**
 * check-hash-chain-migration-draft.mjs — read-only static validator.
 *
 * Statically asserts the hash-chain migration DRAFT under
 * db/migrations/drafts/ is structurally complete and that every object it
 * creates is dropped by the matching revert (so rollback is symmetric). It also
 * confirms the post-apply verify.sql is read-only and that no HMAC key is
 * embedded in any draft.
 *
 * Pure: reads only the draft files. No DB, no env, no migration apply. Fails
 * CLOSED (exit 1) on any missing piece so CI catches an incomplete draft before
 * it ever reaches GO.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const draftsDir = path.resolve(here, "..", "..", "db", "migrations", "drafts");

const failures = [];
const check = (cond, msg) => {
  if (!cond) failures.push(msg);
};

function read(name) {
  try {
    return readFileSync(path.join(draftsDir, name), "utf8").toLowerCase();
  } catch (err) {
    failures.push(`cannot read ${name}: ${err.message}`);
    return "";
  }
}

const columns = read("action_ledger_hash_chain_01_columns.sql");
const columnsRevert = read("action_ledger_hash_chain_01_columns_revert.sql");
const seal = read("action_ledger_hash_chain_02_seal.sql");
const sealRevert = read("action_ledger_hash_chain_02_seal_revert.sql");
const verify = read("action_ledger_hash_chain_verify.sql");

const CHAIN_COLUMNS = ["prev_hash", "entry_hash", "hmac", "canonical_version"];
const INDEXES = [
  "action_ledger_genesis_unique",
  "action_ledger_prev_hash_unique",
  "action_ledger_entry_hash_unique",
];

// Phase 1 — columns added and dropped.
for (const c of CHAIN_COLUMNS) {
  check(columns.includes(`add column if not exists ${c}`), `01_columns: missing add column ${c}`);
  check(
    columnsRevert.includes(`drop column if exists ${c}`),
    `01_columns_revert: missing drop column ${c}`,
  );
}

// Phase 2 — indexes + trigger created and dropped.
for (const idx of INDEXES) {
  check(seal.includes(`create unique index if not exists ${idx}`), `02_seal: missing index ${idx}`);
  check(sealRevert.includes(`drop index if exists`) && sealRevert.includes(idx), `02_seal_revert: missing drop index ${idx}`);
}
check(
  seal.includes("before update or delete on public.action_ledger"),
  "02_seal: missing append-only (BEFORE UPDATE OR DELETE) trigger timing",
);
check(seal.includes("create trigger action_ledger_immutable"), "02_seal: missing immutability trigger");
check(seal.includes("action_ledger_block_mutations"), "02_seal: missing trigger function");
check(
  sealRevert.includes("drop trigger if exists action_ledger_immutable"),
  "02_seal_revert: missing drop trigger",
);
check(
  sealRevert.includes("drop function if exists public.action_ledger_block_mutations"),
  "02_seal_revert: missing drop function",
);

// Drafts must declare they are not applied.
check(columns.includes("draft"), "01_columns: missing DRAFT marker");
check(seal.includes("draft"), "02_seal: missing DRAFT marker");

// verify.sql must be strictly read-only: no statement (ignoring -- comments)
// may START with a DDL/DML keyword. Checking the leading keyword avoids false
// positives on identifiers like on_delete / on_update / created_at.
const verifyLines = verify
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("--"));
check(
  verifyLines.some((l) => l.startsWith("select")),
  "verify.sql: expected SELECT statements",
);
const FORBIDDEN_START = ["insert", "update", "delete", "drop", "alter", "create", "truncate", "grant", "revoke"];
for (const line of verifyLines) {
  const firstWord = line.split(/\s+/)[0];
  check(
    !FORBIDDEN_START.includes(firstWord),
    `verify.sql must be read-only — statement starts with '${firstWord}'`,
  );
}

// No HMAC key may ever be embedded in a draft.
for (const [name, body] of [
  ["01_columns", columns],
  ["02_seal", seal],
  ["verify", verify],
]) {
  check(!body.includes("ledger_hmac_key ="), `${name}: must not embed an HMAC key`);
}

if (failures.length > 0) {
  console.error(`[check-migration-draft] FAIL — ${failures.length} issue(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = 1;
} else {
  console.log(
    "[check-migration-draft] OK — draft complete, revert symmetric, verify.sql read-only, no embedded key",
  );
  process.exitCode = 0;
}
