#!/usr/bin/env node

// src/server/db/governance-decisions-migration.test.mjs
//
// PR135 — guard test for the governance_decisions migration. This is the risky
// zone (Supabase/RLS/migration), so the test pins the safety invariants:
//   * the table exists and RLS is enabled;
//   * anon + authenticated are blocked by RESTRICTIVE policies on every op;
//   * no permissive "using (true)" can creep in;
//   * the no-execution / human-on-the-loop CHECK constraints are present;
//   * the outcome enum matches the TypeScript contract exactly.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");
const migrationPath = path.join(projectRoot, "db/migrations/0008_governance_decisions.sql");
const sql = readFileSync(migrationPath, "utf8").toLowerCase();
// Executable SQL only (drop `--` comment lines) so prose in the header/rollback
// block cannot trip the permissive-access checks below.
const executableSql = sql
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const DECIDED_OUTCOMES = [
  "approved_to_plan",
  "changes_requested",
  "rejected",
  "more_info_requested",
  "blocked_execution_request",
];

test("governance_decisions migration (PR135)", async (t) => {
  await t.test("creates the table and a workspace-scoped column", () => {
    assert.ok(/create table if not exists public\.governance_decisions/.test(sql));
    assert.ok(/workspace_id text not null/.test(sql));
    assert.ok(/work_order_id text not null/.test(sql));
    assert.ok(/bundle_id text not null/.test(sql));
  });

  await t.test("enables row level security", () => {
    assert.ok(/alter table public\.governance_decisions enable row level security/.test(sql));
  });

  await t.test("blocks anon and authenticated on every operation, restrictively", () => {
    for (const op of ["select", "insert", "update", "delete"]) {
      for (const role of ["anon", "authenticated"]) {
        const policy = `governance_decisions_block_${role}_${op}`;
        assert.ok(sql.includes(policy), `missing policy: ${policy}`);
      }
    }
    // Every governance policy is RESTRICTIVE (count matches the 8 block policies).
    const restrictiveCount = (sql.match(/as restrictive/g) ?? []).length;
    assert.equal(restrictiveCount, 8, "expected 8 restrictive block-all policies");
  });

  await t.test("introduces no permissive public access", () => {
    assert.ok(!/using \(true\)/.test(executableSql), "no policy may open the table with using (true)");
    assert.ok(!/with check \(true\)/.test(executableSql), "no policy may open the table with check (true)");
    // service_role is never named in an actual policy: bypassrls makes policies
    // no-ops for it, and listing it would be misleading rather than protective.
    assert.ok(!/to service_role/.test(executableSql), "service_role must not be named in any policy");
  });

  await t.test("pins the no-execution / human-on-the-loop safety belts at the DB level", () => {
    assert.ok(/human_on_the_loop = true/.test(sql));
    assert.ok(/no_execution_authorized = true/.test(sql));
  });

  await t.test("indexes workspace_id and created_at", () => {
    assert.ok(/governance_decisions_workspace_id_idx/.test(sql));
    assert.ok(/governance_decisions_created_at_idx/.test(sql));
  });

  await t.test("documents a full rollback", () => {
    assert.ok(/drop table if exists public\.governance_decisions/.test(sql));
  });

  await t.test("outcome enum matches the TypeScript contract exactly", async () => {
    // Every decided outcome must appear in the CHECK constraint.
    for (const outcome of DECIDED_OUTCOMES) {
      assert.ok(sql.includes(`'${outcome}'`), `migration CHECK missing outcome: ${outcome}`);
    }

    // …and the contract must accept exactly those outcomes.
    const { createJiti } = await import("jiti");
    const jiti = createJiti(import.meta.url, {
      alias: {
        "@": path.join(projectRoot, "src"),
        "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
      },
    });
    const contractMod = await jiti.import(
      path.join(projectRoot, "src/server/agents/work-order-governance-decision-contract.ts"),
    );
    const { isGovernanceDecisionOutcome } = contractMod;
    for (const outcome of DECIDED_OUTCOMES) {
      assert.equal(isGovernanceDecisionOutcome(outcome), true, `contract rejects ${outcome}`);
    }
    assert.equal(isGovernanceDecisionOutcome("preview"), false);
    assert.equal(isGovernanceDecisionOutcome("awaiting_review"), false);
  });
});
