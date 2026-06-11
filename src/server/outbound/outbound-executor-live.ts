// ---------------------------------------------------------------------------
// Outbound Execution Bridge — LIVE single-send mode (`ceo_single_send`)
// ---------------------------------------------------------------------------
// See docs/REVENUE_EXECUTION_LANE.md §3.1 and docs/DECISION_LOG.md
// (2026-06-10). This is the live counterpart of outbound-executor-dry-run.ts
// and passes the SAME validations, plus the channel + suppression +
// idempotency + ledger-pre-dispatch layers.
//
// Invariants:
//   * ONE action per invocation. No batch loop exists in this module.
//   * The CEO click is the trigger. This module is only reachable from the
//     owner-gated send API; it never schedules or retries on its own.
//   * Ledger BEFORE dispatch (green-lane pattern, PR #218): if the ledger
//     write fails, nothing is sent.
//   * Idempotent: a repeated idempotencyKey returns the recorded outcome and
//     NEVER sends twice.
//   * All effects go through injected ports — this module is pure logic and
//     fully testable without network/DB.
// ---------------------------------------------------------------------------

import type { OutboundAction, OutboundBatch } from "./outbound-types.ts";
import { isBatchTransitionAllowed } from "./outbound-types.ts";
import { isBatchApprovalStillValid, isSendWindowOpen } from "./outbound-batch-approval.ts";
import {
  getChannelDescriptor,
  validateActionForChannel,
  type ChannelValidationContext,
  type OutboundChannelId,
} from "./outbound-channel.ts";

// ---------------------------------------------------------------------------
// Ports (all effects injected)
// ---------------------------------------------------------------------------

export type ChannelSendInput = {
  to: string;
  subject: string;
  body: string;
  idempotencyKey: string;
};

export type ChannelSendOutcome =
  | { ok: true; providerMessageId: string }
  | { ok: false; errorCode: string; retryable: boolean };

export type ChannelSendPort = {
  send(input: ChannelSendInput): Promise<ChannelSendOutcome>;
};

export type LiveLedgerEventInput = {
  eventType: "action" | "result";
  actionType: string;
  summary: string;
  workspaceId: string;
  metadata: Record<string, unknown>;
};

export type LiveExecutionPorts = {
  /** Delivery adapter for the requested channel (Resend, Twilio, ...). */
  channelSend: ChannelSendPort;
  /** Cross-channel suppression list, keyed by recipient identity. */
  isSuppressed(workspaceId: string, recipient: string): Promise<boolean>;
  /** Idempotency store: outcome previously recorded for this key, if any. */
  getRecordedOutcome(idempotencyKey: string): Promise<LiveSendResult | null>;
  /** Persist the outcome for this idempotencyKey (called once per send). */
  recordOutcome(idempotencyKey: string, result: LiveSendResult): Promise<void>;
  /** Ledger writer. MUST throw on failure — a failed ledger blocks dispatch. */
  recordLedgerEvent(event: LiveLedgerEventInput): Promise<{ ledgerEventId: string }>;
  /** Count of actions already sent today on this channel (workspace scope). */
  sentTodayOnChannel(workspaceId: string, channelId: OutboundChannelId): Promise<number>;
};

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export type LiveSendResult =
  | {
      status: "sent";
      actionId: string;
      idempotencyKey: string;
      channelId: OutboundChannelId;
      providerMessageId: string;
      ledgerEventId: string;
      sentAt: string;
      alreadySent: false;
    }
  | {
      status: "sent";
      actionId: string;
      idempotencyKey: string;
      channelId: OutboundChannelId;
      providerMessageId: string;
      ledgerEventId: string;
      sentAt: string;
      alreadySent: true;
    }
  | {
      status: "blocked";
      actionId: string;
      idempotencyKey: string;
      channelId: OutboundChannelId;
      blockReason: string;
      blockCodes: string[];
    }
  | {
      status: "failed";
      actionId: string;
      idempotencyKey: string;
      channelId: OutboundChannelId;
      errorCode: string;
      retryable: boolean;
      ledgerEventId: string;
    };

export type LiveSendRequest = {
  batch: OutboundBatch;
  action: OutboundAction;
  /** Resolved recipient identity (email address or E.164 phone). */
  recipient: string;
  channelId: OutboundChannelId;
  /** Recipient local hour for quiet-hours channels; null = unknown. */
  recipientLocalHour: number | null;
};

// ---------------------------------------------------------------------------
// Main — ONE action per invocation
// ---------------------------------------------------------------------------

