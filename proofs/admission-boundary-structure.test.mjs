#!/usr/bin/env node
// Structural checks that do not require Docker and do not claim real_infra.
// The disposable PostgreSQL script is executed separately.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function text(relative) {
  return readFileSync(path.join(root, relative), "utf8");
}

test("the development route keeps the owner boundary and ignores the test global", () => {
  const route = text("src/app/api/missions/development/route.ts");
  assert.match(route, /getCurrentAuthUser/);
  assert.match(route, /isOwnerUser/);
  assert.match(route, /getActiveWorkspaceContext/);
  assert.doesNotMatch(route, /__ownerApiSessionTestResult/);
  assert.doesNotMatch(route, /from\("missions"\)/);
});

test("mission and budget migrations do not grant client table access or bypassrls", () => {
  const missions = text("db/migrations/0005_missions_rls.sql");
  const budget = text("db/migrations/0028_call_reservation.sql");
  const script = text("proofs/run-admission-rls-real-db.sh");
  assert.match(missions, /missions_block_anon_select/);
  assert.match(missions, /missions_block_authenticated_insert/);
  assert.match(missions, /as restrictive/);
  assert.match(budget, /revoke all on function public\.hq_reserve_call_attempt/);
  assert.match(budget, /grant execute on function public\.hq_reserve_call_attempt\(text, text, text, text, text, text, integer, integer\) to service_role/);
  assert.match(script, /create role anon noinherit nologin nosuperuser nobypassrls/);
  assert.match(script, /create role authenticated noinherit nologin nosuperuser nobypassrls/);
  assert.match(script, /create role service_role noinherit nologin nosuperuser nobypassrls/);
  assert.doesNotMatch(script, /qualification_service/);
  assert.match(script, /NON EXECUTE/);
  assert.match(script, /exit 127/);
});

test("the admission SQL bench reports absence or a real run, never a renamed simulation", () => {
  let stderr = "";
  let stdout = "";
  let code = 0;
  try {
    stdout = execFileSync("sh", ["proofs/run-admission-rls-real-db.sh"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    code = error.status;
    stdout = error.stdout ?? "";
    stderr = error.stderr ?? "";
  }
  if (code === 127) {
    assert.match(stderr, /NON EXECUTE/);
    assert.doesNotMatch(`${stdout}\n${stderr}`, /QUALIFIÉE/);
    return;
  }
  assert.equal(code, 0, stderr);
  assert.match(stdout, /ADMISSION RLS QUALIFIÉE/);
});
