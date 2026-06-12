// src/features/ventures/cash-action-review-projection.ts
//
// Pure projections for the Cash Action Review screen. These turn durable domain
// objects (PreparedAction, HermesOutreachPlan) into the plain, serializable
// display shapes the client component renders — and select which prepared
// actions are still awaiting CEO review.
//
// Pure/local: no DB, no network, no server imports, no React. Shared by the
// server page (to build props) and the client component (which re-exports the
// display types). Keeps the projection logic testable on its own.

import type { HermesOutreachPlan } from "./hermes-outreach-plan";
import type { PreparedAction } from "./prepared-action";

// ---------------------------------------------------------------------------
// Display types (plain, serializable — safe to pass to the client component)
// ---------------------------------------------------------------------------

export type CouncilTurnDisplay = {
  roleId: string;
  outputSummary: string;
  recommendation: string;
  confidenceScore: number;
};

export type CouncilAnalysis = {
  packetId: string;
  readiness: "ready_for_ceo" | "needs_more_evidence" | "blocked_by_auditor" | "needs_refinement";
  verdictDecision: string;
  recommendedManualAction: string;
  turns: CouncilTurnDisplay[];
  runIndex: number;
};

export type HermesPlanDisplay = {
  packetId: string;
  channel: string;
  senderRecommendation: string;
  prospectProfile: string;
  prospectSelectionCriteria: string;
  personalizationBasis: string;
  messageDraft: string;
  cta: string;
  expectedSignal: string;
  requiredEvidence: string[];
  complianceNotes: string;
  riskNotes: string;
  manualSendInstructions: string;
  approvalStatus: string;
  requiresCeoApproval: boolean;
  requiresManualSend: boolean;
  noExecutionAuthorized: boolean;
};

// ---------------------------------------------------------------------------
// Prepared-action selection
// ---------------------------------------------------------------------------

// Statuses that represent prepared work still awaiting CEO review. Approved /
// rejected / superseded entries are resolved and are not shown as the live queue.
export const REVIEWABLE_PREPARED_STATUSES: ReadonlySet<PreparedAction["status"]> = new Set([
  "prepared",
  "ready_for_ceo_review",
]);

// Filter a prepared-action list down to the entries still awaiting review,
// preserving the input order (the repository returns most-recent first).
export function selectReviewablePreparedActions(
  prepared: readonly PreparedAction[],
): PreparedAction[] {
  return prepared.filter((action) => REVIEWABLE_PREPARED_STATUSES.has(action.status));
}

// ---------------------------------------------------------------------------
// Display projection
// ---------------------------------------------------------------------------

// Map a stored Relay outreach plan to the display-safe projection the client
// renders. Plain serializable data only; requiredEvidence is copied.
export function toHermesPlanDisplay(
  packetId: string,
  plan: HermesOutreachPlan,
): HermesPlanDisplay {
  return {
    packetId,
    channel: plan.channel,
    senderRecommendation: plan.senderRecommendation,
    prospectProfile: plan.prospectProfile,
    prospectSelectionCriteria: plan.prospectSelectionCriteria,
    personalizationBasis: plan.personalizationBasis,
    messageDraft: plan.messageDraft,
    cta: plan.cta,
    expectedSignal: plan.expectedSignal,
    requiredEvidence: [...plan.requiredEvidence],
    complianceNotes: plan.complianceNotes,
    riskNotes: plan.riskNotes,
    manualSendInstructions: plan.manualSendInstructions,
    approvalStatus: plan.approvalStatus,
    requiresCeoApproval: plan.requiresCeoApproval,
    requiresManualSend: plan.requiresManualSend,
    noExecutionAuthorized: plan.noExecutionAuthorized,
  };
}
