#!/usr/bin/env node

// src/server/ventures/shadow-outcome-wiring.test.mjs
//
// Regression guard: the outcome hook stays reachable from the owner's scoring
// path.
//
// This began as a tripwire in `shadow-mode-wiring-gap.test.mjs`, red while the
// hook was unwired. Step 4b wired it, so the assertion moved here — a closed gap
// belongs with the green suite as a regression guard, not in the gap suite where
// red means "still open". Leaving it there would have made `test:gaps` report a
// solved problem forever.
//
// What it protects: if the call is removed from `scoreVentureAction`, the owner's
// decisions stop being paired against the agent's proposals and no divergence
// data accumulates — silently, since nothing would fail at runtime.

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");
const srcDir = path.join(projectRoot, "src");

const DEFINING_MODULES = new Set([
  "venture-score-shadow-runner.ts",
  "shadow-outcome-hook.ts",
]);

async function collectSourceFiles(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await collectSourceFiles(full)));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    if (/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) continue;
    if (DEFINING_MODULES.has(entry.name)) continue;
    found.push(full);
  }
  return found;
}

/**
 * Files reaching `name` from real code — comments and import lines stripped, so
 * neither a mention nor an unused import counts as wiring.
 */
async function findRealCallers(name) {
  const callers = [];
  for (const file of await collectSourceFiles(srcDir)) {
    const raw = await readFile(file, "utf8");
    const code = raw
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/^\s*import\s[\s\S]*?from\s+["'][^"']+["'];?\s*$/gm, "");
    if (new RegExp(`\\b${name}\\b`).test(code)) {
      callers.push(path.relative(projectRoot, file));
    }
  }
  return callers;
}

test("Shadow outcome wiring (V7 Phase 1 step 4b)", async (t) => {
  await t.test("the outcome hook is reached from production code", async () => {
    const callers = await findRealCallers("recordShadowOutcomeForVenture");

    assert.ok(
      callers.length > 0,
      "recordShadowOutcomeForVenture must stay wired — without it the owner's " +
        "decisions are never paired against the agent's proposals, and nothing " +
        "would fail at runtime to reveal it",
    );
  });

  await t.test("the scoring action is one of those callers", async () => {
    // Named explicitly: the hook could be reached from somewhere harmless while
    // the path that matters — the owner scoring a venture — lost its call.
    const callers = await findRealCallers("recordShadowOutcomeForVenture");

    assert.ok(
      callers.some((file) => file.includes("venture-lifecycle-action")),
      `expected the scoring action among callers, found: ${callers.join(", ") || "none"}`,
    );
  });

  await t.test("the detector recognizes a symbol that is genuinely used", async () => {
    // Guards the guard: a silently broken scan would make both assertions above
    // pass without a line being wired.
    const known = await findRealCallers("scoreVenture");

    assert.ok(
      known.length > 0,
      "the scan found nothing for a symbol that is definitely used — the " +
        "detector is broken and the assertions above cannot be trusted",
    );
  });
});
