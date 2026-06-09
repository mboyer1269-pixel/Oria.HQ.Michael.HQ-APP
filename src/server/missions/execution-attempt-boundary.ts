import type { LocalAttemptCheckResult } from "./execution-attempt-store";
import type {
  MissionApprovalDerivationResult,
} from "./approval-derivation";
import type { MissionApprovalVerificationFailReason } from "./approval-record";

// ---------------------------------------------------------------------------
// Approval → execution-attempt boundary.
//
// Pure decision function — no I/O, no writes, no timers, no state. It composes
// two already-tested primitives into the single decision the route used to make
// inline:
//
//   1. the idempotency / rate-limit check    (execution-attempt-store.ts, #280)
//   2. the derived approval confirmation      (approval-derivation.ts)
//
// and answers: may this mission proceed to an execution attempt, and if not,
// why — and with which HTTP status should the caller be rejected?
//
// This is necessary, not sufficient: a "reservable + approval-confirmed" result
// means the boundary is clear; the final state-machine transition is still
// validated downstream by buildDryRunMissionExecutionPlan(). Reason codes reuse
// the existing store strings ("missing_idempotency_key" | "duplicate_key" |
// "rate_limit_exceeded") and the existing executor string ("approval_required").
// ---------------------------------------------------------------------------

export type ExecutionAttemptRejectReason =
  | "missing_idempotency_key"
  | "duplicate_key"
  | "rate_limit_exceeded";

export type ExecutionAttemptBoundaryDecision =
  | {
      // Idempotency / rate-limit gate failed. The attempt cannot be reserved;
      // the route rejects with `status` before any reservation or plan build.
      reservable: false;
      executable: false;
      reason: ExecutionAttemptRejectReason;
      status: 400 | 409 | 429;
    }
  | {
      // Idempotency gate passed, so the attempt may be reserved — but approval is
      // not confirmed, so the boundary yields no executable attempt.
      reservable: true;
      executable: false;
      reason: "approval_required";
      approvalFailReason: MissionApprovalVerificationFailReason;
    }
  | {
      // Approved + fresh idempotency: the attempt may be reserved and the
      // approval gate is satisfied. Final transition validated downstream.
      reservable: true;
      executable: true;
    };

export type ExecutionAttemptBoundaryInput = {
  attemptCheck: LocalAttemptCheckResult;
  approval: MissionApprovalDerivationResult;
};

/**
 * Maps a blocked idempotency / rate-limit reason to the HTTP status the route
 * has always returned: duplicate → 409, rate limit → 429, anything else
 * (incl. a missing key) → 400.
 */
function rejectStatusFor(reason: ExecutionAttemptRejectReason): 400 | 409 | 429 {
  if (reason === "duplicate_key") return 409;
  if (reason === "rate_limit_exceeded") return 429;
  return 400;
}

/**
 * Pure boundary decision. Idempotency / rate-limit blocking takes precedence
 * over approval: a duplicate or rate-limited request is rejected before the
 * approval gate is even considered, exactly as the route did inline.
 */
export function evaluateExecutionAttemptBoundary(
  input: ExecutionAttemptBoundaryInput,
): ExecutionAttemptBoundaryDecision {
  const { attemptCheck, approval } = input;

  if (!attemptCheck.allowed) {
    return {
      reservable: false,
      executable: false,
      reason: attemptCheck.reason,
      status: rejectStatusFor(attemptCheck.reason),
    };
  }

  if (approval.approvalConfirmed !== true) {
    return {
      reservable: true,
      executable: false,
      reason: "approval_required",
      approvalFailReason: approval.reason,
    };
  }

  return { reservable: true, executable: true };
}
