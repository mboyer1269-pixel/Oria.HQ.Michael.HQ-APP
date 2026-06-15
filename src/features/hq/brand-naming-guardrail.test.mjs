#!/usr/bin/env node

// Brand naming guardrail (CLEAN-010). Enforces the canonical rule from
// docs/DECISION_LOG.md: user-facing surfaces use the brand spelling, while the
// alternate technical spelling survives ONLY as a frozen namespace (contract
// fields + the idempotency header). This locks the rule so a user-visible
// regression fails here first. The retired earlier spelling must never appear.
//
// Pure and offline: scans src/**/*.{ts,tsx} (excluding tests). This file is a
// .mjs test, so it is not scanned and its own examples below do not self-trip.

import assert from "node:assert/strict";
import { glob, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

// A line may contain the frozen spelling ONLY if it also contains one of these
// documented tokens (compared lowercased). The frozen technical namespace is
// enumerated in docs/DECISION_LOG.md / docs/AGENT_NAMING.md:
//   - contract fields originalOryaEligible / originalOryaCandidate (+ their
//     "Original Orya" doc comments)
//   - the X-Orya-Idempotency-Key header
//   - the ventures seed: const ORYA_VENTURES and ventureId "orya-hq"
//     (the venture's user-visible `name` is already "Oria HQ").
const FROZEN_TOKENS = ["originalorya", "original orya", "x-orya-", "orya_ventures", "orya-hq"];

async function collectSourceFiles() {
  const files = [];
  for (const pattern of ["src/**/*.ts", "src/**/*.tsx"]) {
    for await (const entry of glob(pattern, { cwd: projectRoot })) {
      const norm = entry.replace(/\\/g, "/");
      if (norm.includes(".test.") || norm.includes(".spec.")) continue;
      files.push(norm);
    }
  }
  return files;
}

test("brand naming guardrail", async (t) => {
  const files = await collectSourceFiles();
  assert.ok(files.length > 0, "expected to scan source files");

  await t.test("frozen alternate spelling appears only inside documented contract tokens", async () => {
    const needle = ["O", "r", "y", "a"].join("");
    const violations = [];
    for (const file of files) {
      const content = await readFile(path.join(projectRoot, file), "utf-8");
      content.split(/\r?\n/).forEach((line, index) => {
        const lower = line.toLowerCase();
        if (!lower.includes(needle.toLowerCase())) return;
        if (FROZEN_TOKENS.some((token) => lower.includes(token))) return;
        violations.push(`${file}:${index + 1}: ${line.trim()}`);
      });
    }
    assert.deepEqual(violations, [], `Unexpected user-visible spelling — use the brand spelling:\n${violations.join("\n")}`);
  });

  await t.test("the retired earlier spelling never appears", async () => {
    const retired = ["A", "u", "r", "i", "a"].join("");
    const violations = [];
    for (const file of files) {
      const content = await readFile(path.join(projectRoot, file), "utf-8");
      content.split(/\r?\n/).forEach((line, index) => {
        if (line.includes(retired)) violations.push(`${file}:${index + 1}`);
      });
    }
    assert.deepEqual(violations, [], `Retired spelling found:\n${violations.join("\n")}`);
  });
});
