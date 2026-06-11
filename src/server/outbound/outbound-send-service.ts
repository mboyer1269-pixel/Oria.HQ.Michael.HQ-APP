// ---------------------------------------------------------------------------
// Outbound Send Service — `ceo_single_send` orchestration for the Send Desk
// ---------------------------------------------------------------------------
// Wires the in-memory store + injected ledger writer + injected channel
// adapter into the live bridge. One action per call. The CEO click (owner-
// gated API route) is the ONLY caller.
//
// Dependencies are injected so this module is fully node-testable:
//   * `ledger`   — writes to the real Action Ledger in production
//                  (see outbound-ledger.ts);
//   * `channelSend` — Resend/Twilio adapter in production.
// ---------------------------------------------------------------------------

import {
  executeSingleSendLive,
  type ChannelSendPort,
  type LiveLedgerEventInput,
  type LiveSendResult,
} from "./outbound-executor-live.ts";
import {
  getOutboundOutcome,
  getOutboundSendCandidate,
  incrementSentToday,
  isSuppressed,
  recordOutboundOutcome,
  sentTodayOnChannel,
} from "./outbound-send-store.ts";

export type OutboundSendDeps = {
  channelSend: ChannelSendPort;
  ledger: (event: LiveLedgerEventInput) => Promise<{ ledgerEventId: string }>;
};

export type OutboundSendRequest = {
  workspaceId: string;
  actionId: string;
  /** Token displayed to the CEO at approval time; must match the batch. */
  approvalToken: string;
};

export type OutboundSendServiceResult =
  | { kind: "result"; result: LiveSendResult }
  | { kind: "not_found" }
  | { kind: "token_mismatch" };

export async function sendOutboundActionAsCeo(
  request: OutboundSendRequest,
  deps: OutboundSendDeps,
): Promise<OutboundSendServiceResult> {
  const candidate = getOutboundSendCandidate(request.workspaceId, request.actionId);
  if (!candidate) {
    return { kind: "not_found" };
  }

  // The click must carry the exact token bound to the approved content.
  // A stale UI (content re-drafted after approval) can never send.
  if (!candidate.batch.approvalToken || candidate.batch.approvalToken !== request.approvalToken) {
    return { kind: "token_mismatch" };
  }

  const result = await executeSingleSendLive(
    {
      batch: candidate.batch,
      action: candidate.action,
      recipient: candidate.recipient,
      channelId: candidate.channelId,
      recipientLocalHour: candidate.recipientLocalHour,
    },
    {
      channelSend: deps.channelSend,
      isSuppressed: async (workspaceId, recipient) => isSuppressed(workspaceId, recipient),
      getRecordedOutcome: async (idempotencyKey) => getOutboundOutcome(idempotencyKey),
      recordOutcome: async (idempotencyKey, outcome) =>
        recordOutboundOutcome(idempotencyKey, outcome),
      recordLedgerEvent: deps.ledger,
      sentTodayOnChannel: async (workspaceId, channelId) =>
        sentTodayOnChannel(workspaceId, channelId),
    },
  );

  if (result.status === "sent" && !result.alreadySent) {
    incrementSentToday(request.workspaceId, candidate.channelId);
  }

  return { kind: "result", result };
}
