#!/usr/bin/env node

// src/server/db/action-ledger-workspace-scope-migration.test.mjs
// Guard test for the action ledger workspace scope migration. This file ensures
// the migration backfills legacy null workspace_id values and makes the
// column non-nullable.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");
const migrationPath = path.join(projectRoot, "db/migrations/0020_action_ledger_workspace_scope.sql");
const sql = readFileSync(migrationPath, "utf8").toLowerCase();

test("action ledger workspace scope migration (0020)", async (t) => {
  await t.test("backfills missing workspace_id values for existing rows", () => {
    assert.ok(
      /update public\.action_ledger\s+set workspace_id = 'michael-hq'/.test(sql),
      "migration must backfill missing workspace_id values",
    );
  });

  await t.test("makes workspace_id NOT NULL", () => {
    assert.ok(
      /alter table public\.action_ledger\s+alter column workspace_id set not null/.test(sql),
      "migration must make workspace_id non-nullable",
    );
  });

  await t.test("enables row level security for action_ledger", () => {
    assert.ok(
      /alter table public\.action_ledger\s+enable row level security/.test(sql),
      "migration must enable RLS on public.action_ledger",
    );
  });

  await t.test("does not introduce unsupported workspace claim filters", () => {
    assert.ok(
      !/current_setting\('app\.workspace_id', true\)/.test(sql),
      "migration must not reference unsupported app.workspace_id session settings",
    );
    assert.ok(
      !/create policy "action ledger workspace select" on public\.action_ledger/.test(sql),
      "migration must not create an unsupported workspace-scoped select policy",
    );
  });

  await t.test("does not use permissive using(true)", () => {
    assert.ok(
      !/using \(true\)/.test(sql),
      "migration must not contain using(true) in RLS policies",
    );
  });

  await t.test("indexes workspace_id for workspace-scoped reads", () => {
    assert.ok(
      /create index if not exists action_ledger_workspace_id_idx/.test(sql),
      "migration must create or preserve workspace_id index",
    );
  });
});
