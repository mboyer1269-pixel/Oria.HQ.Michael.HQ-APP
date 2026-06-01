#!/usr/bin/env node

// src/server/db/ventures-migration.test.mjs
//
// PR148 — guard test for the ventures migration. This is the risky zone
// (Supabase/RLS/migration), so the test pins the safety invariants:
//   * the table exists and RLS is enabled;
//   * anon + authenticated are blocked by RESTRICTIVE policies on every op;
//   * no permissive "using (true)" can creep in;
//   * service_role is never named in a policy (bypassrls makes it a no-op);
//   * the status/source CHECK whitelists match the TypeScript contracts exactly;
//   * no execution-authorization column exists (ventures never execute).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");
const migrationPath = path.join(projectRoot, "db/migrations/0009_ventures.sql");
const sql = readFileSync(migrationPath, "utf8").toLowerCase();
// Executable SQL only (drop `--` comment lines) so prose in the header/rollback
// block cannot trip the permissive-access checks below.
const executableSql = sql
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const STATUSES = [
  "discovered",
  "candidate",
  "scored",
  "shortlisted",
  "approved_for_validation",
  "validating",
  "operating",
  "autonomous",
  "scaling",
  "paused",
  "killed",
  "archived",
];

const SOURCES = [
  "human_created",
  "agent_suggested",
  "market_scan",
  "imported",
  "reworked_from_old_idea",
];

test("ventures migration (PR148)", async (t) => {
  await t.test("creates the table and a workspace-scoped column", () => {
    assert.ok(/create table if not exists public\.ventures/.test(sql));
    assert.ok(/workspace_id text not null/.test(sql));
  });

  await t.test("enables row level security", () => {
    assert.ok(/alter table public\.ventures enable row level security/.test(sql));
  });

  await t.test("blocks anon and authenticated on every operation, restrictively", () => {
    for (const op of ["select", "insert", "update", "delete"]) {
      for (const role of ["anon", "authenticated"]) {
        const policy = `ventures_block_${role}_${op}`;
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

  await t.test("has no execution-authorization column (ventures never execute)", () => {
    assert.ok(!/execution_authorized/.test(executableSql));
    assert.ok(!/authorize_execution/.test(executableSql));
  });

  await t.test("indexes workspace_id and updated_at", () => {
    assert.ok(/ventures_workspace_id_idx/.test(sql));
    assert.ok(/ventures_updated_at_idx/.test(sql));
  });

  await t.test("documents a full rollback", () => {
    assert.ok(/drop table if exists public\.ventures/.test(sql));
  });

  await t.test("status whitelist matches the VentureLifecycleStatus contract exactly", async () => {
    for (const status of STATUSES) {
      assert.ok(sql.includes(`'${status}'`), `migration CHECK missing status: ${status}`);
    }

    const { createJiti } = await import("jiti");
    const jiti = createJiti(import.meta.url, {
      alias: {
        "@": path.join(projectRoot, "src"),
        "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
      },
    });
    const mappingMod = await jiti.import(
      path.join(projectRoot, "src/server/ventures/venture-row-mapping.ts"),
    );
    const { VENTURE_STATUSES } = mappingMod;
    assert.deepEqual([...VENTURE_STATUSES].sort(), [...STATUSES].sort());
  });

  await t.test("source whitelist matches the VentureSource contract exactly", async () => {
    for (const source of SOURCES) {
      assert.ok(sql.includes(`'${source}'`), `migration CHECK missing source: ${source}`);
    }

    const { createJiti } = await import("jiti");
    const jiti = createJiti(import.meta.url, {
      alias: {
        "@": path.join(projectRoot, "src"),
        "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
      },
    });
    const mappingMod = await jiti.import(
      path.join(projectRoot, "src/server/ventures/venture-row-mapping.ts"),
    );
    const { VENTURE_SOURCES } = mappingMod;
    assert.deepEqual([...VENTURE_SOURCES].sort(), [...SOURCES].sort());
  });
});
