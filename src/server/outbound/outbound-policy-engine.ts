// ---------------------------------------------------------------------------
// Sentinelle — Outbound Policy Engine
// ---------------------------------------------------------------------------
// canExecuteOutboundAction() is the single gate for all outbound actions.
// It evaluates 13 inputs and returns ALLOW | REQUIRE_APPROVAL | BLOCK.
//
// See docs/REVENUE_EXECUTION_LANE.md §3 (Green/Yellow/Red model)
// See docs/OUTBOUND_POLICY.md §PolicyDecision
//
// INVARIANTS:
//   - consentBasis: "unknown" → always BLOCK
//   - unsubscribeMechanism: "absent" → always BLOCK
//   - any suppressionHit → always BLOCK
//   - circuitBreaker: "open" → always BLOCK
//   - cold_email + cold_prospect → REQUIRE_APPROVAL minimum (Yellow strict)
//   - internal_test + reply_assist → ALLOW (Green)
//   - all other client-facing → REQUIRE_APPROVAL (Yellow)
// ---------------------------------------------------------------------------

import type {
  OutboundBatch,
  PolicyDecision,
  PolicyDecisionRecord,
  ReputationState,
  SuppressionEntry,
  AgentBudgetGuard,
  OrgBudgetGuard,
} from "./outbound-types.ts";

export type OutboundPolicyInput = {
  batch: OutboundBatch;
  suppressionEntries: SuppressionEntry[];
  reputationState: ReputationState | null;
  agentBudgetGuard: AgentBudgetGuard | null;
  orgBudgetGuard: OrgBudgetGuard | null;
  /** Daily USD spent so far for this agent */
  agentDailyUsdSpent: number;
  /** Daily USD spent so far across org */
  orgDailyUsdSpent: number;
};

export type OutboundPolicyResult = {
  decision: PolicyDecision;
  record: Omit<PolicyDecisionRecord, "id" | "checkedAt">;
};

/**
 * Evaluates whether an OutboundBatch can proceed.
 *
 * Returns ALLOW, REQUIRE_APPROVAL, or BLOCK with full reasoning.
 * This is a pure function — no DB calls, no side effects.
 */
