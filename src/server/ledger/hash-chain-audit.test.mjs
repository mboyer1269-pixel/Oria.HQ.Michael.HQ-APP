/**
 * hash-chain-audit.test.mjs
 *
 * Tests the operator-facing audit-report layer over verifyChain:
 *   - empty chain      -> ok, 0 entries, null genesis/tip
 *   - intact chains    -> ok, verifiedCount === count, genesis/tip ids, hmac flag
 *   - tampered content -> broken at the tampered index, verifiedCount = entries
 *                         proven intact before the break, reason + summary
 *   - broken linkage   -> broken at the relinked index (no hmac key path)
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const { auditChain } = await import("./hash-chain-audit.ts");
const { TEST_HMAC_KEY, chain1, chain3, chain5 } = await import(
  "./hash-chain-test-fixtures.ts"
);

const GENESIS_ID = "00000000-0000-0000-0000-000000000001";
const ID_2 = "00000000-0000-0000-0000-000000000002";
const ID_3 = "00000000-0000-0000-0000-000000000003";

test("auditChain: empty chain is vacuously intact", () => {
  const report = auditChain([], { hmacKey: TEST_HMAC_KEY });
  assert.equal(report.ok, true);
  assert.equal(report.count, 0);
  assert.equal(report.verifiedCount, 0);
  assert.equal(report.genesisId, null);
  assert.equal(report.tipId, null);
  assert.equal(report.brokenAt, null);
  assert.equal(report.summary, "ledger chain empty (0 entries)");
});

test("auditChain: single-entry chain without hmac key", () => {
  const report = auditChain(chain1); // no hmacKey
  assert.equal(report.ok, true);
  assert.equal(report.count, 1);
  assert.equal(report.verifiedCount, 1);
  assert.equal(report.genesisId, GENESIS_ID);
  assert.equal(report.tipId, GENESIS_ID);
  assert.equal(report.hmacChecked, false);
  assert.match(report.summary, /1 entry verified/);
  assert.ok(!report.summary.includes("hmac checked"));
});

test("auditChain: 3-entry intact chain with hmac check", () => {
  const report = auditChain(chain3, { hmacKey: TEST_HMAC_KEY });
  assert.equal(report.ok, true);
  assert.equal(report.count, 3);
  assert.equal(report.verifiedCount, 3);
  assert.equal(report.genesisId, GENESIS_ID);
  assert.equal(report.tipId, ID_3);
  assert.equal(report.hmacChecked, true);
  assert.equal(report.brokenAt, null);
  assert.match(report.summary, /intact: 3 entries verified \(hmac checked\)/);
  assert.match(report.summary, /genesis .*001 → tip .*003/);
});

test("auditChain: 5-entry intact chain reports full verifiedCount", () => {
  const report = auditChain(chain5, { hmacKey: TEST_HMAC_KEY });
  assert.equal(report.ok, true);
  assert.equal(report.count, 5);
  assert.equal(report.verifiedCount, 5);
});

test("auditChain: tampered middle content breaks at that index", () => {
  const tampered = [...chain3];
  tampered[1] = { ...chain3[1], summary: "TAMPERED CONTENT" };

  const report = auditChain(tampered, { hmacKey: TEST_HMAC_KEY });
  assert.equal(report.ok, false);
  assert.equal(report.count, 3);
  assert.equal(report.brokenAt, 1);
  assert.equal(report.verifiedCount, 1); // entry 0 verified before the break
  assert.equal(report.brokenEntryId, ID_2);
  assert.match(report.reason, /entry_hash mismatch/);
  assert.match(report.summary, /BROKEN at #1 \(.*002\): .* — 1\/3 entries verified before break/);
});

test("auditChain: broken linkage at index 2 (no hmac key)", () => {
  const tampered = [...chain3];
  tampered[2] = { ...chain3[2], prev_hash: "f".repeat(64) };

  const report = auditChain(tampered); // no hmacKey
  assert.equal(report.ok, false);
  assert.equal(report.brokenAt, 2);
  assert.equal(report.verifiedCount, 2);
  assert.equal(report.hmacChecked, false);
  assert.match(report.reason, /prev_hash does not match/);
});
