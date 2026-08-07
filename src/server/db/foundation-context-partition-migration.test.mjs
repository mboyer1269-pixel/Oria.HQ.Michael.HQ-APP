#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");
const migrationPath = path.join(projectRoot, "db/migrations/0028_foundation_context_partition_rls.sql");
const sql = readFileSync(migrationPath, "utf-8");
const executableSql = sql
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("0028 foundation context partition migration", () => {
  it("defines resolve_context_partition", () => {
    assert.match(executableSql, /resolve_context_partition/i);
  });

  it("adds mode_id and context_partition to action_ledger", () => {
    assert.match(executableSql, /alter table public\.action_ledger[\s\S]*mode_id/i);
    assert.match(executableSql, /alter table public\.action_ledger[\s\S]*context_partition/i);
  });

  it("adds mode_id and context_partition to agent_execution_intents", () => {
    assert.match(executableSql, /alter table public\.agent_execution_intents[\s\S]*mode_id/i);
    assert.match(executableSql, /alter table public\.agent_execution_intents[\s\S]*context_partition/i);
  });

  it("backfills mission_approvals.workspace_id", () => {
    assert.match(executableSql, /mission_approvals[\s\S]*workspace_id/i);
  });

  it("installs workspace scope enforcement trigger", () => {
    assert.match(executableSql, /enforce_workspace_scope/i);
  });
});