export async function executeSingleSendLive(
  request: LiveSendRequest,
  ports: LiveExecutionPorts,
): Promise<LiveSendResult> {
  const { batch, action, recipient, channelId } = request;

  const blocked = (reason: string, codes: string[]): LiveSendResult => ({
    status: "blocked",
    actionId: action.id,
    idempotencyKey: action.idempotencyKey,
    channelId,
    blockReason: reason,
    blockCodes: codes,
  });

  // 0. Idempotency FIRST: a repeated click never sends twice.
  const recorded = await ports.getRecordedOutcome(action.idempotencyKey);
  if (recorded && recorded.status === "sent") {
    return { ...recorded, alreadySent: true };
  }

  // 1. ceo_single_send requires per-message approval mode.
  if (batch.approvalMode !== "per_message") {
    return blocked(
      `approvalMode '${batch.approvalMode}' is not allowed in the live single-send bridge (per_message required)`,
      ["approval_mode_not_per_message"],
    );
  }

  // 2-4. SAME validations as the dry-run bridge.
  if (!isBatchTransitionAllowed(batch.state, "executing")) {
    return blocked(`Batch state '${batch.state}' does not allow execution`, ["batch_state"]);
  }
  if (!isBatchApprovalStillValid(batch)) {
    return blocked(
      "approvalToken is invalid or contentHash has changed since approval",
      ["approval_token_invalid"],
    );
  }
  if (!isSendWindowOpen(batch)) {
    return blocked(`Send window has closed (${batch.sendWindow.end})`, ["send_window_closed"]);
  }

  // 5. Channel-level validation (caps, quiet hours, consent, opt-out, body).
  const channel = getChannelDescriptor(channelId);
  const channelContext: ChannelValidationContext = {
    sentTodayOnChannel: await ports.sentTodayOnChannel(batch.workspaceId, channelId),
    recipientLocalHour: request.recipientLocalHour,
  };
  const channelResult = validateActionForChannel(channel, batch, action, channelContext);
  if (!channelResult.ok) {
    return blocked(
      channelResult.violations.map((violation) => violation.message).join(" | "),
      channelResult.violations.map((violation) => violation.code),
    );
  }

  // 6. Suppression list (cross-channel, fail-closed).
  if (await ports.isSuppressed(batch.workspaceId, recipient)) {
    return blocked(`Recipient is on the suppression list`, ["suppressed"]);
  }

  // 7. Ledger BEFORE dispatch. A ledger failure blocks the send (throws).
  const preDispatch = await ports.recordLedgerEvent({
    eventType: "action",
    actionType: `outbound.${channelId}.send`,
    summary: `ceo_single_send dispatch: ${action.renderedSubject || "(no subject)"} → ${recipient}`,
    workspaceId: batch.workspaceId,
    metadata: {
      actionId: action.id,
      batchId: batch.id,
      idempotencyKey: action.idempotencyKey,
      channelId,
      contentHash: batch.contentHash,
      approvalMode: batch.approvalMode,
    },
  });

  // 8. Dispatch — exactly one recipient.
  const outcome = await ports.channelSend.send({
    to: recipient,
    subject: action.renderedSubject,
    body: action.renderedBody,
    idempotencyKey: action.idempotencyKey,
  });

  // 9. Result ledger event + idempotency record.
  if (!outcome.ok) {
    const failure = await ports.recordLedgerEvent({
      eventType: "result",
      actionType: `outbound.${channelId}.send_failed`,
      summary: `Dispatch failed (${outcome.errorCode}) for action ${action.id}`,
      workspaceId: batch.workspaceId,
      metadata: {
        actionId: action.id,
        idempotencyKey: action.idempotencyKey,
        errorCode: outcome.errorCode,
        retryable: outcome.retryable,
        preDispatchLedgerEventId: preDispatch.ledgerEventId,
      },
    });
    const failed: LiveSendResult = {
      status: "failed",
      actionId: action.id,
      idempotencyKey: action.idempotencyKey,
      channelId,
      errorCode: outcome.errorCode,
      retryable: outcome.retryable,
      ledgerEventId: failure.ledgerEventId,
    };
    await ports.recordOutcome(action.idempotencyKey, failed);
    return failed;
  }

  const sentAt = new Date().toISOString();
  const resultEvent = await ports.recordLedgerEvent({
    eventType: "result",
    actionType: `outbound.${channelId}.sent`,
    summary: `Sent via ${channel.displayName}: ${action.renderedSubject || "(no subject)"} → ${recipient}`,
    workspaceId: batch.workspaceId,
    metadata: {
      actionId: action.id,
      idempotencyKey: action.idempotencyKey,
      providerMessageId: outcome.providerMessageId,
      preDispatchLedgerEventId: preDispatch.ledgerEventId,
      sentAt,
    },
  });

  const sent: LiveSendResult = {
    status: "sent",
    actionId: action.id,
    idempotencyKey: action.idempotencyKey,
    channelId,
    providerMessageId: outcome.providerMessageId,
    ledgerEventId: resultEvent.ledgerEventId,
    sentAt,
    alreadySent: false,
  };
  await ports.recordOutcome(action.idempotencyKey, sent);
  return sent;
}
