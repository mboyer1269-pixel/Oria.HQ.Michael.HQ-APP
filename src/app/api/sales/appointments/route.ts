import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { requireOwnerApiSession } from "@/server/auth/owner";
import {
  APPOINTMENT_PURPOSES,
  APPOINTMENT_STATUSES,
  buildLivre,
  prepareAppointmentSms,
} from "@/features/sales/appointment-book";
import { getSalesLead } from "@/server/sales/lead-bank-store";
import {
  listAppointments,
  scheduleAppointment,
  updateAppointmentStatus,
} from "@/server/sales/appointment-book-store";

// GET  /api/sales/appointments — livre de RDV (7 jours)
// POST /api/sales/appointments — schedule | update_status | prepare_sms

const scheduleSchema = z.object({
  action: z.literal("schedule").optional(),
  leadId: z.string().min(1),
  startsAt: z.string().min(1),
  endsAt: z.string().optional(),
  purpose: z.enum(APPOINTMENT_PURPOSES as unknown as [string, ...string[]]).optional(),
  vehicleHint: z.string().optional(),
  stockId: z.string().optional(),
  notes: z.string().optional(),
});

const statusSchema = z.object({
  action: z.literal("update_status"),
  appointmentId: z.string().min(1),
  status: z.enum(APPOINTMENT_STATUSES as unknown as [string, ...string[]]),
});

const smsSchema = z.object({
  action: z.literal("prepare_sms"),
  appointmentId: z.string().min(1),
  kind: z.enum(["invite", "confirm", "reminder"]).optional(),
});

export async function GET() {
  const authError = await requireOwnerApiSession();
  if (authError) return authError;

  const ctx = getActiveWorkspaceContext();
  const nowIso = new Date().toISOString();
  const appointments = listAppointments(ctx.workspace.id);
  const livre = buildLivre(appointments, nowIso);

  return NextResponse.json({
    appointments,
    livre,
    count: appointments.length,
    persistence: "in_memory",
    note: "Livre de RDV process-local. Prepare SMS — Oria n'envoie pas.",
  });
}

export async function POST(request: Request) {
  const authError = await requireOwnerApiSession();
  if (authError) return authError;

  const ctx = getActiveWorkspaceContext();
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const action = (body as { action?: string }).action ?? "schedule";
  const nowIso = new Date().toISOString();

  if (action === "update_status") {
    const parsed = statusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body.", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const result = updateAppointmentStatus({
      workspaceId: ctx.workspace.id,
      appointmentId: parsed.data.appointmentId,
      status: parsed.data.status as (typeof APPOINTMENT_STATUSES)[number],
      nowIso,
    });
    if (!result.ok) {
      return NextResponse.json({ error: "Update failed.", errors: result.errors }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      appointment: result.appointment,
      leadStageUpdated: result.leadStageUpdated,
      persistence: "in_memory",
    });
  }

  if (action === "prepare_sms") {
    const parsed = smsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body.", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const appointments = listAppointments(ctx.workspace.id);
    const appointment = appointments.find((a) => a.appointmentId === parsed.data.appointmentId);
    if (!appointment) {
      return NextResponse.json({ error: "Appointment not found." }, { status: 404 });
    }
    const lead = getSalesLead(ctx.workspace.id, appointment.leadId);
    if (!lead) {
      return NextResponse.json({ error: "Lead not found." }, { status: 404 });
    }
    const sms = prepareAppointmentSms({
      lead,
      appointment,
      kind: parsed.data.kind ?? "confirm",
    });
    if (!sms.ok) {
      return NextResponse.json({ error: "Prepare SMS failed.", errors: sms.errors }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      draft: {
        to: sms.to,
        body: sms.body,
        channel: "sms",
        requiresManualSend: true,
        noExecutionAuthorized: true,
      },
      sendAuthorized: false,
      note: "Prepare-only. Copy into Messages — Oria does not send.",
    });
  }

  const parsed = scheduleSchema.safeParse({ ...body, action: "schedule" });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = scheduleAppointment({
    workspaceId: ctx.workspace.id,
    leadId: parsed.data.leadId,
    startsAt: parsed.data.startsAt,
    endsAt: parsed.data.endsAt,
    purpose: parsed.data.purpose as (typeof APPOINTMENT_PURPOSES)[number] | undefined,
    vehicleHint: parsed.data.vehicleHint,
    stockId: parsed.data.stockId,
    notes: parsed.data.notes,
    createdByUserId: ctx.userId,
    nowIso,
  });

  if (!result.ok) {
    return NextResponse.json({ error: "Schedule failed.", errors: result.errors }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    appointment: result.appointment,
    leadStageUpdated: result.leadStageUpdated,
    persistence: "in_memory",
    note: "Créneau ajouté au livre. Prépare un SMS confirm via action prepare_sms.",
  });
}
