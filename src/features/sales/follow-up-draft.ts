// src/features/sales/follow-up-draft.ts
//
// Prepare-only follow-up drafts (SMS / email). Never sends.
// Warm lanes only: reply_assist | follow_up. Cold blocked.

import type { SalesLead } from "./sales-lead";

export type FollowUpChannel = "sms" | "email";
export type FollowUpLane = "reply_assist" | "follow_up";

export type FollowUpDraft = {
  draftId: string;
  leadId: string;
  channel: FollowUpChannel;
  lane: FollowUpLane;
  /** Recipient for human copy/paste — not auto-sent. */
  to: string;
  subject?: string;
  body: string;
  rationale: string;
  createdAt: string;
  requiresManualSend: true;
  noExecutionAuthorized: true;
};

export type FollowUpPrepareInput = {
  lead: SalesLead;
  channel: FollowUpChannel;
  lane?: FollowUpLane;
  /** Optional vehicle line for personalization. */
  vehicleHint?: string;
  nowIso: string;
  draftId?: string;
};

export type FollowUpPrepareResult =
  | { ok: true; draft: FollowUpDraft }
  | { ok: false; errors: string[] };

function resolveTo(lead: SalesLead, channel: FollowUpChannel): string | null {
  if (channel === "sms") return lead.phone?.trim() || null;
  return lead.email?.trim() || null;
}

function buildBody(lead: SalesLead, lane: FollowUpLane, vehicleHint?: string): string {
  const first = lead.fullName.trim().split(/\s+/)[0] ?? lead.fullName;
  const vehicle = vehicleHint?.trim() || lead.interestedModels[0] || "le véhicule qui vous intéressait";
  if (lane === "reply_assist") {
    return (
      `Bonjour ${first}, merci pour votre message. ` +
      `Je suis disponible pour vous parler de ${vehicle} et planifier un essai à Buckingham GM. ` +
      `Quel moment vous convient aujourd'hui ou demain ?`
    );
  }
  return (
    `Bonjour ${first}, je voulais faire un suivi concernant ${vehicle}. ` +
    `Souhaitez-vous venir le voir / l'essayer cette semaine à Buckingham Chevrolet Buick GMC ? ` +
    `Répondez-moi avec un créneau qui vous arrange.`
  );
}

/**
 * Build a copy-ready follow-up draft. Blocks cold outreach and lost/sold leads.
 */
export function prepareFollowUpDraft(input: FollowUpPrepareInput): FollowUpPrepareResult {
  const errors: string[] = [];
  const lane = input.lane ?? "follow_up";
  if (lane !== "reply_assist" && lane !== "follow_up") {
    errors.push("lane must be reply_assist or follow_up (cold blocked)");
  }
  if (input.lead.stage === "sold" || input.lead.stage === "lost") {
    errors.push(`cannot prepare follow-up for stage=${input.lead.stage}`);
  }
  if (input.lead.consentBasis === "unknown") {
    errors.push("consentBasis unknown — set express or implied_verified before outreach");
  }
  if (input.lead.consentBasis === "manual_review_required") {
    errors.push("consentBasis manual_review_required — resolve consent before outreach");
  }
  const to = resolveTo(input.lead, input.channel);
  if (!to) {
    errors.push(input.channel === "sms" ? "lead.phone required for SMS" : "lead.email required for email");
  }
  if (errors.length > 0 || !to) {
    return { ok: false, errors };
  }

  const draft: FollowUpDraft = {
    draftId: input.draftId ?? `fud_${input.lead.leadId}_${input.nowIso.replace(/[:.]/g, "")}`,
    leadId: input.lead.leadId,
    channel: input.channel,
    lane,
    to,
    subject:
      input.channel === "email"
        ? `Suivi — ${input.vehicleHint || input.lead.interestedModels[0] || "Buckingham GM"}`
        : undefined,
    body: buildBody(input.lead, lane, input.vehicleHint),
    rationale: `${lane} prepare-only for ${input.lead.source}; human sends`,
    createdAt: input.nowIso,
    requiresManualSend: true,
    noExecutionAuthorized: true,
  };
  return { ok: true, draft };
}
