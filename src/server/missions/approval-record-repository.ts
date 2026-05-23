import type { MissionApprovalRecord, MissionApprovalRecordInput } from "./approval-record";

/**
 * Read/write contract for persisted mission approval records.
 * No implementation in this module — Supabase wiring is PR #19C (Michael sign-off).
 */
export type MissionApprovalRecordRepository = {
  findByMissionId(missionId: string): Promise<MissionApprovalRecord | null>;
  createDraft(input: MissionApprovalRecordInput): Promise<MissionApprovalRecord>;
};