export function canExecuteOutboundAction(input: OutboundPolicyInput): OutboundPolicyResult {
  const { batch, suppressionEntries, reputationState, agentBudgetGuard, orgBudgetGuard } = input;

  const reasons: string[] = [];
  const suppressionWarnings: string[] = [];
  const reputationWarnings: string[] = [];
  const consentIssues: string[] = [];
  const complianceFlags: string[] = [];

  // -------------------------------------------------------------------------
  // HARD BLOCKS — these immediately return BLOCK regardless of other inputs
  // -------------------------------------------------------------------------

  // 1. Unknown consent → always blocked
  if (batch.consentBasis === "unknown") {
    consentIssues.push("consentBasis is 'unknown' — contact basis not established");
    return buildResult("BLOCK", batch.id, batch.workspaceId, reasons, 0,
      reputationWarnings, consentIssues, complianceFlags);
  }

  // 2. Missing unsubscribe mechanism → always blocked
  if (batch.unsubscribeMechanism === "absent") {
    complianceFlags.push("unsubscribeMechanism absent — required under CASL/CAN-SPAM");
    return buildResult("BLOCK", batch.id, batch.workspaceId, reasons, 0,
      reputationWarnings, consentIssues, complianceFlags);
  }

  // 3. Suppression hits → blocked
  const suppressionHits = suppressionEntries.filter(
    (e) => e.workspaceId === batch.workspaceId,
  ).length;
  if (suppressionHits > 0) {
    suppressionWarnings.push(`${suppressionHits} recipient(s) on suppression list — blocked`);
    return buildResult("BLOCK", batch.id, batch.workspaceId,
      suppressionWarnings, suppressionHits, reputationWarnings, consentIssues, complianceFlags);
  }

  // 4. Circuit breaker open → blocked
  if (reputationState?.circuitBreaker === "open") {
    reputationWarnings.push(
      `Circuit breaker open for domain ${reputationState.domain} — bounce/complaint rate exceeded`,
    );
    return buildResult("BLOCK", batch.id, batch.workspaceId, reasons, 0,
      reputationWarnings, consentIssues, complianceFlags);
  }

  // 5. Volume cap exceeded → blocked
  if (batch.recipientCount > batch.volumeCap) {
    reasons.push(
      `recipientCount (${batch.recipientCount}) exceeds volumeCap (${batch.volumeCap})`,
    );
    return buildResult("BLOCK", batch.id, batch.workspaceId, reasons, 0,
      reputationWarnings, consentIssues, complianceFlags);
  }

  // 6. Daily cap exceeded (reputation)
  if (reputationState && reputationState.dailySentCount >= reputationState.dailyCap) {
    reputationWarnings.push(
      `Daily sending cap reached for ${reputationState.domain} (${reputationState.dailySentCount}/${reputationState.dailyCap})`,
    );
    return buildResult("BLOCK", batch.id, batch.workspaceId, reasons, 0,
      reputationWarnings, consentIssues, complianceFlags);
  }

  // 7. Agent budget exceeded
  if (agentBudgetGuard) {
    if (input.agentDailyUsdSpent >= agentBudgetGuard.dailyUsdBudget) {
      reasons.push(
        `Agent ${agentBudgetGuard.agentId} daily USD budget exceeded ($${input.agentDailyUsdSpent} / $${agentBudgetGuard.dailyUsdBudget})`,
      );
      return buildResult("BLOCK", batch.id, batch.workspaceId, reasons, 0,
        reputationWarnings, consentIssues, complianceFlags);
    }
  }

  // 8. Org budget exceeded
  if (orgBudgetGuard) {
    if (input.orgDailyUsdSpent >= orgBudgetGuard.dailyUsdCap) {
      reasons.push(
        `Org daily USD cap exceeded ($${input.orgDailyUsdSpent} / $${orgBudgetGuard.dailyUsdCap})`,
      );
      return buildResult("BLOCK", batch.id, batch.workspaceId, reasons, 0,
        reputationWarnings, consentIssues, complianceFlags);
    }
  }

  // 9. consentBasis: manual_review_required without prior valid token → block
  if (
    batch.consentBasis === "manual_review_required" &&
    !batch.approvalToken
  ) {
    consentIssues.push(
      "consentBasis requires manual review — no prior approval token present",
    );
    return buildResult("BLOCK", batch.id, batch.workspaceId, reasons, 0,
      reputationWarnings, consentIssues, complianceFlags);
  }

  // -------------------------------------------------------------------------
  // COMPLIANCE WARNINGS (non-blocking individually, may escalate to BLOCK)
  // -------------------------------------------------------------------------

  if (batch.jurisdiction === "CA" && batch.consentBasis === "implied_verified") {
    if (batch.consentProvenance.length === 0) {
      consentIssues.push(
        "CASL: implied_verified consent requires at least one EvidenceRef in consentProvenance",
      );
      return buildResult("BLOCK", batch.id, batch.workspaceId, reasons, 0,
        reputationWarnings, consentIssues, complianceFlags);
    }
  }

  // -------------------------------------------------------------------------
  // ALLOW — Green zone
  // -------------------------------------------------------------------------

  // Internal test batches always ALLOW
  if (batch.audienceType === "internal_test") {
    reasons.push("audienceType is internal_test — Green zone");
    return buildResult("ALLOW", batch.id, batch.workspaceId, reasons, 0,
      reputationWarnings, consentIssues, complianceFlags);
  }

  // reply_assist on known contact with valid prior token → ALLOW
  if (
    batch.subVoie === "reply_assist" &&
    batch.audienceType === "known_contact" &&
    batch.approvalToken
  ) {
    reasons.push("reply_assist on known_contact with valid approval token — Green zone");
    return buildResult("ALLOW", batch.id, batch.workspaceId, reasons, 0,
      reputationWarnings, consentIssues, complianceFlags);
  }

  // -------------------------------------------------------------------------
  // REQUIRE_APPROVAL — Yellow zone (default for all client-facing batches)
  // -------------------------------------------------------------------------

  // cold_email + cold_prospect → Yellow strict (no auto-approval path)
  if (batch.subVoie === "cold_email" && batch.audienceType === "cold_prospect") {
    reasons.push("cold_email + cold_prospect — Yellow strict: batch approval required");
    return buildResult("REQUIRE_APPROVAL", batch.id, batch.workspaceId, reasons, 0,
      reputationWarnings, consentIssues, complianceFlags);
  }

  // All other client-facing → Yellow
  reasons.push(
    `${batch.subVoie} / ${batch.audienceType} — Yellow: batch approval required`,
  );
  return buildResult("REQUIRE_APPROVAL", batch.id, batch.workspaceId, reasons, 0,
    reputationWarnings, consentIssues, complianceFlags);
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function buildResult(
  decision: PolicyDecision,
  batchId: string,
  workspaceId: string,
  reasons: string[],
  suppressionHits: number,
  reputationWarnings: string[],
  consentIssues: string[],
  complianceFlags: string[],
): OutboundPolicyResult {
  return {
    decision,
    record: {
      decision,
      batchId,
      workspaceId,
      reasons,
      suppressionHits,
      reputationWarnings,
      consentIssues,
      complianceFlags,
    },
  };
}
