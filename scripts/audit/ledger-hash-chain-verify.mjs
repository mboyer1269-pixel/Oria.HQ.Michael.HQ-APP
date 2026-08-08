#!/usr/bin/env node
/**
 * ledger-hash-chain-verify.mjs — operator verification that each block's
 * prev_hash equals the previous block's entry_hash (plus full entry_hash
 * recomputation via auditChain).
 *
 * Bloc F / Étape 2: fail-closed linkage proof for exported chain snapshots.
 *
 * Usage:
 *   npm run ledger:verify -- path/to/chain.json
 *   npm run ledger:verify -- path/to/chain.json --json
 *
 * Fixture self-test (no args): verifies intact fixtures AND that a deliberate
 * linkage break is detected.
 *
 * Exit: 0 intact / self-test pass; 1 broken or unreadable.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { auditChain } from "../../src/server/ledger/hash-chain-audit.ts";
import {
  TEST_HMAC_KEY,
  chain3,
  chain5,
} from "../../src/server/ledger/hash-chain-test-fixtures.ts";

function parseArgs(argv) {
  const json = argv.includes("--json");
  const pathArg = argv.find((arg) => !arg.startsWith("-"));
  return { json, pathArg };
}

function linkCheck(entries) {
  const links = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const prev = i === 0 ? null : entries[i - 1];
    const expectedPrev = prev ? prev.entry_hash : null;
    const actualPrev = entry.prev_hash ?? null;
    const ok =
      i === 0
        ? actualPrev === null || actualPrev === ""
          ? actualPrev === null
          : false
        : actualPrev === expectedPrev;

    links.push({
      index: i,
      id: entry.id ?? null,
      ok,
      expectedPrev,
      actualPrev,
      entryHash: typeof entry.entry_hash === "string" ? entry.entry_hash : null,
    });
  }
  return links;
}

function runSnapshot(filePath, asJson) {
  const abs = path.resolve(filePath);
  let entries;
  try {
    entries = JSON.parse(readFileSync(abs, "utf8"));
  } catch (err) {
    if (asJson) {
      console.log(JSON.stringify({ ok: false, error: String(err.message ?? err) }));
    } else {
      console.error(`[ledger:verify] cannot read snapshot: ${err.message}`);
    }
    process.exitCode = 1;
    return;
  }

  if (!Array.isArray(entries)) {
    if (asJson) {
      console.log(JSON.stringify({ ok: false, error: "snapshot must be a JSON array" }));
    } else {
      console.error("[ledger:verify] snapshot must be a JSON array of chain entries");
    }
    process.exitCode = 1;
    return;
  }

  const links = linkCheck(entries);
  const linkageOk = links.every((link) => link.ok);
  // Snapshot mode: entry_hash + linkage only (no hmac key in operator exports).
  const report = auditChain(entries);
  const ok = linkageOk && report.ok;

  if (asJson) {
    console.log(
      JSON.stringify({
        ok,
        path: abs,
        linkageOk,
        links,
        report: {
          ok: report.ok,
          count: report.count,
          verifiedCount: report.verifiedCount,
          genesisId: report.genesisId,
          tipId: report.tipId,
          brokenAt: report.brokenAt,
          reason: report.reason,
          summary: report.summary,
        },
      }),
    );
  } else {
    console.log(`[ledger:verify] snapshot ${abs}`);
    console.log(`[ledger:verify] linkage: ${linkageOk ? "OK" : "BROKEN"} (${links.length} links)`);
    for (const link of links) {
      const mark = link.ok ? "ok" : "BREAK";
      const expected = link.expectedPrev ? link.expectedPrev.slice(0, 12) + "…" : "null";
      const actual = link.actualPrev ? link.actualPrev.slice(0, 12) + "…" : "null";
      console.log(
        `  [${mark}] #${link.index} ${link.id ?? "?"} prev=${actual} expected=${expected}`,
      );
    }
    console.log(`[ledger:verify] audit: ${report.summary}`);
  }

  process.exitCode = ok ? 0 : 1;
}

function runSelfTest(asJson) {
  const log = asJson ? () => {} : (msg = "") => console.log(msg);
  let failures = 0;

  log("[ledger:verify] self-test — intact fixtures + deliberate linkage break");

  for (const { label, entries } of [
    { label: "chain3", entries: chain3 },
    { label: "chain5", entries: chain5 },
  ]) {
    const links = linkCheck(entries);
    const report = auditChain(entries, { hmacKey: TEST_HMAC_KEY });
    const ok = links.every((l) => l.ok) && report.ok;
    log(`  [${ok ? "ok" : "FAIL"}] ${label}: ${report.summary}`);
    if (!ok) failures++;
  }

  const broken = structuredClone(chain3);
  broken[2].prev_hash = "f".repeat(64);
  const brokenLinks = linkCheck(broken);
  const brokenReport = auditChain(broken, { hmacKey: TEST_HMAC_KEY });
  const caught = !brokenLinks.every((l) => l.ok) && !brokenReport.ok;
  log(
    `  [${caught ? "ok" : "FAIL"}] linkage break detected: ${brokenReport.reason ?? "missed"}`,
  );
  if (!caught) failures++;

  if (asJson) {
    console.log(JSON.stringify({ ok: failures === 0, failures, mode: "self-test" }));
  } else if (failures === 0) {
    log("[ledger:verify] PASS");
  } else {
    console.error(`[ledger:verify] FAIL — ${failures} issue(s)`);
  }

  process.exitCode = failures === 0 ? 0 : 1;
}

const { json, pathArg } = parseArgs(process.argv.slice(2));
if (pathArg) {
  runSnapshot(pathArg, json);
} else {
  runSelfTest(json);
}
