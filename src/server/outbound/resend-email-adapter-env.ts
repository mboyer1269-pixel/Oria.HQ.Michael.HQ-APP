// ---------------------------------------------------------------------------
// Resend Email Adapter — production env wiring (separate from the pure
// adapter so node --test can load resend-email-adapter.ts without Next
// path aliases or env side effects).
// ---------------------------------------------------------------------------

import { serverEnv } from "@/lib/server-env";
import type { ChannelSendPort } from "./outbound-executor-live.ts";
import { createResendEmailAdapter, type ResendLikeClient } from "./resend-email-adapter.ts";

export class ResendAdapterConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResendAdapterConfigError";
  }
}

/** Production wiring. Throws when env is incomplete — fail closed, never a silent no-op. */
export function createResendEmailAdapterFromEnv(): ChannelSendPort {
  const apiKey = serverEnv.resendApiKey;
  const fromEmail = serverEnv.resendFromEmail;
  if (!apiKey || !fromEmail) {
    throw new ResendAdapterConfigError(
      "Resend adapter requires RESEND_API_KEY and RESEND_FROM_EMAIL to be configured.",
    );
  }
  return createResendEmailAdapter({ fromEmail, fromName: "Orya HQ" }, async () => {
    const { Resend } = await import("resend");
    return new Resend(apiKey) as unknown as ResendLikeClient;
  });
}
