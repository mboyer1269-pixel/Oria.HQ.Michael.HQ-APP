#!/usr/bin/env node

// src/server/ventures/agent-score-snapshot-route.test.mjs
//
// The manual agent-scoring trigger writes rows to a live table on a human's
// command. These tests pin the properties that make that acceptable: it cannot
// be triggered by a prefetch, it cannot be triggered by a stranger, it signs
// the ledger as an agent that exists, and it does not report a clean failure
// when a partial write may have landed.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

const ROUTE = "src/app/api/ventures/agent-scores/snapshot/route.ts";
const PANEL = "src/features/ventures/components/agent-score-snapshot-panel.tsx";

const read = (relPath) => readFile(path.join(projectRoot, relPath), "utf8");
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("Agent score snapshot — the trigger is not reachable by accident", async (t) => {
  await t.test("it is POST, and there is no GET", async () => {
    // It writes to agent_score_snapshots. A link preview or a prefetch must not
    // be able to append rows.
    const source = await read(ROUTE);

    assert.match(source, /export async function POST\(/);
    assert.ok(!/export async function GET\(/.test(source), "no GET trigger");
  });

  await t.test("it is owner-gated before anything else happens", async () => {
    const source = await read(ROUTE);
    const code = stripComments(source);

    assert.match(code, /requireOwnerApiSession\(\)/);

    const guardAt = code.indexOf("requireOwnerApiSession");
    const workAt = code.indexOf("snapshotWorkspaceAgentScores(");
    assert.ok(guardAt > -1 && workAt > -1);
    assert.ok(guardAt < workAt, "the session check must precede the write");
  });
});

test("Agent score snapshot — the pass leaves a governance trace", async (t) => {
  await t.test("it records a ledger event", async () => {
    const code = stripComments(await read(ROUTE));
    assert.match(code, /recordLedgerEvent\(/);
  });

  await t.test("it signs as an agent on the frozen roster", async () => {
    // A ledger row signed by an unknown agent cannot be traced to a mandate.
    const code = stripComments(await read(ROUTE));
    const match = code.match(/agentId:\s*"([a-z_]+)"/);
    assert.ok(match, "the ledger event must name an agent");

    const charter = await read("src/features/agents/charter-seed.ts");
    assert.ok(
      charter.includes(`agentId: "${match[1]}"`),
      `"${match[1]}" is not on the roster — the trace would be unattributable`,
    );
  });

  await t.test("a failed ledger write does not discard a snapshot that happened", async () => {
    // The rows are already persisted at that point. Losing the trace is the
    // lesser harm; reporting a failure that did not occur is the greater one.
    const source = await read(ROUTE);
    const ledgerCall = source.slice(source.indexOf("recordLedgerEvent("));

    assert.match(ledgerCall.slice(0, 1200), /\.catch\(/);
  });
});

test("Agent score snapshot — a partial write is never reported as a clean failure", async (t) => {
  await t.test("the error response flags it", async () => {
    // snapshotWorkspaceAgentScores persists agent by agent without isolating
    // failures, so a throw part-way leaves earlier agents written. The owner
    // has to know that before reading the curve.
    const code = stripComments(await read(ROUTE));
    assert.match(code, /partialWritePossible:\s*true/);
  });

  await t.test("the panel surfaces it rather than showing a generic error", async () => {
    const code = stripComments(await read(PANEL));
    assert.match(code, /partialWritePossible/);
  });
});

test("Agent score snapshot — the panel does not invent data", async (t) => {
  await t.test("an empty pass reads as ran-and-found-nothing, not as failure", async () => {
    const panel = await read(PANEL);

    assert.match(panel, /agentsScored === 0/);
    assert.ok(
      /n&apos;est pas une erreur|pas une erreur/.test(panel),
      "an empty result must be visibly distinct from a failed one",
    );
  });

  await t.test("it reports how much proof fed each score", async () => {
    // A score built on two signals and one built on forty read identically
    // without the count beside them.
    const panel = await read(PANEL);
    assert.match(panel, /outcomeCount/);
  });
});
