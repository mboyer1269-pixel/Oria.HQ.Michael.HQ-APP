#!/usr/bin/env node

// src/server/db/agent-approval-packets-migration.test.mjs
//
// Static smoke test for db/migrations/0011_agent_review_approval_packets.sql.
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
  "db/migrations/0011_agent_review_approval_packets.sql",
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
  it("creates agent_review_approval_packets table", () => {
    assert.ok(
      /create table/i.test(sql),
      "CREATE TABLE statement missing",
    );
    assert.ok(
      sql.includes("agent_review_approval_packets"),
      "table name 'agent_review_approval_packets' missing",
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

  it("defines packet_id text not null", () => {
    assert.ok(
      /packet_id\s+text\s+not null/i.test(sql),
      "packet_id text NOT NULL missing",
    );
  });

  it("defines queue_item_id text not null", () => {
    assert.ok(
      /queue_item_id\s+text\s+not null/i.test(sql),
      "queue_item_id text NOT NULL missing",
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

  it("defines priority text not null", () => {
    assert.ok(
      /priority\s+text\s+not null/i.test(sql),
      "priority text NOT NULL missing",
    );
  });

  it("defines status text not null", () => {
    assert.ok(
      /status\s+text\s+not null/i.test(sql),
      "status text NOT NULL missing",
    );
  });

  it("defines requested_decision text not null", () => {
    assert.ok(
      /requested_decision\s+text\s+not null/i.test(sql),
      "requested_decision text NOT NULL missing",
    );
  });

  it("defines source_decision text not null", () => {
    assert.ok(
      /source_decision\s+text\s+not null/i.test(sql),
      "source_decision text NOT NULL missing",
    );
  });

  it("defines source_next_action text not null", () => {
    assert.ok(
      /source_next_action\s+text\s+not null/i.test(sql),
      "source_next_action text NOT NULL missing",
    );
  });

  it("defines risk_summary jsonb", () => {
    assert.ok(
      /risk_summary\s+jsonb/i.test(sql),
      "risk_summary jsonb column missing",
    );
  });

  it("defines required_review jsonb", () => {
    assert.ok(
      /required_review\s+jsonb/i.test(sql),
      "required_review jsonb column missing",
    );
  });

  it("defines rationale jsonb", () => {
    assert.ok(
      /rationale\s+jsonb/i.test(sql),
      "rationale jsonb column missing",
    );
  });

  it("defines executive_summary text not null", () => {
    assert.ok(
      /executive_summary\s+text\s+not null/i.test(sql),
      "executive_summary text NOT NULL missing",
    );
  });

  it("defines guardrails jsonb", () => {
    assert.ok(
      /guardrails\s+jsonb/i.test(sql),
      "guardrails jsonb column missing",
    );
  });

  it("defines approval_required boolean", () => {
    assert.ok(
      /approval_required\s+boolean/i.test(sql),
      "approval_required boolean column missing",
    );
  });

  it("defines human_on_the_loop boolean", () => {
    assert.ok(
      /human_on_the_loop\s+boolean/i.test(sql),
      "human_on_the_loop boolean column missing",
    );
  });

  it("defines no_execution_authorized boolean", () => {
    assert.ok(
      /no_execution_authorized\s+boolean/i.test(sql),
      "no_execution_authorized boolean column missing",
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

  it("defines metadata jsonb", () => {
    assert.ok(
      /metadata\s+jsonb/i.test(sql),
      "metadata jsonb column missing",
    );
  });
});

// ---------------------------------------------------------------------------
// B. Enum constraints
// ---------------------------------------------------------------------------
describe("B. Enum constraints", () => {
  // priority (AgentReviewPriority)
  it("priority CHECK includes 'critical'", () => {
    assert.ok(sql.includes("'critical'"), "priority CHECK missing 'critical'");
  });

  it("priority CHECK includes 'high'", () => {
    assert.ok(sql.includes("'high'"), "priority CHECK missing 'high'");
  });

  it("priority CHECK includes 'medium'", () => {
    assert.ok(sql.includes("'medium'"), "priority CHECK missing 'medium'");
  });

  it("priority CHECK includes 'low'", () => {
    assert.ok(sql.includes("'low'"), "priority CHECK missing 'low'");
  });

  // status (AgentReviewApprovalPacketStatus)
  it("status CHECK includes 'draft_for_human_review'", () => {
    assert.ok(
      sql.includes("'draft_for_human_review'"),
      "status CHECK missing 'draft_for_human_review'",
    );
  });

  it("status CHECK includes 'ready_for_human_review'", () => {
    assert.ok(
      sql.includes("'ready_for_human_review'"),
      "status CHECK missing 'ready_for_human_review'",
    );
  });

  it("status CHECK includes 'blocked_pending_more_evidence'", () => {
    assert.ok(
      sql.includes("'blocked_pending_more_evidence'"),
      "status CHECK missing 'blocked_pending_more_evidence'",
    );
  });

  // requested_decision (AgentReviewApprovalPacketDecision)
  it("requested_decision CHECK includes 'approve_controlled_expansion_review'", () => {
    assert.ok(
      sql.includes("'approve_controlled_expansion_review'"),
      "requested_decision CHECK missing 'approve_controlled_expansion_review'",
    );
  });

  it("requested_decision CHECK includes 'approve_continue_monitoring'", () => {
    assert.ok(
      sql.includes("'approve_continue_monitoring'"),
      "requested_decision CHECK missing 'approve_continue_monitoring'",
    );
  });

  it("requested_decision CHECK includes 'approve_knowledge_pack_improvement_review'", () => {
    assert.ok(
      sql.includes("'approve_knowledge_pack_improvement_review'"),
      "requested_decision CHECK missing 'approve_knowledge_pack_improvement_review'",
    );
  });

  it("requested_decision CHECK includes 'approve_more_observation_collection'", () => {
    assert.ok(
      sql.includes("'approve_more_observation_collection'"),
      "requested_decision CHECK missing 'approve_more_observation_collection'",
    );
  });

  it("requested_decision CHECK includes 'reject_or_reduce_autonomy'", () => {
    assert.ok(
      sql.includes("'reject_or_reduce_autonomy'"),
      "requested_decision CHECK missing 'reject_or_reduce_autonomy'",
    );
  });

  it("requested_decision CHECK includes 'block_autonomy_increase'", () => {
    assert.ok(
      sql.includes("'block_autonomy_increase'"),
      "requested_decision CHECK missing 'block_autonomy_increase'",
    );
  });

  // source_decision (AgentOutcomeReviewDecision)
  it("source_decision CHECK includes 'continue_monitoring'", () => {
    assert.ok(
      sql.includes("'continue_monitoring'"),
      "source_decision CHECK missing 'continue_monitoring'",
    );
  });

  it("source_decision CHECK includes 'require_more_observations'", () => {
    assert.ok(
      sql.includes("'require_more_observations'"),
      "source_decision CHECK missing 'require_more_observations'",
    );
  });

  it("source_decision CHECK includes 'improve_knowledge_pack'", () => {
    assert.ok(
      sql.includes("'improve_knowledge_pack'"),
      "source_decision CHECK missing 'improve_knowledge_pack'",
    );
  });

  it("source_decision CHECK includes 'eligible_for_controlled_expansion'", () => {
    assert.ok(
      sql.includes("'eligible_for_controlled_expansion'"),
      "source_decision CHECK missing 'eligible_for_controlled_expansion'",
    );
  });

  it("source_decision CHECK includes 'reduce_autonomy_recommendation'", () => {
    assert.ok(
      sql.includes("'reduce_autonomy_recommendation'"),
      "source_decision CHECK missing 'reduce_autonomy_recommendation'",
    );
  });
});

// ---------------------------------------------------------------------------
// C. Safety invariants — boolean lock CHECK constraints
// ---------------------------------------------------------------------------
describe("C. Safety invariants (boolean lock constraints)", () => {
  it("approval_required is locked to true via CHECK", () => {
    assert.ok(
      /approval_required\s*=\s*true/i.test(sql),
      "CHECK constraint locking approval_required = true missing",
    );
  });

  it("human_on_the_loop is locked to true via CHECK", () => {
    assert.ok(
      /human_on_the_loop\s*=\s*true/i.test(sql),
      "CHECK constraint locking human_on_the_loop = true missing",
    );
  });

  it("no_execution_authorized is locked to true via CHECK", () => {
    assert.ok(
      /no_execution_authorized\s*=\s*true/i.test(sql),
      "CHECK constraint locking no_execution_authorized = true missing",
    );
  });
});

// ---------------------------------------------------------------------------
// D. Non-empty string constraints
// ---------------------------------------------------------------------------
describe("D. Non-empty string constraints", () => {
  it("packet_id non-empty constraint exists", () => {
    assert.ok(
      /chk_arap_packet_id_nonempty/i.test(sql),
      "chk_arap_packet_id_nonempty constraint missing",
    );
  });

  it("queue_item_id non-empty constraint exists", () => {
    assert.ok(
      /chk_arap_queue_item_id_nonempty/i.test(sql),
      "chk_arap_queue_item_id_nonempty constraint missing",
    );
  });

  it("agent_id non-empty constraint exists", () => {
    assert.ok(
      /chk_arap_agent_id_nonempty/i.test(sql),
      "chk_arap_agent_id_nonempty constraint missing",
    );
  });

  it("outcome_id non-empty constraint exists", () => {
    assert.ok(
      /chk_arap_outcome_id_nonempty/i.test(sql),
      "chk_arap_outcome_id_nonempty constraint missing",
    );
  });

  it("priority non-empty constraint exists", () => {
    assert.ok(
      /chk_arap_priority_nonempty/i.test(sql),
      "chk_arap_priority_nonempty constraint missing",
    );
  });

  it("status non-empty constraint exists", () => {
    assert.ok(
      /chk_arap_status_nonempty/i.test(sql),
      "chk_arap_status_nonempty constraint missing",
    );
  });

  it("requested_decision non-empty constraint exists", () => {
    assert.ok(
      /chk_arap_requested_decision_nonempty/i.test(sql),
      "chk_arap_requested_decision_nonempty constraint missing",
    );
  });

  it("source_decision non-empty constraint exists", () => {
    assert.ok(
      /chk_arap_source_decision_nonempty/i.test(sql),
      "chk_arap_source_decision_nonempty constraint missing",
    );
  });

  it("source_next_action non-empty constraint exists", () => {
    assert.ok(
      /chk_arap_source_next_action_nonempty/i.test(sql),
      "chk_arap_source_next_action_nonempty constraint missing",
    );
  });

  it("executive_summary non-empty constraint exists", () => {
    assert.ok(
      /chk_arap_executive_summary_nonempty/i.test(sql),
      "chk_arap_executive_summary_nonempty constraint missing",
    );
  });
});

// ---------------------------------------------------------------------------
// E. UNIQUE constraint on packet_id
// ---------------------------------------------------------------------------
describe("E. UNIQUE constraint", () => {
  it("declares UNIQUE constraint on packet_id (uq_arap_packet_id)", () => {
    assert.ok(
      /uq_arap_packet_id/i.test(sql),
      "uq_arap_packet_id UNIQUE constraint missing",
    );
    assert.ok(
      /unique\s*\(\s*packet_id\s*\)/i.test(sql),
      "UNIQUE (packet_id) declaration missing",
    );
  });
});

// ---------------------------------------------------------------------------
// F. Indexes
// ---------------------------------------------------------------------------
describe("F. Indexes", () => {
  for (const idx of [
    "idx_arap_user_id",
    "idx_arap_packet_id",
    "idx_arap_queue_item_id",
    "idx_arap_agent_id",
    "idx_arap_outcome_id",
    "idx_arap_priority",
    "idx_arap_status",
    "idx_arap_requested_decision",
    "idx_arap_source_decision",
    "idx_arap_created_at",
    "idx_arap_expires_at",
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
// G. Row Level Security
// ---------------------------------------------------------------------------
describe("G. Row Level Security", () => {
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
// H. Runtime / ledger boundary
// ---------------------------------------------------------------------------
describe("H. Runtime and ledger boundary", () => {
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
