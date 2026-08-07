#!/usr/bin/env node

// src/lib/runtime-baseline.test.mjs
//
// Docker, CI and package.json must agree on one Node major. run-tests.mjs uses
// fs.glob, which requires Node 22, so the declared runtime cannot be lower.
//
// Also pins that the dependency gate stays wired into CI. A security check that
// exists but is not invoked is worse than none: it reads as coverage.

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");

const read = (relPath) => readFile(path.join(projectRoot, relPath), "utf8");

const REQUIRED_NODE_MAJOR = 22;

async function workflowPaths() {
  const directory = ".github/workflows";
  const entries = await readdir(path.join(projectRoot, directory));
  return entries
    .filter((name) => /\.ya?ml$/.test(name))
    .map((name) => `${directory}/${name}`)
    .sort();
}

test("Runtime baseline — one Node major, everywhere", async (t) => {
  await t.test("every Dockerfile stage runs the supported major", async () => {
    const dockerfile = await read("Dockerfile");
    const imageRefs = [...dockerfile.matchAll(/^FROM\s+(node:[^\s]+)\s+AS\s+\w+/gm)].map(
      (match) => match[1],
    );
    const images = imageRefs.map((image) => image.match(/^node:(\d+)/)?.[1]);

    assert.ok(images.length > 0, "no node base image found — update this detector");
    for (const major of images) {
      assert.equal(
        Number(major),
        REQUIRED_NODE_MAJOR,
        `Dockerfile builds on Node ${major} while CI runs Node ${REQUIRED_NODE_MAJOR}. ` +
          "Production would execute a major the suite never ran on.",
      );
    }
    assert.equal(
      new Set(imageRefs).size,
      1,
      "every Dockerfile stage must use the same exact image reference",
    );
    assert.match(
      imageRefs[0],
      /^node:\d+\.\d+\.\d+-alpine\d+\.\d+@sha256:[0-9a-f]{64}$/,
      "the Node Alpine base must pin both its patch tag and index digest",
    );
  });

  await t.test("every workflow pins the same major", async () => {
    for (const workflow of await workflowPaths()) {
      const source = await read(workflow);
      const versions = [...source.matchAll(/node-version:\s*['"]?(\d+)/g)].map((m) => m[1]);
      const usesVersionFile = /node-version-file:\s*\S+/.test(source);
      assert.ok(versions.length > 0 || usesVersionFile, `${workflow}: no Node version pin found`);
      for (const major of versions) {
        assert.equal(
          Number(major),
          REQUIRED_NODE_MAJOR,
          `${workflow} pins Node ${major}, not ${REQUIRED_NODE_MAJOR}`,
        );
      }
    }
  });

  await t.test("package.json bounds Node to the supported major, not just a floor", async () => {
    // An open ">=22" range silently adopts the next major on the host that
    // resolves it, which is a runtime change nobody chose. Vercel warns about
    // exactly this. The contract is Node 22, so the range is closed.
    const pkg = JSON.parse(await read("package.json"));
    assert.ok(pkg.engines?.node, "package.json must declare engines.node");

    const floor = pkg.engines.node.match(/>=\s*(\d+)/);
    assert.ok(floor, `engines.node "${pkg.engines.node}" must state a >= floor`);
    assert.equal(
      Number(floor[1]),
      REQUIRED_NODE_MAJOR,
      "engines.node disagrees with Docker and CI",
    );

    const ceiling = pkg.engines.node.match(/<\s*(\d+)/);
    assert.ok(
      ceiling,
      `engines.node "${pkg.engines.node}" is an open range — it would adopt Node ` +
        `${REQUIRED_NODE_MAJOR + 1} without anyone choosing it`,
    );
    assert.equal(
      Number(ceiling[1]),
      REQUIRED_NODE_MAJOR + 1,
      "the ceiling must be the next major after the supported one",
    );
  });

  await t.test("the floor is not lower than what the code requires", async () => {
    // fs.glob landed in Node 22. The test runner is built on it, so a lower
    // floor would advertise support for a version that cannot run the suite.
    const runner = await read("run-tests.mjs");
    assert.ok(
      /from ['"]node:fs\/promises['"]/.test(runner) && /\bglob\b/.test(runner),
      "run-tests.mjs no longer uses fs.glob — re-derive the Node floor",
    );
    const pkg = JSON.parse(await read("package.json"));
    const floor = Number(pkg.engines.node.match(/>=\s*(\d+)/)?.[1]);
    assert.ok(
      floor >= 22,
      `engines.node floors at ${floor}; run-tests.mjs uses fs.glob, which requires Node 22`,
    );
    assert.match(
      await read(".npmrc"),
      /^engine-strict=true$/m,
      "the Node 22-only engines contract must fail unsupported installs",
    );
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
    // The gate's own behaviour is covered by dependency-audit-gate.test.mjs;
    // this only pins that CI can reach it.
    const pkg = JSON.parse(await read("package.json"));
    assert.ok(pkg.scripts["audit:deps"], "package.json must declare the audit:deps script");
    assert.match(pkg.scripts["audit:deps"], /direct-dependency-audit\.mjs/);
    await read("scripts/audit/direct-dependency-audit.mjs");
  });

  await t.test("no CI step resolves advisories with a forced upgrade", async () => {
    for (const workflow of await workflowPaths()) {
      const source = await read(workflow);
      assert.ok(
        !/audit fix/.test(source),
        `${workflow} runs \`npm audit fix\` — CI must never take unattended upgrades`,
      );
    }
  });
});
