// src/features/sales/sales-lead.ts
//
// Pure SalesLead contracts for the dealership lead bank.
// Score + morning-queue ordering live here — no I/O.

export type LeadSource =
  | "walk_in"
  | "phone_in"
  | "web_form"
  | "marketplace_post"
  | "marketplace_message"
  | "referral"
  | "repeat_customer"
  | "manual_other";

export const LEAD_SOURCES: readonly LeadSource[] = [
  "walk_in",
  "phone_in",
  "web_form",
  "marketplace_post",
  "marketplace_message",
  "referral",
  "repeat_customer",
  "manual_other",
];

export type LeadStage =
  | "new"
  | "contacted"
  | "qualified"
  | "appointment_set"
  | "appointment_done"
  | "negotiation"
  | "sold"
  | "lost"
  | "nurture";

export const LEAD_STAGES: readonly LeadStage[] = [
  "new",
  "contacted",
  "qualified",
  "appointment_set",
  "appointment_done",
  "negotiation",
  "sold",
  "lost",
  "nurture",
];

export type ConsentBasis =
  | "express"
  | "implied_verified"
  | "manual_review_required"
  | "unknown";

export const CONSENT_BASES: readonly ConsentBasis[] = [
  "express",
  "implied_verified",
  "manual_review_required",
  "unknown",
];

export type SalesLead = {
  leadId: string;
  fullName: string;
  phone?: string;
  email?: string;
  source: LeadSource;
  /** Packet id, listing URL, call log ref, etc. */
  sourceRef?: string;
  interestedStockIds: string[];
  interestedModels: string[];
  stage: LeadStage;
  consentBasis: ConsentBasis;
  consentNote?: string;
  nextFollowUpAt?: string;
  lastContactAt?: string;
  lostReason?: string;
  soldStockId?: string;
  soldAt?: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string;
};

export type LeadValidation = {
  valid: boolean;
  errors: string[];
};

function requireText(value: unknown, field: string, errors: string[]): void {
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`${field} must be non-empty`);
  }
}

export function validateSalesLead(input: unknown): LeadValidation {
  const errors: string[] = [];
  if (!input || typeof input !== "object") {
    return { valid: false, errors: ["lead must be an object"] };
  }
  const lead = input as Record<string, unknown>;
  requireText(lead.leadId, "leadId", errors);
  requireText(lead.fullName, "fullName", errors);
  requireText(lead.createdAt, "createdAt", errors);
  requireText(lead.updatedAt, "updatedAt", errors);
  requireText(lead.createdByUserId, "createdByUserId", errors);
  if (typeof lead.source !== "string" || !LEAD_SOURCES.includes(lead.source as LeadSource)) {
    errors.push(`source must be one of: ${LEAD_SOURCES.join(", ")}`);
  }
  if (typeof lead.stage !== "string" || !LEAD_STAGES.includes(lead.stage as LeadStage)) {
    errors.push(`stage must be one of: ${LEAD_STAGES.join(", ")}`);
  }
  if (
    typeof lead.consentBasis !== "string" ||
    !CONSENT_BASES.includes(lead.consentBasis as ConsentBasis)
  ) {
    errors.push(`consentBasis must be one of: ${CONSENT_BASES.join(", ")}`);
  }
  if (typeof lead.notes !== "string") {
    errors.push("notes must be a string");
  }
  if (!Array.isArray(lead.interestedStockIds)) {
    errors.push("interestedStockIds must be an array");
  }
  if (!Array.isArray(lead.interestedModels)) {
    errors.push("interestedModels must be an array");
  }
  if (lead.stage === "sold" && (typeof lead.soldStockId !== "string" || !lead.soldStockId.trim())) {
    errors.push("sold requires soldStockId");
  }
  if (lead.stage === "lost" && (typeof lead.lostReason !== "string" || !lead.lostReason.trim())) {
    errors.push("lost requires lostReason");
  }
  if (!lead.phone && !lead.email) {
    errors.push("phone or email is required");
  }
  return { valid: errors.length === 0, errors };
}

