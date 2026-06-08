#!/usr/bin/env node
/**
 * Ledger hash-chain audit — read-only operator / CI proof.
 *
 * Item #3 of docs/security/action-ledger-hash-chain-plan.md: a read-only audit
 * harness (sibling to scripts/audit/repo-truth.ps1) that runs auditChain() over
 * in-memory chains and emits an operator/CI-readable summary, failing CLOSED on
 * any break.
 *
 * Pure and side-effect free:
 *   - reads NOTHING from the database (Supabase) or environment,
 *   - reads NO secrets / .env,
 *   - applies NO migration,
 *   - never touches the live `action_ledger` path.
 *
 * It audits the known-good fixture chains (the same deterministic, in-memory
 * chains used by the unit tests) and runs a tamper-detection self-test. The
 * live action_ledger chain is not yet migrated; once it is, an exported chain
 * snapshot could be fed in here without changing the proof logic.
 *
 * Exit code (set via process.exitCode so the process drains and exits cleanly;
 * an explicit process.exit() can race the TS-loader teardown on Windows):
 *   0  — every intact chain verified AND tampering was detected (fail-closed proof holds)
 *   1  — any intact chain broke, or the auditor failed to flag the tampered control
 */

import { auditChain } from "../../src/server/ledger/hash-chain-audit.ts";
import {
  TEST_HMAC_KEY,
  chain1,
  chain3,
  chain5,
} from "../../src/server/ledger/hash-chain-test-fixtures.ts";

const HMAC_OPTIONS = { hmacKey: TEST_HMAC_KEY };

// Known-good, in-memory chains. No DB, no env, no live action_ledger.
const INTACT_CHAINS = [
  { label: "chain1 (genesis only)", entries: chain1 },
  { label: "chain3 (genesis + 2)", entries: chain3 },
  { label: "chain5 (genesis + 4)", entries: chain5 },
];

console.log(
  "[ledger:audit] hash-chain audit — read-only, in-memory fixtures (no DB, no secrets, no live action_ledger)",
);
console.log("");

let failures = 0;

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
  process.exitCode = 1;
} else {
  console.log("[ledger:audit] PASS — hash-chain audit intact and tamper-evident");
  process.exitCode = 0;
}
