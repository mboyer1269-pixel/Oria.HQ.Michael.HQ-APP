import type { Mission } from "@/core/types";
import type { MissionApprovalRecord, MissionApprovalVerificationFailReason } from "./approval-record";
import { verifyMissionApprovalRecord } from "./approval-record";

export type MissionApprovalDerivationResult =
  | {
      approvalConfirmed: true;
      record: MissionApprovalRecord;
    }
  | {
      approvalConfirmed: false;
      record: MissionApprovalRecord | null;
      reason: MissionApprovalVerificationFailReason;
    };

/**
 * Pure function that derives whether an approval is confirmed.
 * This MUST be the single source of truth for converting a persisted record
 * into the boolean `approvalConfirmed` flag required by the executor.
 */
export function deriveMissionApprovalConfirmation(
  mission: Mission,
  record: MissionApprovalRecord | null | undefined
): MissionApprovalDerivationResult {
  const verification = verifyMissionApprovalRecord(mission, record);

  if (verification.verified) {
    return {
      approvalConfirmed: true,
      record: verification.record,
    };
  }

  return {
    approvalConfirmed: false,
    record: verification.record,
    reason: verification.reason,
  };
}
