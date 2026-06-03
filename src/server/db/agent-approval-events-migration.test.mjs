#!/usr/bin/env node

// src/server/db/agent-approval-events-migration.test.mjs
//
// Static smoke test for db/migrations/0010_agent_review_approval_events.sql.
// Validates safety-critical invariants without connecting to any database.
// Uses only node:test, node:assert, node:fs, node:url — no external dependencies.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");
const migrationPath = path.join(
  projectRoot,
  "db/migrations/0010_agent_review_approval_events.sql",
);

const sql = readFileSync(migrationPath, "utf-8");

// Strip comment lines so prose in comments cannot accidentally satisfy assertions
// that are meant to catch actual SQL keywords (e.g. USING (true) mentioned in a
// comment about what is NOT allowed).
const executableSql = sql
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");
const executableSqlLower = executableSql.toLowerCase();

// ---------------------------------------------------------------------------
// A. Table creation
// ---------------------------------------------------------------------------
describe("A. Table creation", () => {
  it("creates agent_review_approval_events table", () => {
    assert.ok(
      /create table/i.test(sql),
      "CREATE TABLE statement missing",
    );
    assert.ok(
      sql.includes("agent_review_approval_events"),
      "table name 'agent_review_approval_events' missing",
    );
  });

  it("defines id uuid primary key", () => {
    assert.ok(/id\s+uuid/i.test(sql), "id uuid column missing");
  });

  it("defines user_id uuid not null", () => {
    assert.ok(
      /user_id\s+uuid\s+not null/i.test(sql),
      "user_id uuid NOT NULL missing",
    );
  });

  it("defines source_packet_id text not null", () => {
    assert.ok(
      /source_packet_id\s+text\s+not null/i.test(sql),
      "source_packet_id text NOT NULL missing",
    );
  });

  it("defines source_queue_item_id text not null", () => {
    assert.ok(
      /source_queue_item_id\s+text\s+not null/i.test(sql),
      "source_queue_item_id text NOT NULL missing",
    );
  });

  it("defines agent_id text not null", () => {
    assert.ok(
      /agent_id\s+text\s+not null/i.test(sql),
      "agent_id text NOT NULL missing",
    );
  });

  it("defines outcome_id text not null", () => {
    assert.ok(
      /outcome_id\s+text\s+not null/i.test(sql),
      "outcome_id text NOT NULL missing",
    );
  });

  it("defines reviewer_id text not null", () => {
    assert.ok(
      /reviewer_id\s+text\s+not null/i.test(sql),
      "reviewer_id text NOT NULL missing",
    );
  });

  it("defines reviewer_role text not null", () => {
    assert.ok(
      /reviewer_role\s+text\s+not null/i.test(sql),
      "reviewer_role text NOT NULL missing",
    );
  });

  it("defines decision text not null", () => {
    assert.ok(
      /decision\s+text\s+not null/i.test(sql),
      "decision text NOT NULL missing",
    );
  });

  it("defines decision_rationale text not null", () => {
    assert.ok(
      /decision_rationale\s+text\s+not null/i.test(sql),
      "decision_rationale text NOT NULL missing",
    );
  });

  it("defines approved_scope jsonb", () => {
    assert.ok(
      /approved_scope\s+jsonb/i.test(sql),
      "approved_scope jsonb column missing",
    );
  });

  it("defines constraints jsonb", () => {
    assert.ok(
      /constraints\s+jsonb/i.test(sql),
      "constraints jsonb column missing",
    );
  });

  it("defines guardrails jsonb", () => {
    assert.ok(
      /guardrails\s+jsonb/i.test(sql),
      "guardrails jsonb column missing",
    );
  });

  it("defines human_approved boolean", () => {
    assert.ok(
      /human_approved\s+boolean/i.test(sql),
      "human_approved boolean column missing",
    );
  });

  it("defines ledger_required_before_execution boolean", () => {
    assert.ok(
      /ledger_required_before_execution\s+boolean/i.test(sql),
      "ledger_required_before_execution boolean column missing",
    );
  });

  it("defines no_runtime_execution_authorized boolean", () => {
    assert.ok(
      /no_runtime_execution_authorized\s+boolean/i.test(sql),
      "no_runtime_execution_authorized boolean column missing",
    );
  });

  it("defines no_auto_approval boolean", () => {
    assert.ok(
      /no_auto_approval\s+boolean/i.test(sql),
      "no_auto_approval boolean column missing",
    );
  });

  it("defines approval_event_only boolean", () => {
    assert.ok(
      /approval_event_only\s+boolean/i.test(sql),
      "approval_event_only boolean column missing",
    );
  });

  it("defines status text", () => {
    assert.ok(
      /status\s+text/i.test(sql),
      "status text column missing",
    );
  });

  it("defines created_at timestamptz", () => {
    assert.ok(
      /created_at\s+timestamptz/i.test(sql),
      "created_at timestamptz column missing",
    );
  });

  it("defines expires_at timestamptz", () => {
    assert.ok(
      /expires_at\s+timestamptz/i.test(sql),
      "expires_at timestamptz column missing",
    );
  });

  it("defines revoked_at timestamptz", () => {
    assert.ok(
      /revoked_at\s+timestamptz/i.test(sql),
      "revoked_at timestamptz column missing",
    );
  });

  it("defines revocation_reason text", () => {
    assert.ok(
      /revocation_reason\s+text/i.test(sql),
      "revocation_reason text column missing",
    );
  });

  it("defines future_ledger_entry_id uuid", () => {
    assert.ok(
      /future_ledger_entry_id\s+uuid/i.test(sql),
      "future_ledger_entry_id uuid column missing",
    );
  });

  it("defines metadata jsonb", () => {
    assert.ok(
      /metadata\s+jsonb/i.test(sql),
      "metadata jsonb column missing",
    );
  });
});

