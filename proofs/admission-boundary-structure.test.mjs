#!/usr/bin/env node
// Source checks, plus one bounded fake docker process.
// This file does not start a container and does not claim real_infra.
// The disposable PostgreSQL bench is the explicit shell command, not this suite.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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

test("absent docker is a bounded fake process and does not create a container", () => {
  const bin = mkdtempSync(path.join(tmpdir(), "admission-fake-docker-"));
  const log = path.join(bin, "invocations.log");
  writeFileSync(
    path.join(bin, "docker"),
    "#!/bin/sh\nprintf '%s\\n' \"$*\" >> \"$ADMISSION_FAKE_DOCKER_LOG\"\nexit 1\n",
    { mode: 0o755 },
  );
  let code = 0;
  let stdout = "";
  let stderr = "";
  let invocations = "";
  try {
    stdout = execFileSync("sh", ["proofs/run-admission-rls-real-db.sh"], {
      cwd: root,
      encoding: "utf8",
      timeout: 15000,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        ADMISSION_FAKE_DOCKER_LOG: log,
      },
    });
  } catch (error) {
    code = error.status ?? 1;
    stdout = `${error.stdout ?? ""}`;
    stderr = `${error.stderr ?? ""}`;
  } finally {
    try {
      invocations = readFileSync(log, "utf8");
    } catch {
      invocations = "";
    }
    rmSync(bin, { recursive: true, force: true });
  }
  assert.equal(code, 127, stderr);
  assert.match(stderr, /NON EXECUTE/);
  assert.equal(stdout.includes("QUALIFIÉE") || stderr.includes("QUALIFIÉE"), false);
  assert.equal(invocations, "info\n");
});
