// src/features/sales/appointment-book.ts
//
// Dealership appointment book ("livre de RDV") — pure contracts.
// Prepare-only: Oria schedules in-memory and drafts SMS; human confirms/sends.

import type { SalesLead } from "./sales-lead";

export type AppointmentPurpose =
  | "test_drive"
  | "delivery"
  | "trade_appraisal"
  | "finance"
  | "showroom"
  | "other";

export const APPOINTMENT_PURPOSES: readonly AppointmentPurpose[] = [
  "test_drive",
  "delivery",
  "trade_appraisal",
  "finance",
  "showroom",
  "other",
];

export type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "completed"
  | "no_show"
  | "cancelled";

export const APPOINTMENT_STATUSES: readonly AppointmentStatus[] = [
  "scheduled",
  "confirmed",
  "completed",
  "no_show",
  "cancelled",
];

export type SalesAppointment = {
  appointmentId: string;
  leadId: string;
  fullName: string;
  phone?: string;
  startsAt: string;
  endsAt: string;
  purpose: AppointmentPurpose;
  vehicleHint?: string;
  stockId?: string;
  status: AppointmentStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string;
};

export type AppointmentValidation = {
  valid: boolean;
  errors: string[];
};

const PURPOSE_LABEL_FR: Record<AppointmentPurpose, string> = {
  test_drive: "essai routier",
  delivery: "livraison",
  trade_appraisal: "évaluation d'échange",
  finance: "financement",
  showroom: "visite en salle",
  other: "rendez-vous",
};

export function purposeLabelFr(purpose: AppointmentPurpose): string {
  return PURPOSE_LABEL_FR[purpose];
}

export function validateSalesAppointment(input: unknown): AppointmentValidation {
  const errors: string[] = [];
  if (!input || typeof input !== "object") {
    return { valid: false, errors: ["appointment must be an object"] };
  }
  const a = input as Record<string, unknown>;
  for (const field of [
    "appointmentId",
    "leadId",
    "fullName",
    "startsAt",
    "endsAt",
    "createdAt",
    "updatedAt",
    "createdByUserId",
  ] as const) {
    if (typeof a[field] !== "string" || !(a[field] as string).trim()) {
      errors.push(`${field} must be non-empty`);
    }
  }
  if (
    typeof a.purpose !== "string" ||
    !APPOINTMENT_PURPOSES.includes(a.purpose as AppointmentPurpose)
  ) {
    errors.push(`purpose must be one of: ${APPOINTMENT_PURPOSES.join(", ")}`);
  }
  if (
    typeof a.status !== "string" ||
    !APPOINTMENT_STATUSES.includes(a.status as AppointmentStatus)
  ) {
    errors.push(`status must be one of: ${APPOINTMENT_STATUSES.join(", ")}`);
  }
  if (typeof a.notes !== "string") {
    errors.push("notes must be a string");
  }
  if (typeof a.startsAt === "string" && typeof a.endsAt === "string") {
    const start = Date.parse(a.startsAt);
    const end = Date.parse(a.endsAt);
    if (Number.isNaN(start) || Number.isNaN(end)) {
      errors.push("startsAt and endsAt must be valid ISO timestamps");
    } else if (end <= start) {
      errors.push("endsAt must be after startsAt");
    }
  }
  return { valid: errors.length === 0, errors };
}

/** Day key in America/Toronto for livre grouping (YYYY-MM-DD). */
export function appointmentDayKey(iso: string, timeZone = "America/Toronto"): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export function formatAppointmentSlotFr(iso: string, timeZone = "America/Toronto"): string {
  try {
    return new Intl.DateTimeFormat("fr-CA", {
      timeZone,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export type LivreDay = {
  dayKey: string;
  appointments: SalesAppointment[];
};

/**
 * Build the appointment book for a day window.
 * Default: today + next 6 days (America/Toronto).
 */
export function buildLivre(
  appointments: readonly SalesAppointment[],
  nowIso: string,
  options?: { days?: number; timeZone?: string },
): LivreDay[] {
  const days = options?.days ?? 7;
  const timeZone = options?.timeZone ?? "America/Toronto";
  const todayKey = appointmentDayKey(nowIso, timeZone);
  const dayKeys: string[] = [];
  const base = new Date(nowIso);
  for (let i = 0; i < days; i++) {
    const d = new Date(base.getTime() + i * 86_400_000);
    dayKeys.push(appointmentDayKey(d.toISOString(), timeZone));
  }
  // Ensure today is first even if clock skew
  if (!dayKeys.includes(todayKey)) {
    dayKeys.unshift(todayKey);
  }

  const active = appointments.filter(
    (a) => a.status !== "cancelled" && a.status !== "no_show",
  );
  return dayKeys.map((dayKey) => ({
    dayKey,
    appointments: active
      .filter((a) => appointmentDayKey(a.startsAt, timeZone) === dayKey)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
  }));
}

export type AppointmentSmsKind = "invite" | "confirm" | "reminder";

/**
 * Prepare-only SMS to fill / confirm the livre. Never sends.
 */
export function prepareAppointmentSms(input: {
  lead: SalesLead;
  appointment: SalesAppointment;
  kind: AppointmentSmsKind;
}): { ok: true; body: string; to: string } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const to = input.lead.phone?.trim() || input.appointment.phone?.trim();
  if (!to) errors.push("phone required for appointment SMS");
  if (input.lead.consentBasis === "unknown") {
    errors.push("consentBasis unknown — set express or implied_verified before outreach");
  }
  if (input.lead.consentBasis === "manual_review_required") {
    errors.push("consentBasis manual_review_required — resolve consent before outreach");
  }
  if (input.lead.stage === "sold" || input.lead.stage === "lost") {
    errors.push(`cannot SMS appointment for stage=${input.lead.stage}`);
  }
  if (errors.length > 0 || !to) return { ok: false, errors };

  const first = input.lead.fullName.trim().split(/\s+/)[0] ?? input.lead.fullName;
  const slot = formatAppointmentSlotFr(input.appointment.startsAt);
  const purpose = purposeLabelFr(input.appointment.purpose);
  const vehicle =
    input.appointment.vehicleHint?.trim() ||
    input.lead.interestedModels[0] ||
    "le véhicule";

  let body: string;
  if (input.kind === "invite") {
    body =
      `Bonjour ${first}, j'ai une place libre pour un ${purpose} ` +
      `(${vehicle}) le ${slot} chez Buckingham Chevrolet Buick GMC. ` +
      `Ça vous convient ? Répondez OUI et je réserve votre créneau.`;
  } else if (input.kind === "confirm") {
    body =
      `Parfait ${first} — c'est confirmé : ${purpose} le ${slot} ` +
      `à Buckingham GM (Gatineau). Apportez permis + pièce d'identité` +
      (input.appointment.purpose === "test_drive" ? " pour l'essai." : ".") +
      ` À bientôt !`;
  } else {
    body =
      `Rappel ${first} : on se voit demain / bientôt pour votre ${purpose} ` +
      `le ${slot} chez Buckingham GM. Besoin de déplacer ? Répondez-moi.`;
  }

  return { ok: true, body, to };
}
