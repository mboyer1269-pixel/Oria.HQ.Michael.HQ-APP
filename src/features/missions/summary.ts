import type { Mission, MissionStatus } from "@/core/types";

export type MissionStatusCounts = Record<MissionStatus, number>;

export type MissionSummary = {
  total: number;
} & MissionStatusCounts;

const ZERO_COUNTS: MissionStatusCounts = {
  draft: 0,
  queued: 0,
  running: 0,
  needs_approval: 0,
  completed: 0,
  failed: 0,
  cancelled: 0,
};

/**
 * Pure function — no I/O. Counts missions by status in one pass.
 * Call sites replace scattered missions.filter() chains with named fields.
 */
export function summarizeMissions(missions: Mission[]): MissionSummary {
  const counts = { ...ZERO_COUNTS };
  for (const m of missions) {
    counts[m.status]++;
  }
  return { total: missions.length, ...counts };
}
