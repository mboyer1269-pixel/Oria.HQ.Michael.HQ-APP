import type { Mission } from "@/core/types";
import { canTransitionMissionStatus } from "./state-machine";

export type DraftToQueuedBlockedReason =
  | "not_draft"
  | "queued_transition_not_allowed"
  | "missing_mission_id"
  | "missing_workspace_id"
  | "missing_mode_id"
  | "missing_assigned_agent_id"
  | "missing_title"
  | "missing_objective"
  | "missing_action_type"
  | "missing_skill_id";

export type DraftToQueuedPlan = {
  missionId: string;
  proposedStatus: "queued";
  actionType?: string;
  skillId?: string;
};

export type DraftToQueuedResult =
  | { allowed: true; plan: DraftToQueuedPlan }
  | { allowed: false; blockReasons: DraftToQueuedBlockedReason[] };

/**
 * Pure helper that evaluates whether a mission draft is structurally ready
 * to move from draft -> queued.
 * 
 * No I/O, no writes, no runtime dispatch.
 */
export function evaluateDraftToQueuedReadiness(mission: Mission): DraftToQueuedResult {
  const blockReasons: DraftToQueuedBlockedReason[] = [];

  // 1. mission.status === "draft"
  if (mission.status !== "draft") {
    blockReasons.push("not_draft");
  }

  // 2. "queued" is an allowed transition from current state
  if (!canTransitionMissionStatus(mission.status, "queued")) {
    blockReasons.push("queued_transition_not_allowed");
  }

  // 3-8. Core properties must exist
  if (!mission.id) blockReasons.push("missing_mission_id");
  if (!mission.workspaceId) blockReasons.push("missing_workspace_id");
  if (!mission.modeId) blockReasons.push("missing_mode_id");
  if (!mission.assignedAgentId) blockReasons.push("missing_assigned_agent_id");
  if (!mission.title) blockReasons.push("missing_title");
  if (!mission.objective) blockReasons.push("missing_objective");

  // 9. mission.input.skillId and actionType exist when applicable
  const hasExecutionInput = mission.input && Object.keys(mission.input).length > 0;
  if (hasExecutionInput) {
    if (!mission.input.skillId) {
      blockReasons.push("missing_skill_id");
    }
    if (!mission.input.actionType) {
      blockReasons.push("missing_action_type");
    }
  }

  if (blockReasons.length > 0) {
    return { allowed: false, blockReasons };
  }

  return {
    allowed: true,
    plan: {
      missionId: mission.id,
      proposedStatus: "queued",
      actionType: mission.input?.actionType as string | undefined,
      skillId: mission.input?.skillId as string | undefined,
    },
  };
}
