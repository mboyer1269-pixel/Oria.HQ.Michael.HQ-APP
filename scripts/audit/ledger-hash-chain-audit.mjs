#!/usr/bin/env node
/**
 * Ledger hash-chain audit — read-only operator / CI proof.
 *
 * Item #3 of docs/security/action-ledger-hash-chain-plan.md: a read-only audit
 * harness (sibling to scripts/audit/repo-truth.ps1) that runs auditChain() and
 * emits an operator/CI-readable summary, failing CLOSED on any break.
 *
 * Two modes:
 *
 *   1. Fixture mode (no args) — audits the known-good in-memory fixture chains
 *      and runs a tamper-detection self-test (content / linkage / hmac). This is
 *      the CI proof: a green run means clean chains pass AND every tamper vector
 *      is caught.
 *
 *   2. Snapshot mode (`<path-to-chain.json>`) — audits an exported chain snapshot
 *      (a JSON array of ledger chain entries) for entry_hash + linkage integrity.
 *      hmac is intentionally NOT checked here: the hmac seal needs the workspace
 *      key, which lives server-side, never in this script.
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

function runFixtureSelfTest() {
  console.log(
    "[ledger:audit] hash-chain audit — read-only, in-memory fixtures (no DB, no secrets, no live action_ledger)",
  );
  console.log("");

  let failures = 0;

  // Known-good, in-memory chains.
  const INTACT_CHAINS = [
    { label: "chain1 (genesis only)", entries: chain1 },
    { label: "chain3 (genesis + 2)", entries: chain3 },
    { label: "chain5 (genesis + 4)", entries: chain5 },
  ];

  console.log("[ledger:audit] integrity checks (expect intact):");
  for (const { label, entries } of INTACT_CHAINS) {
    const report = auditChain(entries, HMAC_OPTIONS);
    console.log(`  [${report.ok ? "ok" : "BROKEN"}] ${label}: ${report.summary}`);
    if (!report.ok) failures++;
  }

  // Fail-closed self-test: each deliberately broken chain MUST be reported broken.
  // Covers all three tamper vectors (content, linkage, hmac) so a green run proves
  // the auditor catches every break type — not just edited content.
  console.log("");
  console.log("[ledger:audit] tamper-detection self-test (each expect BROKEN):");

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

  for (const { label, mutate } of BREAK_CASES) {
    const broken = [...chain3];
    mutate(broken);
    const report = auditChain(broken, HMAC_OPTIONS);
    if (report.ok) {
      console.log(`  [FAIL] ${label}: NOT detected — auditor is not fail-closed`);
      failures++;
    } else {
      console.log(`  [ok] ${label}: ${report.summary}`);
    }
  }

  console.log("");
  if (failures > 0) {
    console.error(`[ledger:audit] FAIL — ${failures} check(s) failed`);
    return 1;
  }
  console.log("[ledger:audit] PASS — hash-chain audit intact and tamper-evident");
  return 0;
}

// ─── Snapshot mode ────────────────────────────────────────────────────────────

function runSnapshotAudit(filePath) {
  const resolved = path.resolve(process.cwd(), filePath);
  console.log(`[ledger:audit] hash-chain audit — snapshot: ${resolved}`);
  console.log(
    "[ledger:audit] (read-only; entry_hash + linkage only — hmac is sealed/verified server-side where the key lives)",
  );
  console.log("");

  let raw;
  try {
    raw = readFileSync(resolved, "utf8");
  } catch (err) {
    console.error(`[ledger:audit] FAIL — cannot read ${resolved}: ${err.message}`);
    return 1;
  }

  let entries;
  try {
    entries = JSON.parse(raw);
  } catch (err) {
    console.error(`[ledger:audit] FAIL — ${resolved} is not valid JSON: ${err.message}`);
    return 1;
  }

  if (!Array.isArray(entries)) {
    console.error(
      "[ledger:audit] FAIL — snapshot must be a JSON array of ledger chain entries",
    );
    return 1;
  }

  // No hmac key: an offline snapshot proves content + linkage integrity; the
  // hmac seal needs the workspace key and is checked where that key lives.
  let report;
  try {
    report = auditChain(entries);
  } catch (err) {
    console.error(`[ledger:audit] FAIL — could not audit snapshot: ${err.message}`);
    return 1;
  }

  console.log(`  [${report.ok ? "ok" : "BROKEN"}] ${report.summary}`);
  return report.ok ? 0 : 1;
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

const fileArg = process.argv.slice(2).find((arg) => !arg.startsWith("-"));
process.exitCode = fileArg ? runSnapshotAudit(fileArg) : runFixtureSelfTest();
