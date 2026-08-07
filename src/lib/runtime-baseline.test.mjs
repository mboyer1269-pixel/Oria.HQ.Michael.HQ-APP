#!/usr/bin/env node

// src/lib/runtime-baseline.test.mjs
//
// Docker, CI and package.json must agree on which Node major this app runs on.
//
// They did not. The image ran node:20-alpine while every workflow ran
// node-version: 22, so production executed a major the test suite had never run
// on — and could not have: run-tests.mjs uses fs.glob, which does not exist
// before Node 22. `npm test` inside that image would have failed on the first
// line. Nothing compared the two files, so nothing said so.
//
// Also pins that the dependency gate stays wired into CI. A security check that
// exists but is not invoked is worse than none: it reads as coverage.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");

const read = (relPath) => readFile(path.join(projectRoot, relPath), "utf8");

const REQUIRED_NODE_MAJOR = 22;

test("Runtime baseline — one Node major, everywhere", async (t) => {
  await t.test("every Dockerfile stage runs the supported major", async () => {
    const dockerfile = await read("Dockerfile");
    const images = [...dockerfile.matchAll(/^FROM\s+node:(\d+)[^\s]*/gm)].map((m) => m[1]);

    assert.ok(images.length > 0, "no node base image found — update this detector");
    for (const major of images) {
      assert.equal(
        Number(major),
        REQUIRED_NODE_MAJOR,
        `Dockerfile builds on Node ${major} while CI runs Node ${REQUIRED_NODE_MAJOR}. ` +
          "Production would execute a major the suite never ran on.",
      );
    }
  });

  await t.test("every workflow pins the same major", async () => {
    for (const workflow of [".github/workflows/ci.yml", ".github/workflows/ledger-audit-nightly.yml"]) {
      const source = await read(workflow);
      const versions = [...source.matchAll(/node-version:\s*['"]?(\d+)/g)].map((m) => m[1]);
      assert.ok(versions.length > 0, `${workflow}: no node-version found`);
      for (const major of versions) {
        assert.equal(
          Number(major),
          REQUIRED_NODE_MAJOR,
          `${workflow} pins Node ${major}, not ${REQUIRED_NODE_MAJOR}`,
        );
      }
    }
  });

  await t.test("package.json declares the floor, and it matches", async () => {
    const pkg = JSON.parse(await read("package.json"));
    assert.ok(pkg.engines?.node, "package.json must declare engines.node");

    const floor = pkg.engines.node.match(/>=\s*(\d+)/);
    assert.ok(floor, `engines.node "${pkg.engines.node}" must state a >= floor`);
    assert.equal(
      Number(floor[1]),
      REQUIRED_NODE_MAJOR,
      "engines.node disagrees with Docker and CI",
    );
  });

  await t.test("the floor is not lower than what the code requires", async () => {
    // fs.glob landed in Node 22. The test runner is built on it, so a lower
    // floor would advertise support for a version that cannot run the suite.
    const runner = await read("run-tests.mjs");
    if (/from ['"]node:fs\/promises['"]/.test(runner) && /\bglob\b/.test(runner)) {
      assert.ok(
        REQUIRED_NODE_MAJOR >= 22,
        "run-tests.mjs uses fs.glob, which requires Node 22 or later",
      );
    }
  });
});

test("Runtime baseline — the dependency gate is actually invoked", async (t) => {
  await t.test("CI runs the direct-dependency audit", async () => {
    const ci = await read(".github/workflows/ci.yml");
    assert.match(
      ci,
      /npm run audit:deps/,
      "the dependency gate is not wired into CI — a check that never runs reads as coverage",
    );
  });

  await t.test("the audit script is declared and present", async () => {
    const pkg = JSON.parse(await read("package.json"));
    assert.ok(pkg.scripts["audit:deps"], "package.json must declare the audit:deps script");

    const script = await read("scripts/audit/direct-dependency-audit.mjs");
    assert.match(script, /high|critical/, "the gate must target high/critical severities");

    // Asserts what the script RUNS, not what it mentions — it names
    // `npm audit fix --force` in prose precisely to warn against it. The single
    // npm invocation is a constant, so this is checkable.
    const commands = [...script.matchAll(/AUDIT_COMMAND\s*=\s*"([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(
      commands,
      ["npm audit --json"],
      "the gate runs an npm command other than a read-only audit",
    );
    assert.ok(
      !/exec[A-Za-z]*\((?!AUDIT_COMMAND)/.test(script.replace(/promisify\(exec\)/g, "")),
      "the gate spawns something other than its one declared command",
    );
  });

  await t.test("no CI step resolves advisories with a forced upgrade", async () => {
    for (const workflow of [".github/workflows/ci.yml", ".github/workflows/ledger-audit-nightly.yml"]) {
      const source = await read(workflow);
      assert.ok(
        !/audit fix/.test(source),
        `${workflow} runs \`npm audit fix\` — CI must never take unattended upgrades`,
      );
    }
  });
});
