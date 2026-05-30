// src/server/joris/governance-bundle-preview.ts

/**
 * Joris Governance Bundle Preview — read-only, pure composition helper.
 *
 * Given a Work Order and the identity of the reviewer (CEO / Workflow Owner),
 * this helper assembles a complete preview-state Governance Bundle by:
 *
 *   1. Building an AutonomyEnvelope via the PR121 default builder.
 *   2. Constructing a fresh ReviewSession with status "previewed".
 *   3. Assembling the bundle via the PR124 governance bundle builder.
 *   4. Cross-validating via the PR124 governance bundle validator.
 *   5. Formatting a Joris-flavored Markdown preview message.
 *
 * This module is strictly read-only:
 *   - No I/O, no DB writes, no runtime dispatch.
 *   - No mutations of input objects.
 *   - No wiring into brain.ts, mission-router, or any runtime path.
 *   - humanOnTheLoop: true and noExecutionAuthorized: true are non-negotiable
 *     and propagated through every nested artifact.
 *
 * Design intent: this is a dormant capability. A future PR will wire Joris's
 * conversational brain to render this preview to the CEO. Until then, calling
 * this helper produces a structured preview object and a Markdown message but
 * has no effect on application state.
 *
 * approve_to_plan is planning only — it never authorizes execution. The
 * preview itself is a planning artifact and is therefore safe to produce
 * autonomously inside a no-execution boundary.
 */

import type {
  WorkOrder,
  MissionWorkOrder,
  WorkOrderRiskLevel,
} from "../agents/work-order-contract";
import { buildDefaultAutonomyEnvelope } from "../agents/work-order-autonomy-envelope-builder";
import type { WorkOrderAutonomyEnvelope } from "../agents/work-order-autonomy-envelope-contract";
import type { WorkOrderReviewSession } from "../agents/work-order-review-session-contract";
import type {
  WorkOrderGovernanceBundle,
  WorkOrderGovernanceBundleValidationResult,
} from "../agents/work-order-governance-bundle";
import {
  buildWorkOrderGovernanceBundle,
  validateWorkOrderGovernanceBundle,
  createWorkOrderGovernanceBundleSummary,
  hasForbiddenGovernanceBundleFields,
} from "../agents/work-order-governance-bundle";

// ---------------------------------------------------------------------------
// Input / Output types
// ---------------------------------------------------------------------------

export interface JorisGovernanceBundlePreviewInput {
  /** The Work Order to preview a Governance Bundle for. */
  workOrder: WorkOrder;
  /** Identifier of the reviewer (e.g. userId of the CEO). */
  reviewerId: string;
  /** Role of the reviewer; defaults to "ceo". */
  reviewerRole?: string;
  /**
   * Optional ISO 8601 timestamp override. Used to make the helper
   * deterministic for tests. Defaults to new Date().toISOString().
   */
  createdAt?: string;
}

