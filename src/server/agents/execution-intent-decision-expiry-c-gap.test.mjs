#!/usr/bin/env node
// G1 expiry contract, offline DI. No production seed hook or live database.
// Real createApproveHandler/service/dispatch with controlled decision-store
// clock; PostgreSQL consume semantics are proved separately by DB proofs 6/7.
// Keep the original no-admission/no-ledger expectations: do not weaken them
// merely because the older fixture previously failed on a missing test hook.
import assert from "node:assert/strict";
import test from "node:test";
import { expiryFixture } from "../../../proofs/approval-expiry-test-support.mjs";

test("(c) Promise.all on one valid decision → exactly one 200, one refusal, one dispatch, one ledger attempt", async () => {
  const f = await expiryFixture("expiry-c", 3_600_000);
  try {
    const rs = await Promise.all([f.approve(), f.approve()]);
    assert.equal(rs.filter(r => r.status === 200).length, 1, JSON.stringify(rs));
    assert.equal(rs.filter(r => r.status === 403 || r.status === 409).length, 1, JSON.stringify(rs));
    assert.equal(f.n8n.calls.length, 1);
    assert.equal(f.store.isConsumed(f.decisionId), true);
    assert.equal(f.ledger().filter(e => e.eventType === "action").length, 1);
    assert.equal((await f.intent()).status, "executed");
  } finally { f.close(); }
});
