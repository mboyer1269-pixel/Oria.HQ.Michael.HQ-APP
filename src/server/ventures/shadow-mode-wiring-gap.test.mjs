#!/usr/bin/env node

// src/server/ventures/shadow-mode-wiring-gap.test.mjs
//
// ⚠️ THIS TEST FAILS ON PURPOSE. It is a tripwire, not a broken test.
//
// Shadow mode has two halves. Both are implemented and tested. NEITHER IS
// WIRED:
//
//   * `runShadowScorePass` — produces proposals. Wired by the step-4 trigger.
//   * `recordShadowOutcome` — records the owner's real decision against a
//     proposal. Has no home in the step-4 scope as originally written, which is
//     exactly how it would have been forgotten.
//
// Divergence between the two is the entire asset of shadow mode. A proposal
// with no matching outcome is worth nothing, and the pairing cannot be
// reconstructed after the fact — so if proposals start flowing before this hook
// exists, that window of data is permanently lost.
//
// This test turns green on its own the moment a real caller appears. It is not
// a hardcoded failure: it scans the source for callers outside the module and
// outside test files. Wire the hook and it passes.
//
// DO NOT DELETE THIS TEST TO GET A GREEN SUITE. Deleting it removes the only
// mechanical reminder that the measurement half of shadow mode is missing.

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");
const srcDir = path.join(projectRoot, "src");

/** The module that defines the exports — a self-reference is not a caller. */
const DEFINING_MODULE = "venture-score-shadow-runner.ts";

async function collectSourceFiles(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await collectSourceFiles(full)));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    if (entry.name.endsWith(".test.ts")) continue;
    if (entry.name === DEFINING_MODULE) continue;
    found.push(full);
  }
  return found;
}

/**
 * Files that call `name` in real code — comments stripped, so a header that
 * merely mentions the symbol does not count as wiring.
 */
async function findRealCallers(name) {
  const callers = [];
  for (const file of await collectSourceFiles(srcDir)) {
    const raw = await readFile(file, "utf8");
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    if (new RegExp(`\\b${name}\\s*\\(`).test(code)) {
      callers.push(path.relative(projectRoot, file));
    }
  }
  return callers;
}

test("Shadow mode wiring gap (V7 Phase 1 step 3 → step 4)", async (t) => {
  await t.test("recordShadowOutcome has a real caller", async () => {
    const callers = await findRealCallers("recordShadowOutcome");

    assert.ok(
      callers.length > 0,
      [
        "",
        "recordShadowOutcome has no caller yet — this test fails on purpose",
        "until step 4 wires it. Do not delete without wiring.",
        "",
        "Why it matters: without this hook the owner's real scoring decisions are",
        "never recorded against the agent's proposals, so no divergence data ever",
        "accumulates. Shadow mode would run, log proposals, and measure nothing.",
        "The pairing cannot be rebuilt later.",
        "",
        "Wiring it needs three things, none of them one-liners:",
        "  1. a dedicated ledger read helper for the latest proposal of a venture",
        "     (listActionLedgerForWorkspace is a generic list, not a lookup);",
        "  2. a tested contract rebuilding VentureScoreProposal from ledger",
        "     metadata — a LOSSY conversion, rationales truncated to 240 chars;",
        "  3. the hook on scoreVentureAction, which is the owner's live scoring",
        "     path and is a risk-profile change, not an addition.",
        "",
        "This test passes automatically once a real caller exists.",
        "",
      ].join("\n"),
    );
  });

  await t.test("runShadowScorePass has a real caller", async () => {
    const callers = await findRealCallers("runShadowScorePass");

    assert.ok(
      callers.length > 0,
      [
        "",
        "runShadowScorePass has no caller yet — this test fails on purpose",
        "until step 4 wires it. Do not delete without wiring.",
        "",
        "The step-4 phased cron is what triggers it. Until then no proposal is",
        "ever produced, which is the only reason the missing outcome hook above",
        "is currently harmless.",
        "",
        "This test passes automatically once a real caller exists.",
        "",
      ].join("\n"),
    );
  });

  await t.test("the detector recognizes a real caller when one exists", async () => {
    // Guards the tripwire itself: if this scan silently stopped finding
    // anything, the two tests above would go green without a line being wired.
    const known = await findRealCallers("buildVentureScoreProposal");

    assert.ok(
      known.length > 0,
      "the caller scan found nothing for a symbol that is definitely called — " +
        "the detector is broken, and the two gap tests above cannot be trusted",
    );
  });
});
