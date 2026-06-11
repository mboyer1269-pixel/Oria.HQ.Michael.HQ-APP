// ---------------------------------------------------------------------------
// Outbound Channel Abstraction — pure descriptors + cross-channel validation
// ---------------------------------------------------------------------------
// See docs/REVENUE_EXECUTION_LANE.md §3.1 (`ceo_single_send`, decision
// 2026-06-10) and docs/DECISION_LOG.md.
//
// This module is PURE: no network, no env, no DB. It defines:
//   * ChannelDescriptor — the static contract of a delivery channel
//     (caps, quiet hours, consent requirements, structural blocks);
//   * validateActionForChannel() — fail-safe validation every adapter MUST
//     pass before its send() is invoked.
//
// Provider adapters (Resend email, Twilio SMS) implement delivery in later
// PRs. They consume these descriptors; they never relax them. Adding a
// channel = adding a descriptor + an adapter. Cross-channel guardrails
// (suppression list, approvalToken/contentHash, idempotency, ledger
// pre-dispatch) live in the bridge and are shared by ALL channels.
//
// Hard rules encoded structurally (not by discipline):
//   * SMS to a cold_prospect is impossible (blockedAudiences).
//   * Unknown consent or unknown recipient local time NEVER passes on a
//     quiet-hours channel (fail-safe: unknown is never green).
//   * Daily caps are constants. Not env vars. Not advisory.
// ---------------------------------------------------------------------------

import type {
  AudienceType,
  ConsentBasis,
  OutboundAction,
  OutboundBatch,
} from "./outbound-types.ts";

export type OutboundChannelId = "email" | "sms";

export type ChannelDescriptor = {
  channelId: OutboundChannelId;
  displayName: string;
  /** Hard daily send cap for this channel (per workspace). Constant. */
  dailyCap: number;
  /** Max rendered body length accepted by the channel, or null. */
  maxBodyLength: number | null;
  /**
   * Local-recipient quiet window during which sends are blocked.
   * Block applies when hour >= startHour OR hour < endHour.
   * Channels with null have no quiet-hours restriction.
   */
  quietHours: { startHour: number; endHour: number } | null;
  /** Consent bases acceptable on this channel. Everything else is blocked. */
  allowedConsentBases: readonly ConsentBasis[];
  /** Audiences structurally forbidden on this channel. */
  blockedAudiences: readonly AudienceType[];
  /** Whether the batch must carry an unsubscribe/opt-out mechanism. */
  requiresUnsubscribeMechanism: boolean;
};

export const EMAIL_CHANNEL: ChannelDescriptor = {
  channelId: "email",
  displayName: "Email (Resend)",
  dailyCap: 20,
  maxBodyLength: null,
  quietHours: null,
  allowedConsentBases: ["express", "implied_verified"],
  blockedAudiences: [],
  requiresUnsubscribeMechanism: true,
};

export const SMS_CHANNEL: ChannelDescriptor = {
  channelId: "sms",
  displayName: "SMS (Twilio)",
  dailyCap: 10,
  maxBodyLength: 1600,
  quietHours: { startHour: 21, endHour: 9 },
  allowedConsentBases: ["express", "implied_verified"],
  // Cold SMS is structurally impossible — REVENUE_EXECUTION_LANE.md §3.1.
  blockedAudiences: ["cold_prospect"],
  requiresUnsubscribeMechanism: true,
};

const CHANNELS: ReadonlyMap<OutboundChannelId, ChannelDescriptor> = new Map([
  ["email", EMAIL_CHANNEL],
  ["sms", SMS_CHANNEL],
]);

export function getChannelDescriptor(id: OutboundChannelId): ChannelDescriptor {
  const descriptor = CHANNELS.get(id);
  if (!descriptor) {
    throw new Error(`Unknown outbound channel: ${id}`);
  }
  return descriptor;
}

export function listChannelDescriptors(): ChannelDescriptor[] {
  return [...CHANNELS.values()];
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type ChannelViolationCode =
  | "consent_basis_not_allowed"
  | "audience_blocked_on_channel"
  | "daily_cap_reached"
  | "quiet_hours"
  | "recipient_local_time_unknown"
  | "body_too_long"
  | "body_empty"
  | "unsubscribe_mechanism_missing";

export type ChannelViolation = {
  code: ChannelViolationCode;
  message: string;
};

export type ChannelValidationResult =
  | { ok: true }
  | { ok: false; violations: ChannelViolation[] };

export type ChannelValidationContext = {
  /** Number of actions already sent today on this channel for the workspace. */
  sentTodayOnChannel: number;
  /**
   * Recipient local hour (0-23) at send time, or null when unknown.
   * On quiet-hours channels, unknown local time BLOCKS (fail-safe).
   */
  recipientLocalHour: number | null;
};

export function validateActionForChannel(
  channel: ChannelDescriptor,
  batch: Pick<OutboundBatch, "consentBasis" | "audienceType" | "unsubscribeMechanism">,
  action: Pick<OutboundAction, "renderedBody">,
  context: ChannelValidationContext,
): ChannelValidationResult {
  const violations: ChannelViolation[] = [];

  if (!channel.allowedConsentBases.includes(batch.consentBasis)) {
    violations.push({
      code: "consent_basis_not_allowed",
      message: `Consent basis "${batch.consentBasis}" is not allowed on channel "${channel.channelId}".`,
    });
  }

  if (channel.blockedAudiences.includes(batch.audienceType)) {
    violations.push({
      code: "audience_blocked_on_channel",
      message: `Audience "${batch.audienceType}" is structurally blocked on channel "${channel.channelId}".`,
    });
  }

  if (context.sentTodayOnChannel >= channel.dailyCap) {
    violations.push({
      code: "daily_cap_reached",
      message: `Daily cap (${channel.dailyCap}) reached on channel "${channel.channelId}".`,
    });
  }

  if (channel.quietHours !== null) {
    if (context.recipientLocalHour === null) {
      violations.push({
        code: "recipient_local_time_unknown",
        message: `Recipient local time is unknown; channel "${channel.channelId}" enforces quiet hours (fail-safe block).`,
      });
    } else {
      const { startHour, endHour } = channel.quietHours;
      const hour = context.recipientLocalHour;
      if (hour >= startHour || hour < endHour) {
        violations.push({
          code: "quiet_hours",
          message: `Send blocked during quiet hours (${startHour}h-${endHour}h) on channel "${channel.channelId}".`,
        });
      }
    }
  }

  const body = action.renderedBody ?? "";
  if (body.trim().length === 0) {
    violations.push({
      code: "body_empty",
      message: "Rendered body is empty.",
    });
  }
  if (channel.maxBodyLength !== null && body.length > channel.maxBodyLength) {
    violations.push({
      code: "body_too_long",
      message: `Rendered body exceeds channel max length (${channel.maxBodyLength}).`,
    });
  }

  if (channel.requiresUnsubscribeMechanism && batch.unsubscribeMechanism !== "present") {
    violations.push({
      code: "unsubscribe_mechanism_missing",
      message: `Channel "${channel.channelId}" requires an unsubscribe/opt-out mechanism.`,
    });
  }

  if (violations.length > 0) {
    return { ok: false, violations };
  }
  return { ok: true };
}
