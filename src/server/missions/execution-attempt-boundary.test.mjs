#!/usr/bin/env node

// ---------------------------------------------------------------------------
// execution-attempt-boundary.test.mjs
//
// Locks the APPROVAL → EXECUTION-ATTEMPT boundary
// (src/server/missions/execution-attempt-boundary.ts). The boundary composes
// two already-tested primitives — the idempotency/rate-limit check
// (execution-attempt-store.ts, #280) and the derived approval confirmation
// (approval-derivation.ts) — into the single decision the /api/missions/plan
// route used to make inline.
//
// This closes the previously route-bound composition seam:
//   - missing idempotency key blocks the attempt (400, never executable)
//   - duplicate idempotency key blocks the attempt (409)
//   - rate-limited workspace blocks the attempt (429)
//   - missing / mismatched approval blocks an executable attempt
//   - pending / rejected (not_approved) / expired approval blocks an executable attempt
//   - idempotency/rate-limit blocking takes precedence over approval
//   - approved + fresh idempotency ⇒ attempt may be reserved and is executable
//
// Test-only: no source change, no DB, no Supabase, no runtime dispatch, no
// ledger write. The boundary helper is a pure function with no env gating.
// ---------------------------------------------------------------------------

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});

const boundaryPath = path.join(projectRoot, "src/server/missions/execution-attempt-boundary.ts");
const { evaluateExecutionAttemptBoundary } = await jiti.import(boundaryPath);

// --- realistic fixtures ----------------------------------------------------

const ALLOWED = { allowed: true };
const blocked = (reason) => ({ allowed: false, reason });

// A confirmed approval derivation, as deriveMissionApprovalConfirmation() would
// return for a verified record.
const APPROVAL_CONFIRMED = {
  approvalConfirmed: true,
  record: {
    id: "appr_1",
    missionId: "msn_1",
    status: "approved",
    approvedBy: "michael",
    approvedAt: "2026-06-09T12:00:00.000Z",
    expiresAt: "2026-06-09T13:00:00.000Z",
  },
};

// An unconfirmed approval derivation for a given fail reason.
const approvalDenied = (reason, record = null) => ({
  approvalConfirmed: false,
  record,
  reason,
});

// --- idempotency / rate-limit gate -----------------------------------------

test("a missing idempotency key blocks the attempt (400, never reservable/executable)", () => {
  const decision = evaluateExecutionAttemptBoundary({
    attemptCheck: blocked("missing_idempotency_key"),
    approval: APPROVAL_CONFIRMED,
  });
  assert.equal(decision.reservable, false);
  assert.equal(decision.executable, false);
  assert.equal(decision.reason, "missing_idempotency_key");
  assert.equal(decision.status, 400);
});

test("a duplicate idempotency key blocks the attempt (409)", () => {
  const decision = evaluateExecutionAttemptBoundary({
    attemptCheck: blocked("duplicate_key"),
    approval: APPROVAL_CONFIRMED,
  });
  assert.equal(decision.reservable, false);
  assert.equal(decision.executable, false);
  assert.equal(decision.reason, "duplicate_key");
  assert.equal(decision.status, 409);
});

test("a rate-limited workspace blocks the attempt (429)", () => {
  const decision = evaluateExecutionAttemptBoundary({
    attemptCheck: blocked("rate_limit_exceeded"),
    approval: APPROVAL_CONFIRMED,
  });
  assert.equal(decision.reservable, false);
  assert.equal(decision.executable, false);
  assert.equal(decision.reason, "rate_limit_exceeded");
  assert.equal(decision.status, 429);
});

// --- approval gate ---------------------------------------------------------

test("missing approval (no_record) blocks an executable attempt but allows reservation", () => {
  const decision = evaluateExecutionAttemptBoundary({
    attemptCheck: ALLOWED,
    approval: approvalDenied("no_record"),
  });
  assert.equal(decision.reservable, true);
  assert.equal(decision.executable, false);
  assert.equal(decision.reason, "approval_required");
  assert.equal(decision.approvalFailReason, "no_record");
});

test("mismatched approval (mission_mismatch) blocks an executable attempt", () => {
  const decision = evaluateExecutionAttemptBoundary({
    attemptCheck: ALLOWED,
    approval: approvalDenied("mission_mismatch"),
  });
  assert.equal(decision.reservable, true);
  assert.equal(decision.executable, false);
  assert.equal(decision.reason, "approval_required");
  assert.equal(decision.approvalFailReason, "mission_mismatch");
});

test("pending / rejected approval (not_approved) blocks an executable attempt", () => {
  const decision = evaluateExecutionAttemptBoundary({
    attemptCheck: ALLOWED,
    approval: approvalDenied("not_approved"),
  });
  assert.equal(decision.reservable, true);
  assert.equal(decision.executable, false);
  assert.equal(decision.reason, "approval_required");
  assert.equal(decision.approvalFailReason, "not_approved");
});

test("expired approval blocks an executable attempt", () => {
  const decision = evaluateExecutionAttemptBoundary({
    attemptCheck: ALLOWED,
    approval: approvalDenied("expired"),
  });
  assert.equal(decision.reservable, true);
  assert.equal(decision.executable, false);
  assert.equal(decision.reason, "approval_required");
  assert.equal(decision.approvalFailReason, "expired");
});

// --- precedence ------------------------------------------------------------

test("idempotency/rate-limit blocking takes precedence over approval", () => {
  // Even an approved mission is rejected outright when the key is a duplicate —
  // no reservation, mirroring the route's early return before approval mattered.
  const decision = evaluateExecutionAttemptBoundary({
    attemptCheck: blocked("duplicate_key"),
    approval: APPROVAL_CONFIRMED,
  });
  assert.equal(decision.reservable, false);
  assert.equal(decision.executable, false);
  assert.equal(decision.reason, "duplicate_key");
  assert.equal(decision.status, 409);
});

// --- happy path ------------------------------------------------------------

test("approved + fresh idempotency allows reservation and is executable", () => {
  const decision = evaluateExecutionAttemptBoundary({
    attemptCheck: ALLOWED,
    approval: APPROVAL_CONFIRMED,
  });
  assert.equal(decision.reservable, true);
  assert.equal(decision.executable, true);
  // The clear path carries no reject reason or status.
  assert.equal("reason" in decision, false);
  assert.equal("status" in decision, false);
});
