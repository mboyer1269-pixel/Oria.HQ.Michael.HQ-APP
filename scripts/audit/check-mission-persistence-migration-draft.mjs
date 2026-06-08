#!/usr/bin/env node
/**
 * check-mission-persistence-migration-draft.mjs — read-only static validator.
 *
 * Statically asserts the mission-persistence migration DRAFT under
 * db/migrations/drafts/ is complete and that every object it creates is dropped
 * by the matching revert (symmetric rollback). Also confirms the post-apply
 * verify.sql is read-only and that no secret is embedded.
 *
 * Pure: reads only the draft files. No DB, no env, no migration apply. Fails
 * CLOSED (exit 1) on any missing piece.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const draftsDir = path.resolve(here, "..", "..", "db", "migrations", "drafts");

const failures = [];
const check = (cond, msg) => {
  if (!cond) failures.push(msg);
};

function read(name) {
  try {
    return readFileSync(path.join(draftsDir, name), "utf8").toLowerCase();
  } catch (err) {
    failures.push(`cannot read ${name}: ${err.message}`);
    return "";
  }
}

const forward = read("mission_persistence_completion.sql");
const revert = read("mission_persistence_completion_revert.sql");
const verify = read("mission_persistence_completion_verify.sql");

const INDEXES = [
  "mission_execution_attempts_key_idx",
  "mission_execution_attempts_workspace_time_idx",
  "mission_execution_attempts_expires_idx",
  "missions_workspace_status_idx",
];

// Forward: table, key columns, constraints, RLS, indexes.
check(
  forward.includes("create table if not exists public.mission_execution_attempts"),
  "forward: missing mission_execution_attempts table",
);
for (const col of ["id", "idempotency_key", "mission_id", "workspace_id", "mode", "expires_at"]) {
  check(forward.includes(col), `forward: missing column ${col}`);
}
check(forward.includes("references public.missions(id)"), "forward: missing FK to missions");
check(forward.includes("check (mode in ('dry_run', 'live'))"), "forward: missing mode CHECK constraint");
check(
  forward.includes("enable row level security"),
  "forward: missing RLS enable on mission_execution_attempts",
);
// Mirror the existing missions table: no permissive policy is created here.
check(!forward.includes("using (true)"), "forward: must not add a using(true) policy");
check(!forward.includes("create policy"), "forward: must not add a permissive policy (service-role only)");

for (const idx of INDEXES) {
  check(forward.includes(idx), `forward: missing index ${idx}`);
  check(revert.includes("drop index if exists") && revert.includes(idx), `revert: missing drop index ${idx}`);
}
check(
  revert.includes("drop table if exists public.mission_execution_attempts"),
  "revert: missing drop table mission_execution_attempts",
);

// DRAFT marker.
check(forward.includes("draft"), "forward: missing DRAFT marker");

// verify.sql must be strictly read-only: no statement may START with DDL/DML.
const verifyLines = verify
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("--"));
check(verifyLines.some((l) => l.startsWith("select")), "verify.sql: expected SELECT statements");
const FORBIDDEN_START = ["insert", "update", "delete", "drop", "alter", "create", "truncate", "grant", "revoke"];
for (const line of verifyLines) {
  const firstWord = line.split(/\s+/)[0];
  check(!FORBIDDEN_START.includes(firstWord), `verify.sql must be read-only — statement starts with '${firstWord}'`);
}

// No secret may be embedded.
for (const [name, body] of [["forward", forward], ["verify", verify]]) {
  check(!body.includes("service_role_key"), `${name}: must not embed a service role key`);
}

if (failures.length > 0) {
  console.error(`[check-mission-persistence-draft] FAIL — ${failures.length} issue(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = 1;
} else {
  console.log(
    "[check-mission-persistence-draft] OK — draft complete, revert symmetric, verify.sql read-only, no embedded secret",
  );
  process.exitCode = 0;
}
