#!/usr/bin/env node

// src/server/db/agent-execution-intents-migration.test.mjs
//
// Static preflight audit for db/migrations/0024_agent_execution_intents.sql.
// Validates schema <-> repository parity and the safety/atomicity invariants the
// application layer relies on, WITHOUT connecting to any database. Uses only
// node:test, node:assert, node:fs, node:url -- no external dependencies.
//
// This is the CI half of the 0024 preflight: it proves the migration declares
// exactly what the repository reads/writes and the keys/indexes/RLS the atomic
// transition + approve/reject flows depend on. The functional half (real
// Postgres) is db/migrations/0024_agent_execution_intents_smoke.sql, run
// manually on a disposable database.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");
const migrationPath = path.join(
  projectRoot,
  "db/migrations/0024_agent_execution_intents.sql",
);

const sql = readFileSync(migrationPath, "utf-8");

// Strip comment lines so prose in comments cannot satisfy assertions meant to
// catch real SQL (e.g. the rollback block is commented out).
const executableSql = sql
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

// ---------------------------------------------------------------------------
// A. Table creation
// ---------------------------------------------------------------------------
describe("A. Table creation", () => {
  it("creates public.agent_execution_intents", () => {
    assert.ok(/create table/i.test(executableSql), "CREATE TABLE missing");
    assert.ok(
      /public\.agent_execution_intents/.test(executableSql),
      "table public.agent_execution_intents missing",
    );
  });

  it("defines id uuid primary key", () => {
    assert.ok(/id\s+uuid\s+primary key/i.test(executableSql), "id uuid primary key missing");
  });
});

// ---------------------------------------------------------------------------
// B. Schema <-> repository parity
// ---------------------------------------------------------------------------
// The exact column set the repository (AgentExecutionIntentRow / Insert in
// src/server/db/types.ts) reads and writes. If 0024 ever drops or renames one of
// these, the repository mapping breaks at runtime -- this guard catches it in CI.
const REPOSITORY_COLUMNS = [
  ["id", /id\s+uuid/i],
  ["workspace_id", /workspace_id\s+text\s+not null/i],
  ["created_by_user_id", /created_by_user_id\s+uuid\s+not null/i],
  ["intent_id", /intent_id\s+text\s+not null/i],
  ["agent_id", /agent_id\s+text\s+not null/i],
  ["skill_id", /skill_id\s+text\s+not null/i],
  ["tool_name", /tool_name\s+text\s+not null/i],
  ["autonomy_level", /autonomy_level\s+integer\s+not null/i],
  ["status", /status\s+text\s+not null/i],
  ["payload", /payload\s+jsonb\s+not null/i],
  ["action_ref", /action_ref\s+text\s+null/i],
  ["failure_code", /failure_code\s+text\s+null/i],
  ["requires_ceo_approval", /requires_ceo_approval\s+boolean\s+not null/i],
  ["created_at", /created_at\s+timestamptz/i],
  ["updated_at", /updated_at\s+timestamptz/i],
];

describe("B. Schema <-> repository parity (every column the repository uses)", () => {
  for (const [name, re] of REPOSITORY_COLUMNS) {
    it(`declares ${name} with the expected type`, () => {
      assert.ok(re.test(executableSql), `column ${name} missing or wrong type`);
    });
  }
});

// ---------------------------------------------------------------------------
// C. Status whitelist (matches AgentExecutionIntentStatus)
// ---------------------------------------------------------------------------
describe("C. Status whitelist CHECK", () => {
  it("has a status CHECK constraint", () => {
    assert.ok(
      /agent_execution_intents_status_check/i.test(executableSql),
      "status CHECK constraint missing",
    );
  });
  for (const status of ["pending", "executing", "executed", "failed"]) {
    it(`status CHECK includes '${status}'`, () => {
      assert.ok(executableSql.includes(`'${status}'`), `status CHECK missing '${status}'`);
    });
  }
});

// ---------------------------------------------------------------------------
// D. Safety invariants
// ---------------------------------------------------------------------------
describe("D. Safety invariants", () => {
  it("locks requires_ceo_approval = true via CHECK", () => {
    assert.ok(
      /requires_ceo_approval\s*=\s*true/i.test(executableSql),
      "CHECK locking requires_ceo_approval = true missing",
    );
  });

  it("constrains autonomy_level between 0 and 5", () => {
    assert.ok(
      /autonomy_level\s+between\s+0\s+and\s+5/i.test(executableSql),
      "autonomy_level range CHECK missing",
    );
  });
});

// ---------------------------------------------------------------------------
// E. Keys & indexes that the lookup + atomic UPDATE depend on
// ---------------------------------------------------------------------------
describe("E. Keys & indexes (lookup + atomic UPDATE WHERE status = expectedFrom)", () => {
  it("declares UNIQUE (workspace_id, intent_id) -- single-row pinpoint", () => {
    assert.ok(
      /agent_execution_intents_unique_per_workspace/i.test(executableSql),
      "unique constraint name missing",
    );
    assert.ok(
      /unique\s*\(\s*workspace_id\s*,\s*intent_id\s*\)/i.test(executableSql),
      "UNIQUE (workspace_id, intent_id) declaration missing",
    );
  });

  for (const idx of [
    "agent_execution_intents_workspace_id_idx",
    "agent_execution_intents_workspace_status_idx",
    "agent_execution_intents_workspace_created_idx",
    "agent_execution_intents_created_at_idx",
  ]) {
    it(`index ${idx} is declared`, () => {
      assert.ok(executableSql.includes(idx), `index ${idx} missing`);
    });
  }
});

// ---------------------------------------------------------------------------
// F. Row Level Security -- service-role only (restrictive block-all)
// ---------------------------------------------------------------------------
describe("F. RLS -- service-role only", () => {
  it("enables RLS on the table", () => {
    assert.ok(/enable row level security/i.test(executableSql), "ENABLE ROW LEVEL SECURITY missing");
  });

  it("declares RESTRICTIVE policies", () => {
    assert.ok(/as\s+restrictive/i.test(executableSql), "RESTRICTIVE policies missing");
  });

  // 8 block-all policies: anon + authenticated x select/insert/update/delete.
  for (const role of ["anon", "authenticated"]) {
    for (const op of ["select", "insert", "update", "delete"]) {
      it(`blocks ${role} ${op}`, () => {
        assert.ok(
          executableSql.includes(`agent_execution_intents_block_${role}_${op}`),
          `block policy for ${role} ${op} missing`,
        );
      });
    }
  }

  it("contains exactly 8 restrictive block policies", () => {
    const count = (executableSql.match(/agent_execution_intents_block_/g) || []).length;
    assert.equal(count, 8, `expected 8 block policies, found ${count}`);
  });

  it("does NOT grant permissive read (USING (true))", () => {
    assert.ok(
      !/using\s*\(\s*true\s*\)/i.test(executableSql),
      "USING (true) found -- no permissive client read allowed",
    );
  });

  it("does NOT grant permissive write (WITH CHECK (true))", () => {
    assert.ok(
      !/with\s+check\s*\(\s*true\s*\)/i.test(executableSql),
      "WITH CHECK (true) found -- no permissive client write allowed",
    );
  });
});
