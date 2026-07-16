// src/server/sales/appointment-book-store.ts
//
// In-memory dealership appointment book ("livre"). Not durable.

import {
  validateSalesAppointment,
  type AppointmentPurpose,
  type AppointmentStatus,
  type SalesAppointment,
} from "@/features/sales/appointment-book";
import { getSalesLead, upsertSalesLead } from "@/server/sales/lead-bank-store";

type AppointmentGlobals = typeof globalThis & {
  __oriaAppointmentBookStore?: Map<string, Map<string, SalesAppointment>>;
};

function getRoot(): Map<string, Map<string, SalesAppointment>> {
  const globals = globalThis as AppointmentGlobals;
  if (!globals.__oriaAppointmentBookStore) {
    globals.__oriaAppointmentBookStore = new Map();
  }
  return globals.__oriaAppointmentBookStore;
}

function workspaceMap(workspaceId: string): Map<string, SalesAppointment> {
  const root = getRoot();
  let map = root.get(workspaceId);
  if (!map) {
    map = new Map();
    root.set(workspaceId, map);
  }
  return map;
}

export function listAppointments(workspaceId: string): SalesAppointment[] {
  return [...workspaceMap(workspaceId).values()].sort((a, b) =>
    a.startsAt.localeCompare(b.startsAt),
  );
}

export function getAppointment(
  workspaceId: string,
  appointmentId: string,
): SalesAppointment | null {
  return workspaceMap(workspaceId).get(appointmentId) ?? null;
}

export type ScheduleAppointmentInput = {
  workspaceId: string;
  leadId: string;
  startsAt: string;
  endsAt?: string;
  purpose?: AppointmentPurpose;
  vehicleHint?: string;
  stockId?: string;
  notes?: string;
  status?: AppointmentStatus;
  appointmentId?: string;
  createdByUserId: string;
  nowIso?: string;
  /** When true (default), bump lead stage to appointment_set if not sold/lost. */
  advanceLeadStage?: boolean;
};

export type ScheduleAppointmentResult =
  | { ok: true; appointment: SalesAppointment; leadStageUpdated: boolean }
  | { ok: false; errors: string[] };

const DEFAULT_DURATION_MS = 60 * 60 * 1000;

export function scheduleAppointment(input: ScheduleAppointmentInput): ScheduleAppointmentResult {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const lead = getSalesLead(input.workspaceId, input.leadId);
  if (!lead) {
    return { ok: false, errors: [`lead not found: ${input.leadId}`] };
  }
  if (lead.stage === "sold" || lead.stage === "lost") {
    return { ok: false, errors: [`cannot schedule appointment for stage=${lead.stage}`] };
  }

  const startMs = Date.parse(input.startsAt);
  if (Number.isNaN(startMs)) {
    return { ok: false, errors: ["startsAt must be a valid ISO timestamp"] };
  }
  const endsAt =
    input.endsAt ??
    new Date(startMs + DEFAULT_DURATION_MS).toISOString();

  const map = workspaceMap(input.workspaceId);
  const appointmentId =
    input.appointmentId ?? `appt_${input.leadId}_${nowIso.replace(/[:.]/g, "")}`;
  const prior = map.get(appointmentId);

  const appointment: SalesAppointment = {
    appointmentId,
    leadId: lead.leadId,
    fullName: lead.fullName,
    phone: lead.phone,
    startsAt: input.startsAt,
    endsAt,
    purpose: input.purpose ?? "test_drive",
    vehicleHint:
      input.vehicleHint?.trim() ||
      lead.interestedModels[0] ||
      undefined,
    stockId: input.stockId ?? lead.interestedStockIds[0],
    status: input.status ?? prior?.status ?? "scheduled",
    notes: (input.notes ?? prior?.notes ?? "").trim(),
    createdAt: prior?.createdAt ?? nowIso,
    updatedAt: nowIso,
    createdByUserId: prior?.createdByUserId ?? input.createdByUserId,
  };

  const validation = validateSalesAppointment(appointment);
  if (!validation.valid) {
    return { ok: false, errors: validation.errors };
  }

  map.set(appointment.appointmentId, appointment);

  let leadStageUpdated = false;
  if (input.advanceLeadStage !== false) {
    const nextStage =
      appointment.status === "completed" ? "appointment_done" : "appointment_set";
    if (lead.stage !== nextStage && lead.stage !== "negotiation") {
      const upsert = upsertSalesLead({
        workspaceId: input.workspaceId,
        nowIso,
        mergeOnDedupe: true,
        lead: {
          ...lead,
          stage: nextStage,
          nextFollowUpAt: appointment.startsAt,
          lastContactAt: nowIso,
          notes: lead.notes,
        },
      });
      leadStageUpdated = upsert.ok;
    }
  }

  return { ok: true, appointment, leadStageUpdated };
}

export function updateAppointmentStatus(input: {
  workspaceId: string;
  appointmentId: string;
  status: AppointmentStatus;
  nowIso?: string;
}): ScheduleAppointmentResult {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const existing = getAppointment(input.workspaceId, input.appointmentId);
  if (!existing) {
    return { ok: false, errors: [`appointment not found: ${input.appointmentId}`] };
  }
  return scheduleAppointment({
    workspaceId: input.workspaceId,
    leadId: existing.leadId,
    startsAt: existing.startsAt,
    endsAt: existing.endsAt,
    purpose: existing.purpose,
    vehicleHint: existing.vehicleHint,
    stockId: existing.stockId,
    notes: existing.notes,
    status: input.status,
    appointmentId: existing.appointmentId,
    createdByUserId: existing.createdByUserId,
    nowIso,
    advanceLeadStage: input.status === "completed" || input.status === "confirmed",
  });
}

export function clearAppointmentBookStore(): void {
  getRoot().clear();
}
