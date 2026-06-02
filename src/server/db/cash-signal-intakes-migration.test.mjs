#!/usr/bin/env node

// src/server/db/cash-signal-intakes-migration.test.mjs
//
// Guard test for the cash_signal_intakes migration. This is the risky zone
// (Supabase/RLS/migration), so the test pins the safety invariants:
//   * the table exists and is workspace-scoped + owner-stamped;
//   * RLS is enabled;
//   * anon + authenticated are blocked by RESTRICTIVE policies on every op;
//   * no permissive "using (true)" can creep in;
//   * service_role is never named in a policy (bypassrls makes it a no-op);
//   * the signal_type CHECK whitelist matches the CashSignalType contract;
//   * the strict accounting invariant (positive amount requires verified
//     financial signal) is present;
//   * no execution-authorization column exists (intakes never execute).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");
const migrationPath = path.join(projectRoot, "db/migrations/0012_cash_signal_intakes.sql");
const sql = readFileSync(migrationPath, "utf8").toLowerCase();
const executableSql = sql
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const SIGNAL_TYPES = [
  "stripe_charge",
  "signed_loi",
  "email_reply",
  "meeting_booked",
  "verbal_commitment",
  "manual_note",
];

test("cash_signal_intakes migration (0012)", async (t) => {
  await t.test("creates the table, workspace-scoped and owner-stamped", () => {
    assert.ok(/create table if not exists public\.cash_signal_intakes/.test(sql));
    assert.ok(/workspace_id text not null/.test(sql));
    assert.ok(/captured_by_user_id uuid not null/.test(sql));
  });

  await t.test("enables row level security", () => {
    assert.ok(/alter table public\.cash_signal_intakes enable row level security/.test(sql));
  });

  await t.test("blocks anon and authenticated on every operation, restrictively", () => {
    for (const op of ["select", "insert", "update", "delete"]) {
      for (const role of ["anon", "authenticated"]) {
        const policy = `cash_signal_intakes_block_${role}_${op}`;
        assert.ok(sql.includes(policy), `missing policy: ${policy}`);
      }
    }
    const restrictiveCount = (sql.match(/as restrictive/g) ?? []).length;
    assert.equal(restrictiveCount, 8, "expected 8 restrictive block-all policies");
  });

  await t.test("introduces no permissive public access", () => {
    assert.ok(!/using \(true\)/.test(executableSql), "no policy may open the table with using (true)");
    assert.ok(!/with check \(true\)/.test(executableSql), "no policy may open the table with check (true)");
    assert.ok(!/to service_role/.test(executableSql), "service_role must not be named in any policy");
  });

  await t.test("has no execution-authorization column (intakes never execute)", () => {
    assert.ok(!/execution_authorized/.test(executableSql));
    assert.ok(!/authorize_execution/.test(executableSql));
    assert.ok(!/dispatch/.test(executableSql));
  });

  await t.test("enforces the strict accounting invariant at the DB", () => {
    // A positive amount requires a verified financial signal.
    assert.ok(
      /cash_signal_intakes_cash_requires_verified_financial_check/.test(sql),
      "missing the cash-requires-verified-financial CHECK",
    );
    assert.ok(/is_verified = true and signal_type in \('stripe_charge', 'signed_loi'\)/.test(sql));
    // amount must be non-negative.
    assert.ok(/cash_signal_intakes_amount_nonneg_check/.test(sql));
  });

  await t.test("indexes workspace_id and created_at", () => {
    assert.ok(/cash_signal_intakes_workspace_id_idx/.test(sql));
    assert.ok(/cash_signal_intakes_created_at_idx/.test(sql));
  });

  await t.test("documents a full rollback", () => {
    assert.ok(/drop table if exists public\.cash_signal_intakes/.test(sql));
  });

  await t.test("signal_type whitelist matches the CashSignalType contract exactly", async () => {
    for (const type of SIGNAL_TYPES) {
      assert.ok(sql.includes(`'${type}'`), `migration CHECK missing signal type: ${type}`);
    }

    const { createJiti } = await import("jiti");
    const jiti = createJiti(import.meta.url, {
      alias: {
        "@": path.join(projectRoot, "src"),
        "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
      },
    });
    const packetMod = await jiti.import(
      path.join(projectRoot, "src/features/ventures/cash-action-packet.ts"),
    );
    const { CASH_SIGNAL_TYPES } = packetMod;
    assert.deepEqual([...CASH_SIGNAL_TYPES].sort(), [...SIGNAL_TYPES].sort());
  });
});
