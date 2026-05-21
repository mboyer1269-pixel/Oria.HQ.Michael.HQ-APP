import type { Mission } from "@/core/types";

// ---------------------------------------------------------------------------
// Approval record status — tracks the lifecycle of a single approval decision.
// ---------------------------------------------------------------------------

export type MissionApprovalRecordStatus =
  | "pending"    // awaiting human decision
  | "approved"   // explicitly approved
  | "rejected"   // explicitly rejected
  | "expired";   // expiresAt is in the past

// ---------------------------------------------------------------------------
// Scope — the specific execution gating this approval unlocks.
// A record granting "transition_to_running" is required before the state
// machine allows mission.status: "queued" → "running".
// ---------------------------------------------------------------------------

export type MissionApprovalScope =
  | "transition_to_running"
  | "transition_to_needs_approval"  // reserved for future use
  | "full_mission";                 // reserved for future use

// ---------------------------------------------------------------------------
// MissionApprovalRecord — the persisted approval decision for a mission.
// Only an "approved" record with a valid scope unlocks the executor gate.
// ---------------------------------------------------------------------------

export type MissionApprovalRecord = {
  id: string;
  missionId: string;
  status: MissionApprovalRecordStatus;
  approvalScope: MissionApprovalScope[];
  /** User ID of the owner who approved or rejected. */
  approvedBy?: string;
  /** ISO timestamp of the approval or rejection decision. */
  approvedAt?: string;
  /** If set, approval is invalid after this ISO timestamp. */
  expiresAt?: string;
  reason?: string;
  /** ISO timestamp when this record was first created. */
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Input for creating a new approval record draft (pending decision).
// ---------------------------------------------------------------------------

export type MissionApprovalRecordInput = {
  missionId: string;
  approvalScope: MissionApprovalScope[];
  reason?: string;
  /** Optional: approval expiry as ISO timestamp. */
  expiresAt?: string;
};

// ---------------------------------------------------------------------------
// Result of verifying an approval record against a mission.
// ---------------------------------------------------------------------------

export type MissionApprovalVerificationResult =
  | {
      verified: true;
      record: MissionApprovalRecord;
    }
  | {
      verified: false;
      record: MissionApprovalRecord | null;
      reason: MissionApprovalVerificationFailReason;
    };

export type MissionApprovalVerificationFailReason =
  | "no_record"           // no record provided
  | "mission_mismatch"    // record.missionId !== mission.id
  | "not_approved"        // record.status !== "approved"
  | "missing_approver"    // record.approvedBy is absent
  | "missing_timestamp"   // record.approvedAt is absent
  | "expired"             // record.expiresAt is in the past
  | "scope_missing";      // required scope not in record.approvalScope

// ---------------------------------------------------------------------------
// createMissionApprovalRecordDraft
//
// Pure function — no I/O, no writes.
// Creates a typed draft with status "pending" and a stable createdAt timestamp.
// The draft must be persisted by the caller; this function only shapes the data.
// ---------------------------------------------------------------------------

export function createMissionApprovalRecordDraft(
  input: MissionApprovalRecordInput,
): Omit<MissionApprovalRecord, "id"> {
  return {
    missionId: input.missionId,
    status: "pending",
    approvalScope: input.approvalScope,
    reason: input.reason,
    expiresAt: input.expiresAt,
    createdAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// verifyMissionApprovalRecord
//
// Pure function — no I/O, no writes.
// Verifies that a record grants the right to transition mission.status to
// "running". All five gates must pass:
//   1. record.missionId === mission.id
//   2. record.status === "approved"
//   3. record.approvedBy is present
//   4. record.approvedAt is present
//   5. record.expiresAt is absent or in the future
//   6. record.approvalScope includes "transition_to_running"
//
// The live executor must call this and pass the returned MissionApprovalRecord
// to the gate chain instead of accepting approvalConfirmed: boolean freely.
// ---------------------------------------------------------------------------

export function verifyMissionApprovalRecord(
  mission: Mission,
  record: MissionApprovalRecord | null | undefined,
): MissionApprovalVerificationResult {
  if (!record) {
    return { verified: false, record: null, reason: "no_record" };
  }

  if (record.missionId !== mission.id) {
    return { verified: false, record, reason: "mission_mismatch" };
  }

  if (record.status !== "approved") {
    return { verified: false, record, reason: "not_approved" };
  }

  if (!record.approvedBy) {
    return { verified: false, record, reason: "missing_approver" };
  }

  if (!record.approvedAt) {
    return { verified: false, record, reason: "missing_timestamp" };
  }

  if (record.expiresAt && new Date(record.expiresAt) <= new Date()) {
    return { verified: false, record, reason: "expired" };
  }

  if (!record.approvalScope.includes("transition_to_running")) {
    return { verified: false, record, reason: "scope_missing" };
  }

  return { verified: true, record };
}
