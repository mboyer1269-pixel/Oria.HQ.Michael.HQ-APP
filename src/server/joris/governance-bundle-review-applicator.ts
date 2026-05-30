// src/server/joris/governance-bundle-review-applicator.ts

/**
 * Joris Governance Bundle Review Applicator — pure, dry-run, no persistence.
 *
 * Given an existing Governance Bundle (with its review session in a reviewable
 * state) and a natural-language review message from the CEO / Workflow Owner,
 * this helper:
 *
 *   1. Validates the incoming bundle (refuses to apply to a broken bundle).
 *   2. Interprets the message via the PR118 review interpreter.
 *   3. Advances the review session via the PR123 state machine:
 *        - "previewed" is first bridged to "awaiting_review".
 *        - a formal decision transitions awaiting_review → terminal state and
 *          attaches the interpreted WorkOrderReview.
 *        - execution language transitions to "blocked_execution_request" as a
 *          safety state with NO review attached (the interpreter blocked it
 *          before a formal review could be created).
 *   4. Re-assembles the bundle via the PR124 builder (status re-derived) while
 *      preserving the original bundle id and createdAt.
 *   5. Re-validates the resulting bundle via the PR124 validator.
 *   6. Formats a Joris-style Markdown message.
 *
 * Strictly dry-run:
 *   - No I/O, no DB writes, no runtime dispatch, no persistence.
 *   - No mutation of the input bundle or any nested artifact.
 *   - No wiring into brain.ts or any runtime path.
 *   - humanOnTheLoop: true and noExecutionAuthorized: true are non-negotiable.
 *
 * approve_to_plan is planning only — it advances the session to
 * "approved_to_plan" and the bundle to status "approved_to_plan", which means
 * planning is approved. It NEVER authorizes execution and never mutates
 * workOrder.status to "approved" or "in_progress".
 */

import type {
  WorkOrderGovernanceBundle,
  WorkOrderGovernanceBundleStatus,
  WorkOrderGovernanceBundleValidationResult,
  WorkOrderGovernanceBundleIssue,
} from "../agents/work-order-governance-bundle";
import {
  buildWorkOrderGovernanceBundle,
  validateWorkOrderGovernanceBundle,
  createWorkOrderGovernanceBundleSummary,
} from "../agents/work-order-governance-bundle";
import type {
  WorkOrderReviewSession,
  WorkOrderReviewSessionStatus,
} from "../agents/work-order-review-session-contract";
import {
  canTransitionWorkOrderReviewSession,
  transitionWorkOrderReviewSession,
} from "../agents/work-order-review-session-contract";
import type { WorkOrderReview } from "../agents/work-order-review-contract";
import type {
  WorkOrderReviewInterpretation,
  WorkOrderReviewIntentType,
} from "./work-order-review-interpreter";
import { interpretWorkOrderReviewMessage } from "./work-order-review-interpreter";

// ---------------------------------------------------------------------------
// Input / Output types
// ---------------------------------------------------------------------------

export interface JorisReviewApplicationInput {
  /** The existing Governance Bundle to apply a review to. */
  bundle: WorkOrderGovernanceBundle;
  /** The natural-language review message from the reviewer. */
  message: string;
  /** Reviewer identifier; defaults to the session's reviewerId. */
  reviewerId?: string;
  /** Reviewer role; defaults to the session's reviewerRole. */
  reviewerRole?: string;
  /**
   * Optional ISO 8601 timestamp override (used for deterministic tests).
   * Applied to the interpreted review and the session's updatedAt where the
   * applicator controls construction. Defaults to new Date().toISOString().
   */
  createdAt?: string;
}

