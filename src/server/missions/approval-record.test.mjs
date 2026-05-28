#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("MissionApprovalRecord contract tests", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const { verifyMissionApprovalRecord } = await jiti.import(
    path.join(__dirname, "approval-record.ts")
  );

  const baseMission = {
    id: "msn_123",
    status: "queued",
  };

  const baseRecord = {
    id: "rec_123",
    missionId: "msn_123",
    status: "approved",
    approvalScope: ["transition_to_running"],
    approvedBy: "usr_owner_1",
    approvedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  await t.test("rejects missing record", () => {
    const res = verifyMissionApprovalRecord(baseMission, null);
    assert.equal(res.verified, false);
    assert.equal(res.reason, "no_record");
  });

  await t.test("rejects mission mismatch", () => {
    const res = verifyMissionApprovalRecord({ ...baseMission, id: "msn_999" }, baseRecord);
    assert.equal(res.verified, false);
    assert.equal(res.reason, "mission_mismatch");
  });

  await t.test("rejects unapproved status", () => {
    const res = verifyMissionApprovalRecord(baseMission, { ...baseRecord, status: "pending" });
    assert.equal(res.verified, false);
    assert.equal(res.reason, "not_approved");
  });

  await t.test("rejects missing approver", () => {
    const res = verifyMissionApprovalRecord(baseMission, { ...baseRecord, approvedBy: undefined });
    assert.equal(res.verified, false);
    assert.equal(res.reason, "missing_approver");
  });

  await t.test("rejects missing approvedAt timestamp", () => {
    const res = verifyMissionApprovalRecord(baseMission, { ...baseRecord, approvedAt: undefined });
    assert.equal(res.verified, false);
    assert.equal(res.reason, "missing_timestamp");
  });

  await t.test("rejects expired approval", () => {
    const expiredRecord = {
      ...baseRecord,
      expiresAt: new Date(Date.now() - 10000).toISOString(),
    };
    const res = verifyMissionApprovalRecord(baseMission, expiredRecord);
    assert.equal(res.verified, false);
    assert.equal(res.reason, "expired");
  });

  await t.test("rejects missing transition_to_running scope", () => {
    const res = verifyMissionApprovalRecord(baseMission, { ...baseRecord, approvalScope: ["full_mission"] });
    assert.equal(res.verified, false);
    assert.equal(res.reason, "scope_missing");
  });

  await t.test("accepts valid approval", () => {
    const res = verifyMissionApprovalRecord(baseMission, baseRecord);
    assert.equal(res.verified, true);
    if (res.verified) {
      assert.equal(res.record.id, baseRecord.id);
    }
  });

  await t.test("accepts valid approval with future expiration", () => {
    const validRecord = {
      ...baseRecord,
      expiresAt: new Date(Date.now() + 100000).toISOString(),
    };
    const res = verifyMissionApprovalRecord(baseMission, validRecord);
    assert.equal(res.verified, true);
  });
});
