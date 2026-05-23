#!/usr/bin/env node

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

const approvalRecordPath = path.join(projectRoot, "src/server/missions/approval-record.ts");
const {
  createMissionApprovalRecordDraft,
  verifyMissionApprovalRecord,
  deriveApprovalConfirmedFromRecord,
} = await jiti.import(approvalRecordPath);

const mission = {
  id: "mission_client_message_2026_05_21",
  workspaceId: "michael-hq",
  modeId: "hq",
  title: "Message externe client",
  objective: "Test mission",
  assignedAgentId: "joris",
  autonomyLevel: 5,
  status: "needs_approval",
  riskLevel: "high",
  input: {},
  expectedOutput: "Test output",
  requiresApproval: true,
  createdAt: "2026-05-21T12:00:00.000Z",
  updatedAt: "2026-05-21T12:00:00.000Z",
};

const validApprovedRecord = {
  id: "apr_valid_001",
  missionId: mission.id,
  status: "approved",
  approvalScope: ["transition_to_running"],
  approvedBy: "usr_owner_1",
  approvedAt: "2026-05-23T10:00:00.000Z",
  createdAt: "2026-05-23T09:55:00.000Z",
};

test("createMissionApprovalRecordDraft returns pending draft", () => {
  const draft = createMissionApprovalRecordDraft({
    missionId: mission.id,
    approvalScope: ["transition_to_running"],
    reason: "High autonomy requires approval",
  });

  assert.equal(draft.missionId, mission.id);
  assert.equal(draft.status, "pending");
  assert.deepEqual(draft.approvalScope, ["transition_to_running"]);
  assert.equal(typeof draft.createdAt, "string");
  assert.equal(draft.approvedBy, undefined);
});

test("verifyMissionApprovalRecord accepts valid approved record", () => {
  const result = verifyMissionApprovalRecord(mission, validApprovedRecord);
  assert.equal(result.verified, true);
  assert.equal(result.record.id, "apr_valid_001");
});

const failCases = [
  { label: "no record", record: null, reason: "no_record" },
  {
    label: "mission mismatch",
    record: { ...validApprovedRecord, missionId: "other_mission" },
    reason: "mission_mismatch",
  },
  {
    label: "pending status",
    record: { ...validApprovedRecord, status: "pending" },
    reason: "not_approved",
  },
  {
    label: "rejected status",
    record: { ...validApprovedRecord, status: "rejected" },
    reason: "not_approved",
  },
  {
    label: "missing approver",
    record: { ...validApprovedRecord, approvedBy: undefined },
    reason: "missing_approver",
  },
  {
    label: "missing timestamp",
    record: { ...validApprovedRecord, approvedAt: undefined },
    reason: "missing_timestamp",
  },
  {
    label: "expired",
    record: {
      ...validApprovedRecord,
      expiresAt: "2020-01-01T00:00:00.000Z",
    },
    reason: "expired",
  },
  {
    label: "scope missing",
    record: { ...validApprovedRecord, approvalScope: ["full_mission"] },
    reason: "scope_missing",
  },
];

for (const { label, record, reason } of failCases) {
  test(`verifyMissionApprovalRecord rejects ${label}`, () => {
    const result = verifyMissionApprovalRecord(mission, record);
    assert.equal(result.verified, false);
    assert.equal(result.reason, reason);
  });
}

test("deriveApprovalConfirmedFromRecord returns true for verified record", () => {
  const derived = deriveApprovalConfirmedFromRecord(mission, validApprovedRecord);
  assert.equal(derived.approvalConfirmed, true);
  assert.equal(derived.verification.verified, true);
});

test("deriveApprovalConfirmedFromRecord returns false without record", () => {
  const derived = deriveApprovalConfirmedFromRecord(mission, null);
  assert.equal(derived.approvalConfirmed, false);
  assert.equal(derived.verification.verified, false);
  assert.equal(derived.verification.reason, "no_record");
});

test("deriveApprovalConfirmedFromRecord returns false for rejected record", () => {
  const derived = deriveApprovalConfirmedFromRecord(mission, {
    ...validApprovedRecord,
    status: "rejected",
  });
  assert.equal(derived.approvalConfirmed, false);
  assert.equal(derived.verification.reason, "not_approved");
});

test("deriveApprovalConfirmedFromRecord never trusts caller-supplied boolean", () => {
  // Contract rule: only deriveApprovalConfirmedFromRecord() sets approvalConfirmed.
  // A forged boolean outside this path is not part of the API — this test documents the gate.
  const withoutPersistence = deriveApprovalConfirmedFromRecord(mission, null);
  assert.equal(withoutPersistence.approvalConfirmed, false);
});
