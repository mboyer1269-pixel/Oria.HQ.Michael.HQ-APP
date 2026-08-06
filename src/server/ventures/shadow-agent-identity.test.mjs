#!/usr/bin/env node

// src/server/ventures/shadow-agent-identity.test.mjs
//
// Shadow mode acts under an agent identity from the frozen roster, not one it
// invented for itself.
//
// An earlier revision wrote `venture_scorer`, which is not an agent. Every
// proposal, outcome and tick it produced carried an agentId no roster entry, no
// autonomy licence and no review cadence corresponds to — so the ledger would
// have attributed real work to something the governance layer does not know
// exists.
//
// `inventor` (Lab) is the right one, and not by elimination: it carries the
// `opportunity.score` skill, its mandate is literally scoring opportunities, and
// its output is defined as staying internal — which is exactly shadow mode.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});

const seed = await jiti.import(path.join(projectRoot, "src/features/agents/seed.ts"));

/** Every agent id the roster defines. */
const rosterIds = new Set(
  Object.values(seed)
    .filter((value) => Array.isArray(value))
    .flat()
    .filter((entry) => entry && typeof entry === "object" && typeof entry.id === "string")
    .map((entry) => entry.id),
);

/** Modules that name an acting agent when writing to the ledger. */
const SHADOW_MODULES = [
  "src/server/ventures/venture-score-shadow-runner.ts",
  "src/server/ventures/shadow-pass.ts",
];

test("Shadow mode agent identity (V7)", async (t) => {
  await t.test("the roster is readable and non-trivial", () => {
    // Guards the guard: an empty roster would make every assertion below pass
    // without checking anything.
    assert.ok(rosterIds.size >= 5, `expected a populated roster, got ${rosterIds.size}`);
    assert.ok(rosterIds.has("inventor"), "inventor must exist in the roster");
  });

  await t.test("inventor is the agent whose mandate is scoring opportunities", () => {
    // Chosen on its declared skill, not by elimination.
    const roster = Object.values(seed)
      .filter((value) => Array.isArray(value))
      .flat()
      .filter((entry) => entry && typeof entry === "object");
    const inventor = roster.find((entry) => entry.id === "inventor");

    assert.ok(inventor, "inventor must be in the roster");
    assert.ok(
      Array.isArray(inventor.skillIds) && inventor.skillIds.includes("opportunity.score"),
      "inventor must carry the opportunity.score skill",
    );
  });

  for (const relativePath of SHADOW_MODULES) {
    await t.test(`${path.basename(relativePath)} names only roster agents`, async () => {
      const raw = await readFile(path.join(projectRoot, relativePath), "utf8");
      const code = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

      // Any string literal assigned to an agent id, however it is spelled.
      const literals = [
        ...code.matchAll(/agentId(?:\s*[:=]|\s*\?\?)\s*"([^"]+)"/g),
        ...code.matchAll(/DEFAULT_AGENT_ID\s*=\s*"([^"]+)"/g),
      ].map((match) => match[1]);

      assert.ok(literals.length > 0, "the module must name an acting agent");

      for (const id of literals) {
        assert.ok(
          rosterIds.has(id),
          `"${id}" is not a roster agent — the ledger would attribute work to ` +
            "an identity governance does not know. Roster: " +
            [...rosterIds].sort().join(", "),
        );
      }
    });
  }

  await t.test("no shadow module still names the invented agent", async () => {
    for (const relativePath of SHADOW_MODULES) {
      const raw = await readFile(path.join(projectRoot, relativePath), "utf8");
      assert.ok(
        !raw.includes("venture_scorer"),
        `${relativePath} must not resurrect the off-roster id`,
      );
    }
  });
});
