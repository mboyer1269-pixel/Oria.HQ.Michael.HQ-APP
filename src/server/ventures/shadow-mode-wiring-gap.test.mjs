#!/usr/bin/env node

// src/server/ventures/shadow-mode-wiring-gap.test.mjs
//
// Wiring tripwire. It fails while a gap is open and passes once the gap closes.
//
// Condition asserted: `runShadowScorePass` and `recordShadowOutcome` each have
// at least one caller in production source. Both are currently uncalled, so
// both assertions fail. Expected state until the step-4 wiring lands.
//
// Why the condition matters: `runShadowScorePass` produces proposals and
// `recordShadowOutcome` records the owner's decision against one. Divergence
// between them is the output shadow mode exists to produce, and a proposal with
// no matching outcome cannot be paired retroactively — a window where proposals
// flow without the hook produces data that stays unusable.
//
// Detection is behavioural, not hardcoded: the scan reads production source
// with comments stripped and looks for call sites. It reports green as soon as
// a real caller exists, with no edit to this file.
//
// Removing this file removes the only automated check that the measurement half
// of shadow mode is unwired. It is expected to be deleted when the gap closes,
// not to make a suite green.

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
    // Both extensions, both conventions. Excluding only *.test.ts would let a
    // call from a *.test.tsx file satisfy the tripwire while no production
    // caller exists — a guard that can pass falsely is worse than none.
    if (/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) continue;
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
