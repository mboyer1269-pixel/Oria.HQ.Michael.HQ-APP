#!/usr/bin/env node
// G1 expiry contract, offline DI. No production seed hook or live database.
// Real createApproveHandler/service/dispatch with controlled decision-store
// clock; PostgreSQL consume semantics are proved separately by DB proofs 6/7.
// Keep the original no-admission/no-ledger expectations: do not weaken them
// merely because the older fixture previously failed on a missing test hook.
import assert from "node:assert/strict";
import test from "node:test";
import { expiryFixture } from "../../../proofs/approval-expiry-test-support.mjs";

test("(a) expired approved decision → refused, no ledger write, no dispatch, intent stays pending", async () => {
  const f = await expiryFixture("expiry-a", -3_600_000);
  try { await f.assertRefusedWithoutAdmission(await f.approve()); }
  finally { f.close(); }
});

test("(a) control: a decision valid for 1 hour is consumed and dispatches once", async () => {
  const f = await expiryFixture("expiry-a-ok", 3_600_000);
  try {
    const r = await f.approve();
    assert.equal(r.status, 200, JSON.stringify(r));
    assert.equal(f.n8n.calls.length, 1);
    assert.equal(f.store.isConsumed(f.decisionId), true);
    assert.equal((await f.intent()).status, "executed");
    assert.equal(f.ledger().filter(e => e.eventType === "action").length, 1);
  } finally { f.close(); }
});
