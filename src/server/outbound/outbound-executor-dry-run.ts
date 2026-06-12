// ---------------------------------------------------------------------------
// Outbound Execution Bridge — DRY-RUN mode
// ---------------------------------------------------------------------------
// This module prepares outbound payloads for n8n/email execution.
// DRY-RUN MODE: No live sends. No network calls. No real emails.
//
// What this does:
//   1. Validates that the batch is in a valid state for execution
//   2. Validates the approvalToken against the current contentHash
//   3. Validates that the send window is open
//   4. Builds the n8n webhook payload for each action
//   5. Simulates a signed callback (idempotent, dry-run proof)
//   6. Records the result in the Action Ledger (dry-run eventType)
//
// What this does NOT do:
//   - Send any real email
//   - Call any external webhook
//   - Write to production DB
//   - Authorize any spend
//
// SAFETY INVARIANT: The live bridge (PR-F, future) must pass the SAME
// validation checks before it is allowed to send. The dry-run IS the
// specification for the live bridge.
//
// See docs/REVENUE_EXECUTION_LANE.md §11 (hors scope v1: no live send)
// See WO-07 for callback signing requirements
// ---------------------------------------------------------------------------

import type { OutboundBatch, OutboundAction } from "./outbound-types.ts";
import { isBatchTransitionAllowed } from "./outbound-types.ts";
import { isBatchApprovalStillValid, isSendWindowOpen } from "./outbound-batch-approval.ts";

// ---------------------------------------------------------------------------
// Webhook payload shape (n8n → Oria-approved format)
// ---------------------------------------------------------------------------

export type N8nWebhookPayload = {
  actionId: string;
  batchId: string;
  workspaceId: string;
  agentId: string;
  actionType: string;
  leadId: string;
  idempotencyKey: string;
  renderedSubject: string;
  renderedBody: string;
  jurisdiction: string;
  unsubscribeUrl: string;         // placeholder — real URL wired in live bridge
  aiDisclosure: string;
  dryRun: true;                   // always true in this module
  requestedAt: string;
};

// ---------------------------------------------------------------------------
// Signed callback (n8n → Oria result)
// ---------------------------------------------------------------------------

export type SignedCallback = {
  actionId: string;
  idempotencyKey: string;
  outcome: "simulated_sent";
  callbackSignature: string;      // HMAC placeholder — real signing in live bridge
  dryRun: true;
  receivedAt: string;
};

// ---------------------------------------------------------------------------
// Dry-run execution result
// ---------------------------------------------------------------------------

export type DryRunActionResult = {
  action: OutboundAction;
  webhookPayload: N8nWebhookPayload;
  simulatedCallback: SignedCallback;
  ledgerNote: string;
};

export type DryRunBatchResult = {
  batchId: string;
  workspaceId: string;
  status: "ok" | "blocked";
  blockReason?: string;
  actions: DryRunActionResult[];
  executedAt: string;
  totalActions: number;
  dryRun: true;
};

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Runs the execution bridge in DRY-RUN mode.
 * Validates everything, builds payloads, simulates callbacks.
 * NEVER sends real emails or calls real webhooks.
 */
export function executeBatchDryRun(
  batch: OutboundBatch,
  actions: OutboundAction[],
): DryRunBatchResult {
  const executedAt = new Date().toISOString();

  // 1. Batch must be in approved state
  if (!isBatchTransitionAllowed(batch.state, "executing")) {
    return {
      batchId: batch.id,
      workspaceId: batch.workspaceId,
      status: "blocked",
      blockReason: `Batch state '${batch.state}' does not allow execution`,
      actions: [],
      executedAt,
      totalActions: 0,
      dryRun: true,
    };
  }

  // 2. approvalToken must be valid (contentHash unchanged since approval)
  if (!isBatchApprovalStillValid(batch)) {
    return {
      batchId: batch.id,
      workspaceId: batch.workspaceId,
      status: "blocked",
      blockReason: "approvalToken is invalid or contentHash has changed since approval — batch expired",
      actions: [],
      executedAt,
      totalActions: 0,
      dryRun: true,
    };
  }

  // 3. Send window must be open
  if (!isSendWindowOpen(batch)) {
    return {
      batchId: batch.id,
      workspaceId: batch.workspaceId,
      status: "blocked",
      blockReason: `Send window has closed (${batch.sendWindow.end})`,
      actions: [],
      executedAt,
      totalActions: 0,
      dryRun: true,
    };
  }

  // 4. Process each action
  const results: DryRunActionResult[] = actions.map((action) =>
    buildDryRunActionResult(action, batch),
  );

  return {
    batchId: batch.id,
    workspaceId: batch.workspaceId,
    status: "ok",
    actions: results,
    executedAt,
    totalActions: results.length,
    dryRun: true,
  };
}

// ---------------------------------------------------------------------------
// Action-level helpers (pure)
// ---------------------------------------------------------------------------

function buildDryRunActionResult(
  action: OutboundAction,
  batch: OutboundBatch,
): DryRunActionResult {
  const now = new Date().toISOString();

  const webhookPayload: N8nWebhookPayload = {
    actionId: action.id,
    batchId: batch.id,
    workspaceId: batch.workspaceId,
    agentId: batch.agentId,
    actionType: action.actionType,
    leadId: action.leadId,
    idempotencyKey: action.idempotencyKey,
    renderedSubject: action.renderedSubject,
    renderedBody: action.renderedBody,
    jurisdiction: batch.jurisdiction,
    unsubscribeUrl: `https://oria-hq.cloud/unsubscribe/${action.idempotencyKey}`,
    aiDisclosure: batch.aiDisclosure,
    dryRun: true,
    requestedAt: now,
  };

  const simulatedCallback: SignedCallback = {
    actionId: action.id,
    idempotencyKey: action.idempotencyKey,
    outcome: "simulated_sent",
    // Placeholder signature — real bridge uses HMAC-SHA256(payload + WEBHOOK_SIGNING_SECRET)
    callbackSignature: `dry-run:${action.idempotencyKey}:${now}`,
    dryRun: true,
    receivedAt: now,
  };

  const updatedAction: OutboundAction = {
    ...action,
    state: "sent",
    sentAt: now,
    updatedAt: now,
  };

  return {
    action: updatedAction,
    webhookPayload,
    simulatedCallback,
    ledgerNote: `[DRY-RUN] outbound.sent — batch:${batch.id} lead:${action.leadId} idempotencyKey:${action.idempotencyKey}`,
  };
}

// ---------------------------------------------------------------------------
// Idempotency guard (pure helper for callers)
// ---------------------------------------------------------------------------

/**
 * Checks whether an action has already been processed (sent or beyond).
 * Used to prevent double-processing when a callback is replayed.
 */
export function isActionAlreadyProcessed(action: OutboundAction): boolean {
  return (
    action.state === "sent" ||
    action.state === "delivered" ||
    action.state === "bounced" ||
    action.state === "outcome_captured" ||
    action.state === "closed" ||
    action.state === "orphaned"
  );
}