// ---------------------------------------------------------------------------
// B. Decision / status constraints
// ---------------------------------------------------------------------------
describe("B. Decision and status constraints", () => {
  it("decision CHECK includes 'approved'", () => {
    assert.ok(
      sql.includes("'approved'"),
      "decision CHECK constraint missing 'approved'",
    );
  });

  it("decision CHECK includes 'rejected'", () => {
    assert.ok(
      sql.includes("'rejected'"),
      "decision CHECK constraint missing 'rejected'",
    );
  });

  it("decision CHECK includes 'needs_more_evidence'", () => {
    assert.ok(
      sql.includes("'needs_more_evidence'"),
      "decision CHECK constraint missing 'needs_more_evidence'",
    );
  });

  it("decision CHECK includes 'expired'", () => {
    assert.ok(
      sql.includes("'expired'"),
      "CHECK constraint missing 'expired'",
    );
  });

  it("decision CHECK includes 'revoked'", () => {
    assert.ok(
      sql.includes("'revoked'"),
      "CHECK constraint missing 'revoked'",
    );
  });

  it("status CHECK includes 'draft'", () => {
    assert.ok(
      sql.includes("'draft'"),
      "status CHECK constraint missing 'draft'",
    );
  });

  it("status CHECK includes 'valid_human_decision'", () => {
    assert.ok(
      sql.includes("'valid_human_decision'"),
      "status CHECK constraint missing 'valid_human_decision'",
    );
  });

  it("status CHECK includes 'invalid'", () => {
    assert.ok(
      sql.includes("'invalid'"),
      "status CHECK constraint missing 'invalid'",
    );
  });
});

// ---------------------------------------------------------------------------
// C. Safety invariants — boolean lock CHECK constraints
// ---------------------------------------------------------------------------
describe("C. Safety invariants (boolean lock constraints)", () => {
  it("ledger_required_before_execution is locked to true via CHECK", () => {
    assert.ok(
      /ledger_required_before_execution\s*=\s*true/i.test(sql),
      "CHECK constraint locking ledger_required_before_execution = true missing",
    );
  });

  it("no_runtime_execution_authorized is locked to true via CHECK", () => {
    assert.ok(
      /no_runtime_execution_authorized\s*=\s*true/i.test(sql),
      "CHECK constraint locking no_runtime_execution_authorized = true missing",
    );
  });

  it("no_auto_approval is locked to true via CHECK", () => {
    assert.ok(
      /no_auto_approval\s*=\s*true/i.test(sql),
      "CHECK constraint locking no_auto_approval = true missing",
    );
  });

  it("approval_event_only is locked to true via CHECK", () => {
    assert.ok(
      /approval_event_only\s*=\s*true/i.test(sql),
      "CHECK constraint locking approval_event_only = true missing",
    );
  });

  it("human_approved coherence CHECK ties human_approved = true to decision = 'approved'", () => {
    assert.ok(
      /human_approved\s*=\s*true\s+and\s+decision\s*=\s*'approved'/i.test(sql),
      "human_approved coherence CHECK missing",
    );
  });

  it("expires_at is required for approved decisions via CHECK", () => {
    assert.ok(
      /chk_arae_expires_at_when_approved/i.test(sql),
      "expires_at requirement constraint (chk_arae_expires_at_when_approved) missing",
    );
    assert.ok(
      /expires_at is not null/i.test(sql),
      "expires_at IS NOT NULL guard for approved decisions missing",
    );
  });
});

