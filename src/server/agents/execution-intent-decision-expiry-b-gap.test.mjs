#!/usr/bin/env node
// G1 expiry contract, offline DI. No production seed hook or live database.
// Real createApproveHandler/service/dispatch with controlled decision-store
// clock; PostgreSQL consume semantics are proved separately by DB proofs 6/7.
// Keep the original no-admission/no-ledger expectations: do not weaken them
// merely because the older fixture previously failed on a missing test hook.
import test from "node:test";
import { expiryFixture } from "../../../proofs/approval-expiry-test-support.mjs";

test("(b) decision expiring exactly at the store's now() → refused, no ledger write, no dispatch", async () => {
  const f = await expiryFixture("expiry-b", 0);
  try { await f.assertRefusedWithoutAdmission(await f.approve()); }
  finally { f.close(); }
});
