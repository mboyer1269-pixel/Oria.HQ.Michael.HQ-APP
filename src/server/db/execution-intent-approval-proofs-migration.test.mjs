#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");
const migrationPath = path.join(projectRoot, "db/migrations/0029_execution_intent_approval_proofs.sql");
const sql = readFileSync(migrationPath, "utf-8");
const executableSql = sql
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("0029 execution intent approval proofs migration", () => {
  it("creates approval events table", () => {
    assert.match(executableSql, /agent_execution_intent_approval_events/i);
  });

  it("locks approval proof to sha256 hex", () => {
    assert.match(executableSql, /approval_proof[\s\S]*\^\[0-9a-f\]\{64\}\$/i);
  });

  it("adds approval_event_id to agent_execution_intents", () => {
    assert.match(executableSql, /approval_event_id/i);
  });

  it("requires approval proof for pending -> executing", () => {
    assert.match(executableSql, /agent_execution_intents_require_approval_proof/i);
    assert.match(executableSql, /pending_to_executing_requires_approval_proof/i);
  });

  it("declares 8 restrictive block policies", () => {
    const count = (executableSql.match(/create policy "aei_approval_events_block_/g) || []).length;
    assert.equal(count, 8);
  });
});
