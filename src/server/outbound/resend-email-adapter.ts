// ---------------------------------------------------------------------------
// Resend Email Adapter — ChannelSendPort implementation for the email channel
// ---------------------------------------------------------------------------
// Thin delivery adapter consumed by outbound-executor-live.ts. It sends ONE
// email per call. It contains no policy: every guardrail (consent, caps,
// quiet hours, suppression, approval token, idempotency, ledger) is enforced
// upstream by the live bridge before this adapter is reached.
//
// The Resend client is injected via a factory so tests never touch the
// network. createResendEmailAdapterFromEnv() wires the real client from
// server env (RESEND_API_KEY / RESEND_FROM_EMAIL), mirroring
// contact-notification-service.ts.
// ---------------------------------------------------------------------------

import type { ChannelSendOutcome, ChannelSendInput, ChannelSendPort } from "./outbound-executor-live.ts";

export type ResendLikeClient = {
  emails: {
    send(payload: {
      from: string;
      to: string[];
      subject: string;
      text: string;
      replyTo?: string;
      headers?: Record<string, string>;
    }): Promise<{ data: { id: string } | null; error: { message: string; name?: string } | null }>;
  };
};

export type ResendEmailAdapterConfig = {
  fromEmail: string;
  fromName?: string;
  replyTo?: string;
};

export function createResendEmailAdapter(
  config: ResendEmailAdapterConfig,
  clientFactory: () => Promise<ResendLikeClient>,
): ChannelSendPort {
  const from = config.fromName ? `${config.fromName} <${config.fromEmail}>` : config.fromEmail;

  return {
    async send(input: ChannelSendInput): Promise<ChannelSendOutcome> {
      let client: ResendLikeClient;
      try {
        client = await clientFactory();
      } catch {
        return { ok: false, errorCode: "provider_client_unavailable", retryable: false };
      }

      try {
        const response = await client.emails.send({
          from,
          to: [input.to],
          subject: input.subject,
          text: input.body,
          ...(config.replyTo ? { replyTo: config.replyTo } : {}),
          headers: {
            // Idempotency marker — also useful for webhook correlation (PR-6).
            "X-Orya-Idempotency-Key": input.idempotencyKey,
          },
        });

        if (response.error || !response.data) {
          return {
            ok: false,
            errorCode: response.error?.name || "provider_error",
            retryable: true,
          };
        }
        return { ok: true, providerMessageId: response.data.id };
      } catch {
        return { ok: false, errorCode: "provider_exception", retryable: true };
      }
    },
  };
}
