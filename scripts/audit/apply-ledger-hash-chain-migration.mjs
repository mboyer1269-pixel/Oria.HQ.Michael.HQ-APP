#!/usr/bin/env node
/**
 * apply-ledger-hash-chain-migration.mjs
 *
 * Applies migrations 0022 (Phase 1 columns) and 0023 (Phase 2 seal) to the
 * database pointed at by LIVE_DATABASE_URL or DATABASE_URL.
 *
 * CEO mandate 2026-08-08: staging/production apply is operator-driven.
 * This script never prints secrets and fails closed without a connection string.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const migrationsDir = path.join(repoRoot, "db", "migrations");

const MIGRATIONS = [
  "0022_action_ledger_hash_chain_phase1.sql",
  "0023_action_ledger_hash_chain_phase2.sql",
];

function resolveDatabaseUrl() {
  return process.env.LIVE_DATABASE_URL ?? process.env.DATABASE_URL ?? null;
}

async function applyWithPg(url, sql, label) {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
    console.log(`[ledger:apply-migration] OK — ${label}`);
  } finally {
    await client.end();
  }
}

async function main() {
  const url = resolveDatabaseUrl();
  if (!url) {
    console.error(
      "[ledger:apply-migration] FAIL — set LIVE_DATABASE_URL or DATABASE_URL to apply migrations.",
    );
    console.error(
      "[ledger:apply-migration] Manual apply order:\n" +
        MIGRATIONS.map((m) => `  psql $DATABASE_URL -f db/migrations/${m}`).join("\n"),
    );
    process.exitCode = 1;
    return;
  }

  let pgAvailable = true;
  try {
    await import("pg");
  } catch {
    pgAvailable = false;
  }

  if (!pgAvailable) {
    console.error(
      "[ledger:apply-migration] FAIL — `pg` package not installed. Run migrations manually:",
    );
    for (const file of MIGRATIONS) {
      console.error(`  psql <connection> -f db/migrations/${file}`);
    }
    process.exitCode = 1;
    return;
  }

  for (const file of MIGRATIONS) {
    const fullPath = path.join(migrationsDir, file);
    const sql = readFileSync(fullPath, "utf8");
    await applyWithPg(url, sql, file);
  }

  console.log(
    "[ledger:apply-migration] DONE — verify with db/migrations/0022_*_verify.sql and 0023_*_verify.sql",
  );
  console.log(
    "[ledger:apply-migration] Ensure LEDGER_HMAC_KEY is provisioned in the target environment.",
  );
}

main().catch((err) => {
  console.error(`[ledger:apply-migration] FAIL — ${err.message}`);
  process.exitCode = 1;
});
