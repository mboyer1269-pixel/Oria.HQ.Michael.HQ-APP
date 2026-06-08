#!/usr/bin/env node
/**
 * Ledger hash-chain audit — read-only operator / CI proof.
 *
 * Item #3 of docs/security/action-ledger-hash-chain-plan.md: a read-only audit
 * harness (sibling to scripts/audit/repo-truth.ps1) that runs auditChain() and
 * emits an operator/CI-readable summary, failing CLOSED on any break.
 *
 * Modes:
 *
 *   1. Fixture mode (no path arg) — audits the known-good in-memory fixture
 *      chains and runs a tamper-detection self-test (content / linkage / hmac).
 *      A green run means clean chains pass AND every tamper vector is caught.
 *
 *   2. Snapshot mode (`<path-to-chain.json>`) — audits an exported chain snapshot
 *      (a JSON array of ledger chain entries) for entry_hash + linkage integrity.
 *      hmac is intentionally NOT checked here: the hmac seal needs the workspace
 *      key, which lives server-side, never in this script.
 *
 *   --json — emit one machine-readable JSON result instead of human log lines
 *            (for a future Ledger Health panel / dashboards). Exit code is the
 *            same; only the output format changes.
 *
 * Side effects: none beyond reading the snapshot file you explicitly pass.
 *   - reads NOTHING from the database (Supabase) or environment,
 *   - reads NO secrets / .env,
 *   - applies NO migration,
 *   - never touches the live `action_ledger` path.
 *
 * Exit code (set via process.exitCode so the process drains and exits cleanly;
 * an explicit process.exit() can race the TS-loader teardown on Windows):
 *   0  — chain(s) verified (and, in fixture mode, tampering was detected)
 *   1  — any chain broke, the self-test failed, or the snapshot was unreadable
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { auditChain } from "../../src/server/ledger/hash-chain-audit.ts";
import {
  TEST_HMAC_KEY,
  chain1,
  chain3,
  chain5,
} from "../../src/server/ledger/hash-chain-test-fixtures.ts";

const HMAC_OPTIONS = { hmacKey: TEST_HMAC_KEY };

// ─── Fixture mode ─────────────────────────────────────────────────────────────

function runFixtureSelfTest(json) {
  const log = json ? () => {} : (msg = "") => console.log(msg);

  log(
    "[ledger:audit] hash-chain audit — read-only, in-memory fixtures (no DB, no secrets, no live action_ledger)",
  );
  log("");

  let failures = 0;

  // Known-good, in-memory chains.
  const INTACT_CHAINS = [
    { label: "chain1 (genesis only)", entries: chain1 },
    { label: "chain3 (genesis + 2)", entries: chain3 },
    { label: "chain5 (genesis + 4)", entries: chain5 },
  ];

  log("[ledger:audit] integrity checks (expect intact):");
  const chains = [];
  for (const { label, entries } of INTACT_CHAINS) {
    const report = auditChain(entries, HMAC_OPTIONS);
    log(`  [${report.ok ? "ok" : "BROKEN"}] ${label}: ${report.summary}`);
    if (!report.ok) failures++;
    chains.push({ label, ok: report.ok, summary: report.summary });
  }

  // Fail-closed self-test: each deliberately broken chain MUST be reported broken.
  // Covers all three tamper vectors (content, linkage, hmac) so a green run proves
  // the auditor catches every break type — not just edited content.
  log("");
  log("[ledger:audit] tamper-detection self-test (each expect BROKEN):");

  const BREAK_CASES = [
    {
      label: "content tamper (entry #1 summary)",
      mutate: (chain) => {
        chain[1] = { ...chain[1], summary: "TAMPERED CONTENT" };
      },
    },
    {
      label: "linkage break (entry #2 prev_hash)",
      mutate: (chain) => {
        chain[2] = { ...chain[2], prev_hash: "f".repeat(64) };
      },
    },
    {
      label: "hmac forge (entry #2 hmac)",
      mutate: (chain) => {
        chain[2] = { ...chain[2], hmac: "0".repeat(64) };
      },
    },
  ];

  const selfTest = [];
  for (const { label, mutate } of BREAK_CASES) {
    const broken = [...chain3];
    mutate(broken);
    const report = auditChain(broken, HMAC_OPTIONS);
    const detected = !report.ok;
    if (detected) {
      log(`  [ok] ${label}: ${report.summary}`);
    } else {
      log(`  [FAIL] ${label}: NOT detected — auditor is not fail-closed`);
      failures++;
    }
    selfTest.push({ label, detected, summary: detected ? report.summary : null });
  }

  log("");
  const ok = failures === 0;
  if (ok) {
    log("[ledger:audit] PASS — hash-chain audit intact and tamper-evident");
  } else if (!json) {
    console.error(`[ledger:audit] FAIL — ${failures} check(s) failed`);
  }

  return { exitCode: ok ? 0 : 1, payload: { mode: "fixtures", ok, failures, chains, selfTest } };
}

// ─── Snapshot mode ────────────────────────────────────────────────────────────

function runSnapshotAudit(filePath, json) {
  const log = json ? () => {} : (msg = "") => console.log(msg);
  const resolved = path.resolve(process.cwd(), filePath);

  const fail = (error) => {
    if (!json) console.error(`[ledger:audit] FAIL — ${error}`);
    return { exitCode: 1, payload: { mode: "snapshot", file: resolved, ok: false, error } };
  };

  log(`[ledger:audit] hash-chain audit — snapshot: ${resolved}`);
  log(
    "[ledger:audit] (read-only; entry_hash + linkage only — hmac is sealed/verified server-side where the key lives)",
  );
  log("");

  let raw;
  try {
    raw = readFileSync(resolved, "utf8");
  } catch (err) {
    return fail(`cannot read ${resolved}: ${err.message}`);
  }

  let entries;
  try {
    entries = JSON.parse(raw);
  } catch (err) {
    return fail(`${resolved} is not valid JSON: ${err.message}`);
  }

  if (!Array.isArray(entries)) {
    return fail("snapshot must be a JSON array of ledger chain entries");
  }

  // No hmac key: an offline snapshot proves content + linkage integrity; the
  // hmac seal needs the workspace key and is checked where that key lives.
  let report;
  try {
    report = auditChain(entries);
  } catch (err) {
    return fail(`could not audit snapshot: ${err.message}`);
  }

  log(`  [${report.ok ? "ok" : "BROKEN"}] ${report.summary}`);
  return { exitCode: report.ok ? 0 : 1, payload: { mode: "snapshot", file: resolved, ok: report.ok, report } };
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const json = args.includes("--json");
const fileArg = args.find((arg) => !arg.startsWith("-"));

const result = fileArg ? runSnapshotAudit(fileArg, json) : runFixtureSelfTest(json);

if (json) console.log(JSON.stringify(result.payload, null, 2));
process.exitCode = result.exitCode;
