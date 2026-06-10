#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("Approval Record Repository (Fallback) tests", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  // Test relies on natural fallback:
  // process.env.NODE_ENV is not "production", so local fallback is allowed.
  // No Supabase vars are set, so admin client returns null.

  const { insertMissionApprovalRecord, getMissionApprovalRecord, __clearMockApprovalRecords } = await jiti.import(
    path.join(__dirname, "approval-record-repository.ts")
  );

  // Pure verifier — used to prove that persistence is data-only and never
  // implies execution approval by itself.
  const { verifyMissionApprovalRecord } = await jiti.import(
    path.join(__dirname, "approval-record.ts")
  );

  t.afterEach(() => {
    __clearMockApprovalRecords();
  });

  const sampleRecord = {
    id: "appr_123",
    missionId: "msn_456",
    status: "approved",
    approvalScope: ["transition_to_running"],
    approvedBy: "local-michael",
    approvedAt: "2026-05-28T12:00:00.000Z",
    createdAt: "2026-05-28T11:00:00.000Z",
  };

  await t.test("can insert and retrieve an approval record from local fallback", async () => {
    await insertMissionApprovalRecord(sampleRecord);
    const retrieved = await getMissionApprovalRecord("msn_456");

    assert.ok(retrieved);
    assert.deepEqual(retrieved, sampleRecord);
  });

  await t.test("returns null if no record exists for missionId", async () => {
    const retrieved = await getMissionApprovalRecord("msn_missing");
    assert.equal(retrieved, null);
  });

  await t.test("retrieves the most recent record when multiple exist", async () => {
    await insertMissionApprovalRecord(sampleRecord);
    const newerRecord = { ...sampleRecord, id: "appr_124", status: "rejected" };
    await insertMissionApprovalRecord(newerRecord);

    const retrieved = await getMissionApprovalRecord("msn_456");
    assert.ok(retrieved);
    assert.equal(retrieved.id, "appr_124");
    assert.equal(retrieved.status, "rejected");
  });

  await t.test("preserves every critical audit field through the fallback round-trip", async () => {
    // A full record exercising all optional audit fields (expiresAt, reason).
    const fullRecord = {
      id: "appr_full",
      missionId: "msn_fields",
      status: "approved",
      approvalScope: ["transition_to_running"],
      approvedBy: "local-michael",
      approvedAt: "2026-05-28T12:00:00.000Z",
      expiresAt: "2999-01-01T00:00:00.000Z",
      reason: "Owner approved transition to running.",
      createdAt: "2026-05-28T11:00:00.000Z",
    };

    await insertMissionApprovalRecord(fullRecord);
    const retrieved = await getMissionApprovalRecord("msn_fields");

    assert.ok(retrieved);
    // Pin each audit-critical field individually so a future refactor that drops
    // or renames any of them fails loudly here.
    assert.equal(retrieved.id, fullRecord.id);
    assert.equal(retrieved.missionId, fullRecord.missionId);
    assert.equal(retrieved.status, fullRecord.status);
    assert.deepEqual(retrieved.approvalScope, fullRecord.approvalScope);
    assert.equal(retrieved.approvedBy, fullRecord.approvedBy);
    assert.equal(retrieved.approvedAt, fullRecord.approvedAt);
    assert.equal(retrieved.expiresAt, fullRecord.expiresAt);
    assert.equal(retrieved.reason, fullRecord.reason);
    assert.equal(retrieved.createdAt, fullRecord.createdAt);
  });

  await t.test("persisted non-approved status is data only and does not grant execution", async () => {
    // A pending record carrying the execution scope, fully shaped — persistence
    // must NOT be mistaken for approval. The gate is verifyMissionApprovalRecord.
    const pending = {
      id: "appr_pending",
      missionId: "msn_pending",
      status: "pending",
      approvalScope: ["transition_to_running"],
      approvedBy: "local-michael",
      approvedAt: "2026-05-28T12:00:00.000Z",
      createdAt: "2026-05-28T11:00:00.000Z",
    };

    await insertMissionApprovalRecord(pending);
    const retrieved = await getMissionApprovalRecord("msn_pending");

    assert.ok(retrieved);
    assert.equal(retrieved.status, "pending"); // stored verbatim, as data

    // The verifier — not persistence — is the execution gate. A stored pending
    // record must fail verification.
    const verdict = verifyMissionApprovalRecord({ id: "msn_pending" }, retrieved);
    assert.equal(verdict.verified, false);
    assert.equal(verdict.reason, "not_approved");
  });

  await t.test("persisted approved-but-expired record still does not grant execution", async () => {
    // An "approved" status that is past its expiry: persisting it must not unlock
    // the executor — the verifier rejects it as expired.
    const expired = {
      id: "appr_expired",
      missionId: "msn_expired",
      status: "approved",
      approvalScope: ["transition_to_running"],
      approvedBy: "local-michael",
      approvedAt: "2020-01-01T00:00:00.000Z",
      expiresAt: "2020-01-02T00:00:00.000Z",
      createdAt: "2020-01-01T00:00:00.000Z",
    };

    await insertMissionApprovalRecord(expired);
    const retrieved = await getMissionApprovalRecord("msn_expired");

    assert.ok(retrieved);
    const verdict = verifyMissionApprovalRecord({ id: "msn_expired" }, retrieved);
    assert.equal(verdict.verified, false);
    assert.equal(verdict.reason, "expired");
  });

  await t.test("production never silently uses the local fallback", async () => {
    // In production, with no Supabase admin client configured, the repository
    // must FAIL CLOSED rather than silently persisting to (or reading from) the
    // in-memory mock. isLocalPersistenceFallbackAllowed() reads NODE_ENV at call
    // time; serverEnv has no Supabase config (none set in the test env), so the
    // admin client is null and the guard is reached. No real Supabase call.
    const previousNodeEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";

      await assert.rejects(
        () => insertMissionApprovalRecord(sampleRecord),
        /Supabase configuration is required for mission approvals persistence in production/,
      );

      await assert.rejects(
        () => getMissionApprovalRecord("msn_456"),
        /Supabase configuration is required for mission approvals persistence in production/,
      );
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });
});
