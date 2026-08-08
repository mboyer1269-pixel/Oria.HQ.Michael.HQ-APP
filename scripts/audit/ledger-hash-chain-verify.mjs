#!/usr/bin/env node
/**
 * ledger-hash-chain-verify.mjs — verify that each ledger block's entry_hash
 * matches the previous block's hash (linkage) and recomputes cleanly.
 *
 * Bloc F / Step 2: operator + CI proof that the chain cannot be silently
 * rewritten. Fail-closed.
 *
 * Modes:
 *   1. Fixture mode (no path) — builds a short sealed chain, verifies linkage
 *      and catches a deliberate prev_hash break.
 *   2. Snapshot mode (`<chain.json>`) — verifies an exported chain array.
 *
 *   --json — machine-readable result.
 *
 * No DB reads, no secrets, no live writes.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { appendSealedEntry } from "../../src/server/ledger/hash-chain-sealer.ts";
import { verifyChain } from "../../src/server/ledger/hash-chain-verifier.ts";
import { TEST_HMAC_KEY } from "../../src/server/ledger/hash-chain-test-fixtures.ts";

const args = process.argv.slice(2).filter((a) => a !== "--json");
const jsonMode = process.argv.includes("--json");
const snapshotPath = args[0];

function log(msg = "") {
  if (!jsonMode) console.log(msg);
}

function baseFields(id, summary, minute) {
  return {
    id,
    workspace_id: "ws_verify",
    user_id: "user_verify",
    agent_id: null,
    skill_id: null,
    mission_id: null,
    action_type: "verify.probe",
    event_type: "action",
    summary,
    autonomy_level: 1,
    requires_confirmation: false,
    payload: {},
    metadata: {},
    created_at: `2026-08-08T12:${String(minute).padStart(2, "0")}:00.000Z`,
  };
}

function assertLinkage(entries) {
  const breaks = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (i === 0) {
      if (entry.prev_hash !== null) {
        breaks.push({ index: i, reason: "genesis prev_hash must be null", entryId: entry.id });
      }
      continue;
    }
    const prev = entries[i - 1];
    if (entry.prev_hash !== prev.entry_hash) {
      breaks.push({
        index: i,
        reason: "prev_hash does not equal previous entry_hash",
        entryId: entry.id,
        expected: prev.entry_hash,
        actual: entry.prev_hash,
      });
    }
  }
  return breaks;
}

function runFixtureMode() {
  log("[ledger:verify] fixture mode — seal 3 blocks, prove linkage, catch a break");
  log("");

  let chain = [];
  chain = appendSealedEntry(chain, baseFields("led_0", "genesis", 0), { hmacKey: TEST_HMAC_KEY });
  chain = appendSealedEntry(chain, baseFields("led_1", "second", 1), { hmacKey: TEST_HMAC_KEY });
  chain = appendSealedEntry(chain, baseFields("led_2", "third", 2), { hmacKey: TEST_HMAC_KEY });

  const linkage = assertLinkage(chain);
  const verified = verifyChain(chain, { hmacKey: TEST_HMAC_KEY });

  log(`  linkage breaks: ${linkage.length}`);
  log(`  verifyChain: ${verified.ok ? "ok" : `BROKEN @ ${verified.brokenAt}`}`);

  const tampered = chain.map((e, i) =>
    i === 1 ? { ...e, prev_hash: "0".repeat(64) } : e,
  );
  const tamperedLinkage = assertLinkage(tampered);
  const tamperedVerify = verifyChain(tampered, { hmacKey: TEST_HMAC_KEY });

  log("");
  log("[ledger:verify] tamper self-test (expect BROKEN):");
  log(`  linkage breaks: ${tamperedLinkage.length}`);
  log(`  verifyChain: ${tamperedVerify.ok ? "ok (UNEXPECTED)" : `BROKEN @ ${tamperedVerify.brokenAt}`}`);

  const ok =
    linkage.length === 0 &&
    verified.ok === true &&
    tamperedLinkage.length > 0 &&
    tamperedVerify.ok === false;

  if (jsonMode) {
    console.log(
      JSON.stringify({
        mode: "fixture",
        ok,
        intact: { linkageBreaks: linkage.length, verifyOk: verified.ok, count: chain.length },
        tamper: {
          linkageBreaks: tamperedLinkage.length,
          verifyOk: tamperedVerify.ok,
          brokenAt: tamperedVerify.ok ? null : tamperedVerify.brokenAt,
        },
      }),
    );
  } else {
    log("");
    log(ok ? "[ledger:verify] OK — linkage proven; silent rewrite would fail closed" : "[ledger:verify] FAIL");
  }

  process.exitCode = ok ? 0 : 1;
}

function runSnapshotMode(filePath) {
  const abs = path.resolve(filePath);
  let entries;
  try {
    entries = JSON.parse(readFileSync(abs, "utf8"));
  } catch (err) {
    console.error(`[ledger:verify] cannot read snapshot: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  if (!Array.isArray(entries)) {
    console.error("[ledger:verify] snapshot must be a JSON array of chain entries");
    process.exitCode = 1;
    return;
  }

  const linkage = assertLinkage(entries);
  const verified = verifyChain(entries);
  const ok = linkage.length === 0 && verified.ok === true;

  if (jsonMode) {
    console.log(
      JSON.stringify({
        mode: "snapshot",
        path: abs,
        ok,
        count: entries.length,
        linkageBreaks: linkage,
        verifyOk: verified.ok,
        brokenAt: verified.ok ? null : verified.brokenAt,
        reason: verified.ok ? null : verified.reason,
      }),
    );
  } else {
    log(`[ledger:verify] snapshot ${abs}`);
    log(`  entries: ${entries.length}`);
    log(`  linkage breaks: ${linkage.length}`);
    log(`  verifyChain: ${verified.ok ? "ok" : `BROKEN @ ${verified.brokenAt} (${verified.reason})`}`);
    log("");
    log(ok ? "[ledger:verify] OK" : "[ledger:verify] FAIL");
  }

  process.exitCode = ok ? 0 : 1;
}

if (snapshotPath) {
  runSnapshotMode(snapshotPath);
} else {
  runFixtureMode();
}