export interface JorisReviewApplicationResult {
  /** Whether the review actually advanced the session state. */
  applied: boolean;
  /** The detected review intent from the interpreter. */
  intent: WorkOrderReviewIntentType;
  /** The resulting bundle (a new object when applied, the original otherwise). */
  bundle: WorkOrderGovernanceBundle;
  /** The bundle status before applying the review. */
  previousStatus: WorkOrderGovernanceBundleStatus;
  /** The bundle status after applying the review. */
  nextStatus: WorkOrderGovernanceBundleStatus;
  /** Validation result for the resulting bundle. */
  validation: WorkOrderGovernanceBundleValidationResult;
  /** Raw interpreter output for transparency. */
  interpretation: WorkOrderReviewInterpretation;
  /** Applicator-level issues (separate from bundle validation issues). */
  issues: WorkOrderGovernanceBundleIssue[];
  /** Joris-style Markdown message describing the outcome. */
  message: string;
  /** Always true — the human is on the loop. */
  humanOnTheLoop: true;
  /** Always true — no execution is authorized by applying a review. */
  noExecutionAuthorized: true;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Session statuses from which a fresh review may be applied in a dry-run. */
const REVIEWABLE_SESSION_STATUSES: ReadonlySet<string> = new Set([
  "previewed",
  "awaiting_review",
]);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function applicatorIssue(
  code: string,
  message: string,
  severity: "error" | "warning" = "error",
  path?: string,
): WorkOrderGovernanceBundleIssue {
  const result: WorkOrderGovernanceBundleIssue = { code, message, severity };
  if (path !== undefined) result.path = path;
  return result;
}

/**
 * Re-assembles a bundle from updated artifacts while preserving the original
 * bundle identity (id + createdAt). Status is re-derived by the PR124 builder,
 * keeping the session→status mapping single-sourced.
 *
 * This function is pure — it does not mutate its inputs.
 */
function reassembleBundlePreservingIdentity(
  original: WorkOrderGovernanceBundle,
  nextSession: WorkOrderReviewSession,
  review: WorkOrderReview | undefined,
): WorkOrderGovernanceBundle {
  const built = buildWorkOrderGovernanceBundle({
    workOrder: original.workOrder,
    autonomyEnvelope: original.autonomyEnvelope,
    reviewSession: nextSession,
    ...(review !== undefined ? { review } : {}),
  });

  return {
    ...built,
    id: original.id,
    createdAt: original.createdAt,
  };
}

/**
 * Returns true if the bundle's session is in a state from which a fresh review
 * can be applied (previewed or awaiting_review).
 *
 * This function is pure — it does not mutate its input.
 */
export function isBundleReviewable(bundle: WorkOrderGovernanceBundle): boolean {
  return REVIEWABLE_SESSION_STATUSES.has(bundle.reviewSession.status);
}

/**
 * Bridges a "previewed" session to "awaiting_review" as a pure preparatory
 * step, honoring the PR123 state machine. Returns the same session if it is
 * already "awaiting_review". Returns null if the bridge is not permitted.
 *
 * This function is pure — it does not mutate its input.
 */
function bridgeToAwaitingReview(
  session: WorkOrderReviewSession,
  timestamp: string,
): WorkOrderReviewSession | null {
  if (session.status === "awaiting_review") return session;

  if (session.status === "previewed") {
    if (!canTransitionWorkOrderReviewSession("previewed", "awaiting_review")) {
      return null;
    }
    return { ...session, status: "awaiting_review", updatedAt: timestamp };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Public: applyReviewToGovernanceBundle
// ---------------------------------------------------------------------------

/**
 * Applies a natural-language review to a Governance Bundle in a pure dry-run.
 *
 * Returns a JorisReviewApplicationResult describing the outcome. When the
 * review cannot be applied (broken bundle, non-reviewable session, ambiguous
 * message), `applied` is false and the original bundle is returned unchanged.
 *
 * This function is pure — it does not mutate its inputs and performs no I/O.
 */
export function applyReviewToGovernanceBundle(
  input: JorisReviewApplicationInput,
): JorisReviewApplicationResult {
  const { bundle } = input;
  const previousStatus = bundle.status;
  const timestamp = input.createdAt ?? new Date().toISOString();
  const reviewerId = input.reviewerId ?? bundle.reviewSession.reviewerId;
  const reviewerRole = input.reviewerRole ?? bundle.reviewSession.reviewerRole;

  // ---- Interpret the message up-front (needed for intent in all branches) ----

  const interpretation = interpretWorkOrderReviewMessage({
    message: input.message,
    workOrderId: bundle.workOrder.id,
    reviewerId,
    reviewerRole,
    requiredApprovalGates: (bundle.workOrder.approvalGates ?? []).map((g) => String(g)),
    createdAt: timestamp,
  });

  // ---- Guard 1: the incoming bundle must itself be valid ----

  const incomingValidation = validateWorkOrderGovernanceBundle(bundle);
  if (!incomingValidation.valid) {
    return notApplied(
      bundle,
      previousStatus,
      interpretation,
      [applicatorIssue(
        "bundle_not_valid",
        "Cannot apply a review: the incoming Governance Bundle is not valid.",
      )],
      incomingValidation,
      "⚠️ Impossible d'appliquer la revue : le Governance Bundle fourni n'est pas valide.",
    );
  }

  // ---- Guard 2: the session must be in a reviewable state ----

  if (!isBundleReviewable(bundle)) {
    return notApplied(
      bundle,
      previousStatus,
      interpretation,
      [applicatorIssue(
        "session_not_reviewable",
        `Session status "${bundle.reviewSession.status}" is terminal or non-reviewable; a fresh review cannot be applied.`,
        "error",
        "reviewSession.status",
      )],
      incomingValidation,
      `⚠️ La session est en statut « ${bundle.reviewSession.status} » : aucune nouvelle revue ne peut être appliquée (dry-run).`,
    );
  }

  // ---- Branch A: ambiguous intent — no state change ----

  if (interpretation.intent === "ambiguous") {
    return notApplied(
      bundle,
      previousStatus,
      interpretation,
      [applicatorIssue(
        "ambiguous_review_intent",
        "The review message was ambiguous; no decision was applied.",
        "warning",
      )],
      incomingValidation,
      interpretation.summary,
    );
  }

  // ---- Bridge previewed → awaiting_review (pure, guarded) ----

  const awaitingSession = bridgeToAwaitingReview(bundle.reviewSession, timestamp);
  if (awaitingSession === null) {
    return notApplied(
      bundle,
      previousStatus,
      interpretation,
      [applicatorIssue(
        "invalid_session_bridge",
        `Cannot bridge session status "${bundle.reviewSession.status}" to "awaiting_review".`,
        "error",
        "reviewSession.status",
      )],
      incomingValidation,
      "⚠️ Transition de session invalide vers « awaiting_review ».",
    );
  }

  // ---- Branch B: blocked execution request — safety state, NO review ----

  if (interpretation.intent === "blocked_execution_request") {
    const toStatus: WorkOrderReviewSessionStatus = "blocked_execution_request";

    if (!canTransitionWorkOrderReviewSession(awaitingSession.status, toStatus)) {
      return notApplied(
        bundle,
        previousStatus,
        interpretation,
        [applicatorIssue(
          "invalid_transition",
          `Cannot transition from "${awaitingSession.status}" to "${toStatus}".`,
        )],
        incomingValidation,
        interpretation.summary,
      );
    }

    // Construct the blocked session directly: NO currentReviewId is set,
    // because the interpreter blocked the request before any formal
    // WorkOrderReview could exist. Setting currentReviewId here would create a
    // dangling pointer that the PR124 validator (correctly) rejects.
    const blockedSession: WorkOrderReviewSession = {
      ...awaitingSession,
      status: toStatus,
      lastDecision: "blocked_execution_request",
      lastReason: input.message,
      updatedAt: timestamp,
    };

    const nextBundle = reassembleBundlePreservingIdentity(bundle, blockedSession, undefined);
    const validation = validateWorkOrderGovernanceBundle(nextBundle);

    return {
      applied: true,
      intent: interpretation.intent,
      bundle: nextBundle,
      previousStatus,
      nextStatus: nextBundle.status,
      validation,
      interpretation,
      issues: [],
      message: formatApplicationMessage(nextBundle, validation, interpretation),
      humanOnTheLoop: true,
      noExecutionAuthorized: true,
    };
  }

  // ---- Branch C: a formal review decision ----

  const review = interpretation.review as WorkOrderReview | undefined;
  if (review === undefined) {
    // Defensive: any non-ambiguous, non-blocked intent should carry a review.
    return notApplied(
      bundle,
      previousStatus,
      interpretation,
      [applicatorIssue(
        "missing_interpreted_review",
        `Intent "${interpretation.intent}" did not produce a review object.`,
      )],
      incomingValidation,
      interpretation.summary,
    );
  }

  const transition = transitionWorkOrderReviewSession(awaitingSession, {
    id: review.id,
    decision: review.decision,
    reason: review.reason,
    requestedChanges: review.requestedChanges,
  });

  if (!transition.valid || transition.nextSession === undefined) {
    return notApplied(
      bundle,
      previousStatus,
      interpretation,
      transition.issues.map((i) =>
        applicatorIssue(i.code, i.message, i.severity, i.path),
      ),
      incomingValidation,
      `⚠️ La décision « ${review.decision} » n'a pas pu être appliquée à la session.`,
    );
  }

  const nextBundle = reassembleBundlePreservingIdentity(
    bundle,
    transition.nextSession,
    review,
  );
  const validation = validateWorkOrderGovernanceBundle(nextBundle);

  return {
    applied: true,
    intent: interpretation.intent,
    bundle: nextBundle,
    previousStatus,
    nextStatus: nextBundle.status,
    validation,
    interpretation,
    issues: [],
    message: formatApplicationMessage(nextBundle, validation, interpretation),
    humanOnTheLoop: true,
    noExecutionAuthorized: true,
  };
}

// ---------------------------------------------------------------------------
// Internal: not-applied result builder
// ---------------------------------------------------------------------------

function notApplied(
  bundle: WorkOrderGovernanceBundle,
  previousStatus: WorkOrderGovernanceBundleStatus,
  interpretation: WorkOrderReviewInterpretation,
  issues: WorkOrderGovernanceBundleIssue[],
  validation: WorkOrderGovernanceBundleValidationResult,
  leadLine: string,
): JorisReviewApplicationResult {
  const message = [
    leadLine,
    "",
    "💡 *Human-on-the-Loop : aucune action n'a été exécutée. Aucune écriture, aucun déclenchement runtime. " +
      "approve_to_plan resterait de la planification uniquement, jamais une autorisation d'exécution.*",
  ].join("\n");

  return {
    applied: false,
    intent: interpretation.intent,
    bundle,
    previousStatus,
    nextStatus: previousStatus,
    validation,
    interpretation,
    issues,
    message,
    humanOnTheLoop: true,
    noExecutionAuthorized: true,
  };
}

// ---------------------------------------------------------------------------
// Public: formatApplicationMessage
// ---------------------------------------------------------------------------

/**
 * Formats a Joris-style Markdown message describing the outcome of applying a
 * review to a Governance Bundle. Embeds the PR124 bundle summary (which already
 * carries the Human-on-the-Loop / Aucune action exécutée / planning-only notes).
 *
 * This function is pure — it does not mutate its inputs.
 */
export function formatApplicationMessage(
  bundle: WorkOrderGovernanceBundle,
  validation: WorkOrderGovernanceBundleValidationResult,
  interpretation: WorkOrderReviewInterpretation,
): string {
  const summary = createWorkOrderGovernanceBundleSummary(bundle);

  const intros: Record<string, string> = {
    approve_to_plan:
      "✅ Revue appliquée (dry-run) : le Work Order est approuvé pour planification. " +
      "Ceci n'autorise aucune exécution.",
    request_changes:
      "🔄 Revue appliquée (dry-run) : des modifications ont été demandées.",
    reject: "❌ Revue appliquée (dry-run) : le Work Order est rejeté.",
    ask_for_more_info:
      "❓ Revue appliquée (dry-run) : des informations supplémentaires ont été demandées.",
    blocked_execution_request:
      "⛔ Demande d'exécution bloquée (dry-run) : la session passe en état de sécurité " +
      "« blocked_execution_request ». Aucune action n'a été exécutée.",
  };

  const intro =
    intros[interpretation.intent] ??
    "Revue interprétée (dry-run).";

  const validationLine = validation.valid
    ? "✅ **Intégrité du bundle** : validée après application."
    : `⚠️ **Intégrité du bundle** : ${validation.issues.filter((i) => i.severity === "error").length} erreur(s) après application.`;

  return [
    intro,
    "",
    summary.text,
    "",
    "---",
    "#### 🔍 Validation",
    validationLine,
    "",
    "💡 *Applicateur Joris (dry-run) : aucune persistance, aucun appel externe, aucun déclenchement runtime. " +
      "approve_to_plan reste de la planification uniquement, jamais une autorisation d'exécution.*",
  ].join("\n");
}
