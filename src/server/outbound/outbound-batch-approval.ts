// ---------------------------------------------------------------------------
// Outbound Batch Approval — CEO approval gate
// ---------------------------------------------------------------------------
// This module handles the batch approval lifecycle:
//   - Presenting a batch for CEO review
//   - Generating and validating approvalToken (bound to contentHash)
//   - Transitioning batch state: pending_approval → approved | blocked
//
// INVARIANT: approvalToken is bound to contentHash.
//   If the batch content changes after approval, the token is invalid.
//   This is enforced by validateApprovalToken().
//
// See docs/REVENUE_EXECUTION_LANE.md §3 and §10
// ---------------------------------------------------------------------------

import type { OutboundBatch } from "./outbound-types";
import { isBatchTransitionAllowed } from "./outbound-types";

// ---------------------------------------------------------------------------
// Approval token
// ---------------------------------------------------------------------------

/**
 * Generates an approval token bound to the batch contentHash.
 * Token format: `approval:{contentHash}:{approverId}:{approvedAt}`
 *
 * This is intentionally simple — production should use a HMAC.
 * The key invariant: the token encodes the contentHash, so any
 * mutation to the batch content invalidates the token.
 */
export function generateApprovalToken(
  contentHash: string,
  approverId: string,
  approvedAt: string,
): string {
  return `approval:${contentHash}:${approverId}:${approvedAt}`;
}

/**
 * Validates that an approvalToken is still valid for a given contentHash.
 * Returns false if the batch content has changed since approval.
 */
export function validateApprovalToken(
  token: string,
  currentContentHash: string,
): boolean {
  if (!token.startsWith("approval:")) return false;
  const parts = token.split(":");
  if (parts.length < 4) return false;
  const tokenContentHash = parts[1];
  return tokenContentHash === currentContentHash;
}

// ---------------------------------------------------------------------------
// Approval result
// ---------------------------------------------------------------------------

export type BatchApprovalDecision = "approved" | "blocked";

export type BatchApprovalResult = {
  decision: BatchApprovalDecision;
  batch: OutboundBatch;
  approvalToken?: string;
  reason?: string;
};

/**
 * Records CEO approval on a batch in pending_approval state.
 * Generates an approvalToken bound to the current contentHash.
 *
 * Returns the updated batch (immutable — does not mutate the input).
 */
export function approveBatch(
  batch: OutboundBatch,
  approverId: string,
): BatchApprovalResult {
  if (!isBatchTransitionAllowed(batch.state, "approved")) {
    return {
      decision: "blocked",
      batch,
      reason: `Cannot approve batch in state '${batch.state}'`,
    };
  }

  const approvedAt = new Date().toISOString();
  const approvalToken = generateApprovalToken(batch.contentHash, approverId, approvedAt);

  const approved: OutboundBatch = {
    ...batch,
    state: "approved",
    approvalToken,
    approvedBy: approverId,
    approvedAt,
    updatedAt: approvedAt,
  };

  return { decision: "approved", batch: approved, approvalToken };
}

/**
 * Records CEO rejection on a batch in pending_approval state.
 */
export function blockBatch(
  batch: OutboundBatch,
  blockerId: string,
  reason: string,
): BatchApprovalResult {
  if (!isBatchTransitionAllowed(batch.state, "blocked")) {
    return {
      decision: "blocked",
      batch,
      reason: `Cannot block batch in state '${batch.state}'`,
    };
  }

  const blockedAt = new Date().toISOString();
  const blocked: OutboundBatch = {
    ...batch,
    state: "blocked",
    updatedAt: blockedAt,
  };

  return { decision: "blocked", batch: blocked, reason: `Blocked by ${blockerId}: ${reason}` };
}

/**
 * Checks whether a batch's approvalToken is still valid.
 * Call this before executing a batch to ensure the content hasn't changed.
 */
export function isBatchApprovalStillValid(batch: OutboundBatch): boolean {
  if (batch.state !== "approved") return false;
  if (!batch.approvalToken) return false;
  return validateApprovalToken(batch.approvalToken, batch.contentHash);
}

/**
 * Checks whether the send window is still open.
 */
export function isSendWindowOpen(batch: OutboundBatch): boolean {
  const now = new Date();
  const start = new Date(batch.sendWindow.start);
  const end = new Date(batch.sendWindow.end);
  return now >= start && now <= end;
}

/**
 * Expires a batch if its token is no longer valid (content changed)
 * or its send window has passed.
 */
export function maybeExpireBatch(batch: OutboundBatch): OutboundBatch {
  if (batch.state !== "approved" && batch.state !== "paused") return batch;

  const tokenValid = isBatchApprovalStillValid(batch);
  const windowOpen = isSendWindowOpen(batch);

  if (!tokenValid || !windowOpen) {
    return { ...batch, state: "expired", updatedAt: new Date().toISOString() };
  }

  return batch;
}
