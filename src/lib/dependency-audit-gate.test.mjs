#!/usr/bin/env node

// src/lib/dependency-audit-gate.test.mjs
//
// The dependency gate protects CI, so its failure modes matter more than its
// success path. `npm audit --json` exits non-zero whenever advisories exist,
// which makes "exited non-zero" useless as an error signal — and a registry
// that rejects the request still writes a JSON body to stdout. A gate that
// parses that body finds no `vulnerabilities` field and reports a clean audit.
//
// These tests run the real script against a registry that cannot be reached and
// assert it exits non-zero, plus a set of malformed payloads that must each
// fail closed rather than read as "nothing found".

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");
const SCRIPT = path.join(projectRoot, "scripts/audit/direct-dependency-audit.mjs");

function runGate(extraEnv = {}) {
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: projectRoot,
    env: { ...process.env, ...extraEnv },
    encoding: "utf8",
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function runGateWithAuditBody(body) {
  const auditOutput = typeof body === "string" ? body : JSON.stringify(body);
  const probe = `
    const { promisify } = require("node:util");
    const child = require("node:child_process");
    const body = ${JSON.stringify(auditOutput)};
    child.exec = (cmd, opts, cb) => {
      const done = typeof opts === "function" ? opts : cb;
      done(null, body, "");
    };
    child.exec[promisify.custom] = async () => ({ stdout: body, stderr: "" });
    import(${JSON.stringify(pathToFileUrl(SCRIPT))}).catch(() => {});
  `;
  const result = spawnSync(process.execPath, ["-e", probe], {
    cwd: projectRoot,
    encoding: "utf8",
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

test("Dependency gate — an audit that did not run is never a clean audit", async (t) => {
  await t.test("an unreachable registry exits non-zero", () => {
    // Port 9 (discard) refuses immediately, so this stays fast and offline.
    const result = runGate({ npm_config_registry: "http://127.0.0.1:9/" });

    assert.notEqual(
      result.status,
      0,
      "the gate reported success against an unreachable registry:\n" + result.stdout,
    );
    assert.ok(
      !/Direct dependencies: OK/.test(result.stdout),
      "the gate printed a clean result without auditing anything",
    );
    assert.match(
      result.stderr,
      /could not run|crashed/,
      "the failure must say the audit did not run, not that a package is vulnerable",
    );
    assert.match(result.stderr, /Failing closed/);
  });

  await t.test("every rejection path is covered by the script", async () => {
    // Pins the conditions themselves, so removing one is visible in review even
    // though reproducing each against a live registry is impractical here.
    const source = await readFile(SCRIPT, "utf8");
    for (const condition of [
      /npm audit produced no output/,
      /output was not JSON/,
      /returned an error payload/,
      /missing the fields a real audit produces/,
    ]) {
      assert.match(source, condition, `a rejection path was removed: ${condition}`);
    }
    assert.match(source, /class AuditUnavailableError/);
  });

  await t.test("a malformed payload fails closed", () => {
    // Drives runAudit's validation directly through a stubbed command, so each
    // shape is exercised rather than only asserted to exist in the source.
    const cases = [
      {
        label: "error payload",
        body: '{"error":{"code":"E403","summary":"Forbidden"}}',
        reason: /returned an error payload.*E403/s,
      },
      { label: "not JSON", body: "<html>403 Forbidden</html>", reason: /was not JSON/ },
      { label: "empty object", body: "{}", reason: /missing the fields/ },
      {
        label: "metadata only",
        body: '{"metadata":{"vulnerabilities":{}}}',
        reason: /missing the fields/,
      },
      { label: "vulnerabilities only", body: '{"vulnerabilities":{}}', reason: /missing the fields/ },
      {
        label: "null vulnerabilities",
        body: '{"vulnerabilities":null,"metadata":{"vulnerabilities":{}}}',
        reason: /missing the fields/,
      },
      {
        label: "array-shaped fields",
        body: '{"vulnerabilities":[],"metadata":{"vulnerabilities":[]}}',
        reason: /missing the fields/,
      },
    ];

    for (const testCase of cases) {
      const result = runGateWithAuditBody(testCase.body);
      assert.notEqual(
        result.status,
        0,
        `"${testCase.label}" was accepted as a clean audit:\n${result.stdout}${result.stderr}`,
      );
      assert.ok(
        !/Direct dependencies: OK/.test(result.stdout),
        `"${testCase.label}" printed a clean result`,
      );
      // Asserting the reason, not just the exit code: a probe that failed for an
      // unrelated reason (a broken stub, a syntax error) would otherwise satisfy
      // this test while proving nothing about the validation.
      assert.match(
        result.stderr,
        testCase.reason,
        `"${testCase.label}" exited non-zero for the wrong reason:\n${result.stderr}`,
      );
    }
  });
});

function pathToFileUrl(p) {
  return new URL(`file:///${p.replace(/\\/g, "/")}`).href;
}

test("Dependency gate — it never resolves advisories itself", async (t) => {
  await t.test("the only npm command it runs is a read-only audit", async () => {
    const source = await readFile(SCRIPT, "utf8");
    const commands = [...source.matchAll(/AUDIT_COMMAND\s*=\s*"([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(commands, ["npm audit --json"]);
    assert.ok(
      !/exec[A-Za-z]*\((?!AUDIT_COMMAND)/.test(source.replace(/promisify\(exec\)/g, "")),
      "the gate spawns something other than its one declared command",
    );
  });

  await t.test("it blocks on declared packages and reports transitive ones", async () => {
    const result = runGateWithAuditBody({
      vulnerabilities: {
        next: {
          severity: "high",
          isDirect: false,
          range: "<99.0.0",
          via: [{ title: "declared fixture advisory" }],
          fixAvailable: false,
        },
        "fixture-transitive": {
          severity: "high",
          isDirect: true,
          range: "*",
          via: [{ title: "transitive fixture advisory" }],
          fixAvailable: false,
        },
      },
      metadata: { vulnerabilities: { critical: 0, high: 2, moderate: 0, low: 0 } },
    });

    assert.equal(result.status, 1, "a high advisory in declared package next must block");
    assert.match(result.stderr, /next \[high\]/);
    assert.match(result.stdout, /fixture-transitive \[high\]/);
    assert.match(result.stdout, /reported, not blocking/);
    assert.ok(
      !result.stderr.includes("fixture-transitive"),
      "npm's isDirect flag must not turn an undeclared package into a blocker",
    );
  });
});
