import type { Mission, MissionStatus } from "@/core/types";
import { evaluateMissionApproval } from "./approval-service";

// ---------------------------------------------------------------------------
// Transition map — defines every valid next state per current state.
// Terminal states (completed, failed, cancelled) have no valid transitions.
// ---------------------------------------------------------------------------

const ALLOWED_TRANSITIONS: Record<MissionStatus, MissionStatus[]> = {
  draft:           ["queued", "cancelled"],
  queued:          ["running", "needs_approval", "cancelled"],
  running:         ["needs_approval", "completed", "failed", "cancelled"],
  needs_approval:  ["queued", "running", "cancelled"],
  completed:       [],
  failed:          [],
  cancelled:       [],
};

export type MissionTransitionBlockReason =
  | "terminal_state"
  | "invalid_transition"
  | "approval_required"
  | "approval_not_confirmed";

export type MissionTransitionInput = {
  mission: Mission;
  to: MissionStatus;
  /** Must be true to transition into `running` when evaluateMissionApproval().blocksExecution is true. */
  approvalConfirmed?: boolean;
};

export type MissionTransitionEvaluation = {
  missionId: string;
  from: MissionStatus;
  to: MissionStatus;
  allowed: boolean;
  blockReasons: MissionTransitionBlockReason[];
};

/** Returns all valid next states from the given status. Empty array = terminal. */
export function getAllowedMissionTransitions(status: MissionStatus): MissionStatus[] {
  return ALLOWED_TRANSITIONS[status];
}

/** Fast boolean check — does not evaluate approval gates. */
export function canTransitionMissionStatus(from: MissionStatus, to: MissionStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * Full evaluation — checks structural validity and the approval gate.
 * Pure function: no I/O, no writes.
 */
export function evaluateMissionTransition(
  input: MissionTransitionInput,
): MissionTransitionEvaluation {
  const { mission, to, approvalConfirmed = false } = input;
  const from = mission.status;
  const blockReasons: MissionTransitionBlockReason[] = [];

  // Check 1: terminal state cannot transition
  if (ALLOWED_TRANSITIONS[from].length === 0) {
    blockReasons.push("terminal_state");
  }

  // Check 2: structural transition must be valid
  if (ALLOWED_TRANSITIONS[from].length > 0 && !ALLOWED_TRANSITIONS[from].includes(to)) {
    blockReasons.push("invalid_transition");
  }

  // Check 3: approval gate — transitioning into `running` is blocked if approval is required
  // and the caller has not explicitly confirmed it.
  if (to === "running" && blockReasons.length === 0) {
    const approval = evaluateMissionApproval(mission);
    if (approval.blocksExecution && !approvalConfirmed) {
      blockReasons.push("approval_required");
      blockReasons.push("approval_not_confirmed");
    }
  }

  return {
    missionId: mission.id,
    from,
    to,
    allowed: blockReasons.length === 0,
    blockReasons,
  };
}
