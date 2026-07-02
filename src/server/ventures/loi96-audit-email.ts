// src/server/ventures/loi96-audit-email.ts
//
// Thin adapter: Loi 96 audit-offer email for a pipeline target. The bespoke
// copy now lives as DATA in the generic VentureMarketProfile
// (`@/config/ventures/loi96-profile`), and the email is produced by the generic
// `buildOutreachEmail` builder. loi96 is no longer hard-coded logic — it is one
// venture configuration. This file preserves the original public API so the
// bridge and existing tests are untouched.
//
// To move to LLM personalization later, flip the profile's outreach.mode to
// "llm"; this adapter does not change.

import type { Loi96Target } from "./loi96-target-store";
import { loi96VentureProfile } from "@/config/ventures/loi96-profile";
import {
  buildOutreachEmail,
  type OutreachEmail,
} from "@/core/ventures/build-outreach-email";

export type Loi96AuditEmail = OutreachEmail;

export function buildLoi96AuditEmail(target: Loi96Target): Loi96AuditEmail {
  return buildOutreachEmail(loi96VentureProfile, {
    id: target.domain,
    name: target.name,
    contact: target.contact ?? undefined,
    reference: target.domain,
    angle: target.angle,
  });
}