export interface JorisGovernanceBundlePreview {
  /** The assembled Governance Bundle (status: "preview"). */
  bundle: WorkOrderGovernanceBundle;
  /** Cross-artifact validation result for the bundle. */
  validation: WorkOrderGovernanceBundleValidationResult;
  /** Joris-style Markdown preview message ready to display to the CEO. */
  message: string;
  /** Always true — the human is on the loop. */
  humanOnTheLoop: true;
  /** Always true — no execution is authorized by a preview. */
  noExecutionAuthorized: true;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolves the agent ID for the autonomy envelope.
 * For mission work orders, prefer the assigned agent (the worker).
 * For venture work orders, use the owner agent.
 *
 * This function is pure — it does not mutate the input.
 */
function resolveEnvelopeAgentId(workOrder: WorkOrder): string {
  if (workOrder.type === "mission") {
    return (workOrder as MissionWorkOrder).assignedAgentId || workOrder.ownerAgentId;
  }
  return workOrder.ownerAgentId;
}

/**
 * Resolves the risk level for envelope derivation.
 * Mission work orders carry a riskLevel field; venture work orders may not.
 * Defaults to "low" if absent.
 *
 * This function is pure — it does not mutate the input.
 */
function resolveRiskLevel(workOrder: WorkOrder): WorkOrderRiskLevel {
  const wo = workOrder as unknown as { riskLevel?: WorkOrderRiskLevel };
  return wo.riskLevel ?? "low";
}

// ---------------------------------------------------------------------------
// Public: buildJorisGovernanceBundlePreview
// ---------------------------------------------------------------------------

/**
 * Composes a read-only preview-state Governance Bundle for a Work Order.
 *
 * Returns:
 *   - bundle:       the assembled WorkOrderGovernanceBundle (status: "preview")
 *   - validation:   the PR124 cross-artifact validation result
 *   - message:      a Joris-style Markdown preview message
 *   - humanOnTheLoop: true
 *   - noExecutionAuthorized: true
 *
 * This function is pure — it does not mutate the input and performs no I/O.
 */
export function buildJorisGovernanceBundlePreview(
  input: JorisGovernanceBundlePreviewInput,
): JorisGovernanceBundlePreview {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const reviewerRole = input.reviewerRole ?? "ceo";

  // ---- 1. Build the autonomy envelope via PR121 ----

  const envelope: WorkOrderAutonomyEnvelope = buildDefaultAutonomyEnvelope({
    workOrderId: input.workOrder.id,
    agentId: resolveEnvelopeAgentId(input.workOrder),
    workOrderType: input.workOrder.type,
    riskLevel: resolveRiskLevel(input.workOrder),
    createdAt,
  });

  // ---- 2. Build the preview-state review session ----

  const sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const session: WorkOrderReviewSession = {
    id: sessionId,
    workOrderId: input.workOrder.id,
    status: "previewed",
    reviewerId: input.reviewerId,
    reviewerRole,
    createdAt,
    updatedAt: createdAt,
    humanOnTheLoop: true,
    noExecutionAuthorized: true,
    autonomyEnvelopeId: envelope.id,
  };

  // ---- 3. Assemble the bundle via PR124 ----

  const bundle = buildWorkOrderGovernanceBundle({
    workOrder: input.workOrder,
    autonomyEnvelope: envelope,
    reviewSession: session,
  });

  // ---- 4. Cross-validate via PR124 ----

  const validation = validateWorkOrderGovernanceBundle(bundle);

  // ---- 5. Format the Joris-style preview message ----

  const message = formatJorisGovernanceBundlePreview(bundle, validation);

  return {
    bundle,
    validation,
    message,
    humanOnTheLoop: true,
    noExecutionAuthorized: true,
  };
}

// ---------------------------------------------------------------------------
// Public: formatJorisGovernanceBundlePreview
// ---------------------------------------------------------------------------

/**
 * Formats a Joris-style Markdown preview message for the given bundle.
 *
 * The message:
 *   - Opens with a French Joris intro signalling read-only / dry-run.
 *   - Embeds the structured PR124 bundle summary.
 *   - States Human-on-the-Loop, Aucune action exécutée, and the
 *     "approve_to_plan is planning only, not execution" note.
 *   - Reports validation status (without mutating the bundle).
 *
 * This function is pure — it does not mutate the input.
 */
export function formatJorisGovernanceBundlePreview(
  bundle: WorkOrderGovernanceBundle,
  validation: WorkOrderGovernanceBundleValidationResult,
): string {
  const summary = createWorkOrderGovernanceBundleSummary(bundle);

  const intro =
    "J'ai préparé un aperçu de Governance Bundle pour ce Work Order. " +
    "Cet aperçu est en lecture seule : aucune action n'a été exécutée, " +
    "aucune décision n'a été prise.";

  const validationLines: string[] = [];
  if (validation.valid) {
    validationLines.push("✅ **Intégrité du bundle** : validée (cohérence inter-artefacts OK).");
  } else {
    const errorCount = validation.issues.filter((i) => i.severity === "error").length;
    validationLines.push(
      `⚠️ **Intégrité du bundle** : ${errorCount} erreur(s) détectée(s). Cet aperçu reste lecture seule.`,
    );
    for (const i of validation.issues.filter((x) => x.severity === "error").slice(0, 5)) {
      validationLines.push(`- \`${i.code}\` : ${i.message}`);
    }
  }

  return [
    intro,
    "",
    summary.text,
    "",
    "---",
    "#### 🔍 Validation",
    ...validationLines,
    "",
    "💡 *Aperçu Joris — Human-on-the-Loop : aucun appel à un système externe, " +
      "aucune écriture en base, aucun déclenchement runtime n'a été effectué. " +
      "approve_to_plan reste de la planification uniquement, jamais une autorisation d'exécution.*",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Public: input safety guard
// ---------------------------------------------------------------------------

/**
 * Returns true if the input contains any forbidden live-execution field.
 * Delegates to PR124's recursive scan so the safety boundary is identical.
 *
 * Useful for callers that want to reject untrusted input *before* building
 * a preview, instead of relying solely on the post-build validator.
 *
 * This function is pure — it does not mutate the input.
 */
export function inputContainsForbiddenExecutionFields(
  input: JorisGovernanceBundlePreviewInput,
): boolean {
  return hasForbiddenGovernanceBundleFields(input as unknown);
}