// ---------------------------------------------------------------------------
// D. Non-empty string constraints
// ---------------------------------------------------------------------------
describe("D. Non-empty string constraints", () => {
  it("reviewer_id non-empty constraint exists", () => {
    assert.ok(
      /chk_arae_reviewer_id_nonempty/i.test(sql),
      "chk_arae_reviewer_id_nonempty constraint missing",
    );
  });

  it("reviewer_role non-empty constraint exists", () => {
    assert.ok(
      /chk_arae_reviewer_role_nonempty/i.test(sql),
      "chk_arae_reviewer_role_nonempty constraint missing",
    );
  });

  it("source_packet_id non-empty constraint exists", () => {
    assert.ok(
      /chk_arae_source_packet_id_nonempty/i.test(sql),
      "chk_arae_source_packet_id_nonempty constraint missing",
    );
  });

  it("source_queue_item_id non-empty constraint exists", () => {
    assert.ok(
      /chk_arae_source_queue_item_id_nonempty/i.test(sql),
      "chk_arae_source_queue_item_id_nonempty constraint missing",
    );
  });

  it("agent_id non-empty constraint exists", () => {
    assert.ok(
      /chk_arae_agent_id_nonempty/i.test(sql),
      "chk_arae_agent_id_nonempty constraint missing",
    );
  });

  it("outcome_id non-empty constraint exists", () => {
    assert.ok(
      /chk_arae_outcome_id_nonempty/i.test(sql),
      "chk_arae_outcome_id_nonempty constraint missing",
    );
  });

  it("decision_rationale non-empty constraint exists", () => {
    assert.ok(
      /chk_arae_decision_rationale_nonempty/i.test(sql),
      "chk_arae_decision_rationale_nonempty constraint missing",
    );
  });
});

// ---------------------------------------------------------------------------
// E. Indexes
// ---------------------------------------------------------------------------
describe("E. Indexes", () => {
  for (const idx of [
    "idx_arae_user_id",
    "idx_arae_source_packet_id",
    "idx_arae_source_queue_item_id",
    "idx_arae_agent_id",
    "idx_arae_outcome_id",
    "idx_arae_decision",
    "idx_arae_status",
    "idx_arae_created_at",
    "idx_arae_expires_at",
    "idx_arae_future_ledger_entry_id",
  ]) {
    it(`index ${idx} is declared`, () => {
      assert.ok(
        sql.includes(idx),
        `index ${idx} missing`,
      );
    });
  }
});

// ---------------------------------------------------------------------------
// F. Row Level Security
// ---------------------------------------------------------------------------
describe("F. Row Level Security", () => {
  it("enables RLS on the table", () => {
    assert.ok(
      /enable row level security/i.test(sql),
      "ENABLE ROW LEVEL SECURITY missing",
    );
  });

  it("declares an owner_select policy", () => {
    assert.ok(
      sql.includes('"owner_select"') || sql.includes("'owner_select'") || sql.includes("owner_select"),
      "owner_select policy missing",
    );
  });

  it("declares an owner_insert policy", () => {
    assert.ok(
      sql.includes('"owner_insert"') || sql.includes("'owner_insert'") || sql.includes("owner_insert"),
      "owner_insert policy missing",
    );
  });

  it("policies are scoped to auth.uid()", () => {
    assert.ok(
      sql.includes("auth.uid()"),
      "auth.uid() missing from policies",
    );
  });

  it("does NOT contain permissive public read (USING (true))", () => {
    assert.ok(
      !/using\s*\(\s*true\s*\)/i.test(executableSql),
      "USING (true) found in executable SQL — permissive public read is not allowed",
    );
  });

  it("does NOT contain permissive public write (WITH CHECK (true))", () => {
    assert.ok(
      !/with\s+check\s*\(\s*true\s*\)/i.test(executableSql),
      "WITH CHECK (true) found in executable SQL — permissive public write is not allowed",
    );
  });

  it("does NOT contain a DELETE policy", () => {
    assert.ok(
      !/for\s+delete/i.test(executableSql),
      "FOR DELETE policy found — table must be append-only, no delete policy allowed",
    );
  });

  it("does NOT contain an UPDATE policy", () => {
    assert.ok(
      !/for\s+update/i.test(executableSql),
      "FOR UPDATE policy found — no broad update policy is allowed",
    );
  });
});

// ---------------------------------------------------------------------------
// G. Runtime / ledger boundary
// ---------------------------------------------------------------------------
describe("G. Runtime and ledger boundary", () => {
  it("does NOT contain CREATE FUNCTION (no trigger functions)", () => {
    assert.ok(
      !/create\s+function/i.test(executableSql),
      "CREATE FUNCTION found — trigger functions must not be defined in this migration",
    );
  });

  it("does NOT contain CREATE TRIGGER (no triggers)", () => {
    assert.ok(
      !/create\s+trigger/i.test(executableSql),
      "CREATE TRIGGER found — triggers must not be defined in this migration",
    );
  });

  it("does NOT contain action_ledger (no cross-table writes)", () => {
    assert.ok(
      !executableSqlLower.includes("action_ledger"),
      "action_ledger reference found — cross-table writes are not allowed in this migration",
    );
  });
});
