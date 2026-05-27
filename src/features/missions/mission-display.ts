import type { Mission } from "@/core/types";

export type MissionDisplayKind = "calendar_draft_confirmed" | "seed_pipeline" | "needs_executor_approval";

function readSkillId(input: Record<string, unknown>): string | undefined {
  const skillId = input.skillId;
  return typeof skillId === "string" ? skillId : undefined;
}

/**
 * Classifies how a mission row should be presented on /hq/missions.
 * Pending calendar proposals are not missions — they live in mission-draft-session on /hq.
 */
export function classifyMissionDisplayKind(mission: Mission): MissionDisplayKind {
  const skillId = readSkillId(mission.input);

  if (skillId === "calendar.book" || mission.id.startsWith("mission_draft_")) {
    return "calendar_draft_confirmed";
  }

  if (mission.status === "needs_approval" || mission.requiresApproval) {
    return "needs_executor_approval";
  }

  return "seed_pipeline";
}

export function isConfirmedCalendarDraftMission(mission: Mission): boolean {
  return classifyMissionDisplayKind(mission) === "calendar_draft_confirmed";
}