/** Normalize phone for dedupe (digits only, keep leading +). */
export function normalizePhone(phone: string | undefined): string | undefined {
  if (!phone) return undefined;
  const trimmed = phone.trim();
  if (!trimmed) return undefined;
  const digits = trimmed.replace(/[^\d+]/g, "");
  return digits || undefined;
}

export function normalizeEmail(email: string | undefined): string | undefined {
  if (!email) return undefined;
  const t = email.trim().toLowerCase();
  return t || undefined;
}

/**
 * Lead priority score for the morning queue.
 * +3 marketplace_message / phone_in / walk_in
 * +2 precise stock
 * +2 consent express
 * +1 follow-up due
 * +4 appointment today (livre)
 * +2 needs livre slot (hot lead without upcoming RDV)
 * +1 appointment_set
 * −2 consent unknown
 * −5 lost
 */
export type LivreScoreContext = {
  /** Lead has an appointment starting today (America/Toronto day). */
  hasAppointmentToday?: boolean;
  /** Lead already has a future scheduled/confirmed appointment. */
  hasUpcomingAppointment?: boolean;
};

export function scoreSalesLead(
  lead: SalesLead,
  nowIso: string,
  livre?: LivreScoreContext,
): number {
  let score = 0;
  if (
    lead.source === "marketplace_message" ||
    lead.source === "phone_in" ||
    lead.source === "walk_in"
  ) {
    score += 3;
  }
  if (lead.interestedStockIds.length > 0) score += 2;
  if (lead.consentBasis === "express") score += 2;
  if (lead.consentBasis === "unknown") score -= 2;
  if (lead.stage === "lost") score -= 5;
  if (lead.nextFollowUpAt && lead.nextFollowUpAt <= nowIso) score += 1;
  if (livre?.hasAppointmentToday) score += 4;
  if (
    !livre?.hasUpcomingAppointment &&
    (lead.stage === "new" ||
      lead.stage === "contacted" ||
      lead.stage === "qualified" ||
      lead.stage === "nurture")
  ) {
    score += 2;
  }
  if (lead.stage === "appointment_set") score += 1;
  return score;
}

export type LivreQueueHint = "today_appt" | "needs_slot" | "none";

export type MorningQueueItem = {
  lead: SalesLead;
  score: number;
  due: boolean;
  /** Adjoint ventes : priorité livre de RDV. */
  livreHint: LivreQueueHint;
};

export type BuildMorningQueueOptions = {
  /** leadId → livre context for scoring / hints. */
  livreByLeadId?: ReadonlyMap<string, LivreScoreContext>;
};

/**
 * Morning queue: follow-ups due first, then score desc, then stage urgency.
 * When livre context is provided, boosts essais du jour and leads without RDV.
 */
export function buildMorningQueue(
  leads: readonly SalesLead[],
  nowIso: string,
  options?: BuildMorningQueueOptions,
): MorningQueueItem[] {
  const active = leads.filter((l) => l.stage !== "sold" && l.stage !== "lost");
  const items: MorningQueueItem[] = active.map((lead) => {
    const livre = options?.livreByLeadId?.get(lead.leadId);
    let livreHint: LivreQueueHint = "none";
    if (livre?.hasAppointmentToday) livreHint = "today_appt";
    else if (
      !livre?.hasUpcomingAppointment &&
      (lead.stage === "new" ||
        lead.stage === "contacted" ||
        lead.stage === "qualified" ||
        lead.stage === "nurture")
    ) {
      livreHint = "needs_slot";
    }
    return {
      lead,
      score: scoreSalesLead(lead, nowIso, livre),
      due: Boolean(lead.nextFollowUpAt && lead.nextFollowUpAt <= nowIso),
      livreHint,
    };
  });
  items.sort((a, b) => {
    // Essais du jour before everything else
    const aToday = a.livreHint === "today_appt" ? 1 : 0;
    const bToday = b.livreHint === "today_appt" ? 1 : 0;
    if (aToday !== bToday) return bToday - aToday;
    if (a.due !== b.due) return a.due ? -1 : 1;
    if (b.score !== a.score) return b.score - a.score;
    const aNext = a.lead.nextFollowUpAt ?? "9999";
    const bNext = b.lead.nextFollowUpAt ?? "9999";
    return aNext.localeCompare(bNext);
  });
  return items;
}
