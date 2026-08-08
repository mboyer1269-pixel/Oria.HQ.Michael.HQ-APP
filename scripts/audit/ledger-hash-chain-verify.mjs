#!/usr/bin/env node
/**
 * ledger-hash-chain-verify.mjs — operator verification that each block's
 * prev_hash equals the previous block's entry_hash (and that entry_hash
 * recomputes from canonical content).
 *
 * Bloc F / Étape 2: explicit linkage proof companion to `npm run ledger:audit`.
 *
 * Modes:
 *   1. Fixture mode (no args) — uses the sealed chain3 fixture, asserts linkage
 *      tip[i].prev_hash === tip[i-1].entry_hash for every step, then runs
 *      auditChain(). Fail-closed on any break or missed linkage assert.
 *   2. Snapshot mode (`<path-to-chain.json>`) — verifies an exported chain
 *      array the same way (entry_hash + linkage; HMAC only if LEDGER_HMAC_KEY
 *      is set in the process env — never required for linkage proof).
 *
 * Exit: 0 intact, 1 broken / unreadable. No DB writes. No .env mutation.
 */

import { readFileSync } from "node:fs";
import { auditChain } from "../../src/server/ledger/hash-chain-audit.ts";
import {
  TEST_HMAC_KEY,
  chain3,
} from "../../src/server/ledger/hash-chain-test-fixtures.ts";

function assertLinkage(entries, log) {
  let failures = 0;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const expectedPrev = i === 0 ? null : entries[i - 1].entry_hash;
    const ok = entry.prev_hash === expectedPrev;
    log(
      `  [${ok ? "ok" : "BREAK"}] #${i} ${entry.id}: prev_hash ${
        ok ? "matches" : "DOES NOT MATCH"
      } predecessor entry_hash`,
    );
    if (!ok) failures++;
  }
  return failures;
}

function runFixture(json) {
  const log = json ? () => {} : (msg = "") => console.log(msg);
  log("[ledger:verify] fixture linkage + audit (no DB, test HMAC only)");
  log("");

  const chain = [...chain3];

  log("[ledger:verify] prev_hash ↔ entry_hash linkage:");
  const linkFails = assertLinkage(chain, log);

  const report = auditChain(chain, { hmacKey: TEST_HMAC_KEY });
  log("");
  log(`[ledger:verify] audit: ${report.summary}`);

  // Tamper self-test: break linkage on entry #2 and require FAIL.
  const tampered = chain.map((e, i) =>
    i === 2 ? { ...e, prev_hash: "a".repeat(64) } : e,
  );
  const broken = auditChain(tampered, { hmacKey: TEST_HMAC_KEY });
  const caught = !broken.ok;
  log(
    `[ledger:verify] tamper self-test (linkage forge): ${caught ? "caught" : "MISSED"}`,
  );

  const ok = linkFails === 0 && report.ok && caught;
  if (json) {
    console.log(
      JSON.stringify({
        ok,
        linkFails,
        report,
        tamperCaught: caught,
      }),
    );
  } else {
    log("");
    log(ok ? "[ledger:verify] OK" : "[ledger:verify] FAIL");
  }
  process.exitCode = ok ? 0 : 1;
}

function runSnapshot(pathArg, json) {
  const log = json ? () => {} : (msg = "") => console.log(msg);
  let entries;
  try {
    entries = JSON.parse(readFileSync(pathArg, "utf8"));
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

  log(`[ledger:verify] snapshot ${pathArg} (${entries.length} entries)`);
  log("[ledger:verify] prev_hash ↔ entry_hash linkage:");
  const linkFails = assertLinkage(entries, log);

  const hmacKey = process.env.LEDGER_HMAC_KEY;
  const report = auditChain(entries, hmacKey ? { hmacKey } : {});
  log("");
  log(`[ledger:verify] audit: ${report.summary}`);

  const ok = linkFails === 0 && report.ok;
  if (json) {
    console.log(JSON.stringify({ ok, linkFails, report }));
  } else {
    log("");
    log(ok ? "[ledger:verify] OK" : "[ledger:verify] FAIL");
  }
  process.exitCode = ok ? 0 : 1;
}

const args = process.argv.slice(2).filter((a) => a !== "--json");
const json = process.argv.includes("--json");
const pathArg = args[0];

if (pathArg) {
  runSnapshot(pathArg, json);
} else {
  runFixture(json);
}
