import { isLocalPersistenceFallbackAllowed } from "@/lib/server-env";
import { createOptionalSupabaseAdminClient } from "@/server/supabase/admin";
import type { MissionApprovalRecord } from "./approval-record";

// In-memory fallback array for local development without Supabase
const mockApprovalRecords: MissionApprovalRecord[] = [];

export async function insertMissionApprovalRecord(record: MissionApprovalRecord): Promise<void> {
  const supabase = createOptionalSupabaseAdminClient();

  if (supabase) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("mission_approvals") as any).insert({
      id: record.id,
      mission_id: record.missionId,
      status: record.status,
      approval_scope: record.approvalScope,
      approved_by: record.approvedBy ?? null,
      approved_at: record.approvedAt ?? null,
      expires_at: record.expiresAt ?? null,
      reason: record.reason ?? null,
      created_at: record.createdAt,
    });

    if (error) {
      throw new Error(`Failed to insert mission_approvals into Supabase: ${error.message}`);
    }
    return;
  }

  if (!isLocalPersistenceFallbackAllowed()) {
    throw new Error("Supabase configuration is required for mission approvals persistence in production.");
  }

  // Local fallback
  mockApprovalRecords.push({ ...record });
}

export async function getMissionApprovalRecord(missionId: string): Promise<MissionApprovalRecord | null> {
  const supabase = createOptionalSupabaseAdminClient();

  if (supabase) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from("mission_approvals") as any)
      .select()
      .eq("mission_id", missionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    // PGRST116 is "Results contain 0 rows"
    if (error && error.code !== "PGRST116") {
      throw new Error(`Failed to fetch mission_approvals from Supabase: ${error.message}`);
    }

    if (!data) return null;

    return {
      id: data.id,
      missionId: data.mission_id,
      status: data.status as MissionApprovalRecord["status"],
      approvalScope: data.approval_scope as MissionApprovalRecord["approvalScope"],
      approvedBy: data.approved_by ?? undefined,
      approvedAt: data.approved_at ?? undefined,
      expiresAt: data.expires_at ?? undefined,
      reason: data.reason ?? undefined,
      createdAt: data.created_at,
    };
  }

  if (!isLocalPersistenceFallbackAllowed()) {
    throw new Error("Supabase configuration is required for mission approvals persistence in production.");
  }

  const matches = mockApprovalRecords.filter((r) => r.missionId === missionId);
  if (matches.length === 0) return null;

  // return the most recent one to match DB logic
  return matches[matches.length - 1];
}

/**
 * Used purely for testing the fallback repository
 */
export function __clearMockApprovalRecords() {
  mockApprovalRecords.length = 0;
}
