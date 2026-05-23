import type { Mission } from "@/core/types";
import { evaluateMissionApproval } from "./approval-service";
import { evaluateMissionTransition } from "./state-machine";

// ---------------------------------------------------------------------------
// Executor mode — "live" is reserved for a future PR after a second Red Team pass.
// Any call with mode "live" is rejected by buildDryRunMissionExecutionPlan().
// ---------------------------------------------------------------------------

export type MissionExecutorMode = "dry_run" | "live";

export type MissionExecutorBlockedReason =
  | "live_mode_not_implemented"
  | "transition_blocked"
  | "approval_required"
  | "approval_not_confirmed"
  | "terminal_state"
  | "invalid_transition";

export type MissionExecutorStep = {
  stepId: string;
  description: string;
  actionType: string;
  /** Metadata that would be passed to ledger.record() on real execution. */
  ledgerMetadata: {
    missionId: string;
    missionStatus: string;
    missionTransition: string;
    approvalConfirmed: boolean;
  };
};

export type MissionExecutorPlan = {
  missionId: string;
  mode: MissionExecutorMode;
  steps: MissionExecutorStep[];
  /** Total estimated autonomy cost across all steps. Not enforced yet — future use. */
  estimatedAutonomyCost: number;
};

export type MissionExecutorInput = {
  mission: Mission;
  mode: MissionExecutorMode;
  /** Must be true when evaluateMissionApproval().blocksExecution is true. Server-side only — use deriveApprovalConfirmedFromRecord(), never accept from clients. */
  approvalConfirmed?: boolean;
};

export type MissionExecutorResult =
  | {
      allowed: true;
      plan: MissionExecutorPlan;
      approvalEvaluation: ReturnType<typeof evaluateMissionApproval>;
      transitionEvaluation: ReturnType<typeof evaluateMissionTransition>;
    }
  | {
      allowed: false;
      blockReasons: MissionExecutorBlockedReason[];
      approvalEvaluation: ReturnType<typeof evaluateMissionApproval>;
      transitionEvaluation: ReturnType<typeof evaluateMissionTransition>;
    };

/**
 * Pure function — no I/O, no writes, no AI calls, no ledger.record().
 *
 * Builds a dry-run execution plan for a mission, passing it through all
 * safety gates. Returns a blocked result if any gate fails.
 *
 * "live" mode is not implemented — any live request is immediately blocked.
 * The live executor requires a second Red Team pass (post PR #18).
 */
export function buildDryRunMissionExecutionPlan(
  input: MissionExecutorInput,
): MissionExecutorResult {
  const { mission, mode, approvalConfirmed = false } = input;

  const approvalEvaluation = evaluateMissionApproval(mission);
  const transitionEvaluation = evaluateMissionTransition({
    mission,
    to: "running",
    approvalConfirmed,
  });

  const blockReasons: MissionExecutorBlockedReason[] = [];

  // Gate 1: live mode is not implemented
  if (mode === "live") {
    blockReasons.push("live_mode_not_implemented");
  }

  // Gate 2: state machine must allow the transition
  if (!transitionEvaluation.allowed) {
    for (const reason of transitionEvaluation.blockReasons) {
      blockReasons.push(reason as MissionExecutorBlockedReason);
    }
  }

  if (blockReasons.length > 0) {
    return { allowed: false, blockReasons, approvalEvaluation, transitionEvaluation };
  }

  // Build the dry-run plan — describes what would happen on real execution
  const plan: MissionExecutorPlan = {
    missionId: mission.id,
    mode,
    steps: [
      {
        stepId: `step_${mission.id}_01`,
        description: `[DRY RUN] Execute mission: ${mission.title}`,
        actionType: `mission.execute.${mission.assignedAgentId}`,
        ledgerMetadata: {
          missionId: mission.id,
          missionStatus: "running",
          missionTransition: `${mission.status} → running`,
          approvalConfirmed,
        },
      },
    ],
    estimatedAutonomyCost: mission.autonomyLevel,
  };

  return { allowed: true, plan, approvalEvaluation, transitionEvaluation };
}
