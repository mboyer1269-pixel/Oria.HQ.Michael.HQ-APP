#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("Approval Derivation tests", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const { deriveMissionApprovalConfirmation } = await jiti.import(
    path.join(__dirname, "approval-derivation.ts")
  );

  const validMission = {
    id: "msn_123",
    workspaceId: "michael-hq",
    modeId: "hq",
    title: "Test Draft",
    objective: "Test objective",
    assignedAgentId: "joris",
    status: "queued",
    input: {},
  };

  const validRecord = {
    id: "appr_123",
    missionId: "msn_123",
    status: "approved",
    approvalScope: ["transition_to_running"],
    approvedBy: "local-michael",
    approvedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  await t.test("valid persisted approval derives approvalConfirmed true", () => {
    // Clone to ensure no mutation
    const missionClone = JSON.parse(JSON.stringify(validMission));
    const recordClone = JSON.parse(JSON.stringify(validRecord));

    const res = deriveMissionApprovalConfirmation(missionClone, recordClone);

    assert.equal(res.approvalConfirmed, true);
    if (res.approvalConfirmed) {
      assert.deepEqual(res.record, recordClone);
    }

    assert.deepEqual(missionClone, validMission);
    assert.deepEqual(recordClone, validRecord);
  });

  await t.test("null record derives false", () => {
    const res = deriveMissionApprovalConfirmation(validMission, null);
    assert.equal(res.approvalConfirmed, false);
    if (!res.approvalConfirmed) assert.equal(res.reason, "no_record");
  });

  await t.test("mission mismatch derives false", () => {
    const res = deriveMissionApprovalConfirmation(validMission, { ...validRecord, missionId: "msn_wrong" });
    assert.equal(res.approvalConfirmed, false);
    if (!res.approvalConfirmed) assert.equal(res.reason, "mission_mismatch");
  });

  await t.test("pending/rejected/expired records derive false", () => {
    const pendingRes = deriveMissionApprovalConfirmation(validMission, { ...validRecord, status: "pending" });
    assert.equal(pendingRes.approvalConfirmed, false);
    if (!pendingRes.approvalConfirmed) assert.equal(pendingRes.reason, "not_approved");

    const rejectedRes = deriveMissionApprovalConfirmation(validMission, { ...validRecord, status: "rejected" });
    assert.equal(rejectedRes.approvalConfirmed, false);
    if (!rejectedRes.approvalConfirmed) assert.equal(rejectedRes.reason, "not_approved");

    const pastDate = new Date(Date.now() - 10000).toISOString();
    const expiredRes = deriveMissionApprovalConfirmation(validMission, { ...validRecord, expiresAt: pastDate });
    assert.equal(expiredRes.approvalConfirmed, false);
    if (!expiredRes.approvalConfirmed) assert.equal(expiredRes.reason, "expired");
  });

  await t.test("missing approver derives false", () => {
    const res = deriveMissionApprovalConfirmation(validMission, { ...validRecord, approvedBy: undefined });
    assert.equal(res.approvalConfirmed, false);
    if (!res.approvalConfirmed) assert.equal(res.reason, "missing_approver");
  });

  await t.test("missing approvedAt derives false", () => {
    const res = deriveMissionApprovalConfirmation(validMission, { ...validRecord, approvedAt: undefined });
    assert.equal(res.approvalConfirmed, false);
    if (!res.approvalConfirmed) assert.equal(res.reason, "missing_timestamp");
  });

  await t.test("missing transition_to_running scope derives false", () => {
    const res = deriveMissionApprovalConfirmation(validMission, { ...validRecord, approvalScope: ["full_mission"] });
    assert.equal(res.approvalConfirmed, false);
    if (!res.approvalConfirmed) assert.equal(res.reason, "scope_missing");
  });
});
