import { NextResponse } from "next/server";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { requireOwnerApiSession } from "@/server/auth/owner";
import { buildSalesContentCalendar } from "@/features/sales/sales-content-calendar";
import { getInventorySnapshot } from "@/server/inventory/inventory-store";
import { listAppointments } from "@/server/sales/appointment-book-store";
import { appointmentDayKey } from "@/features/sales/appointment-book";

// GET /api/sales/marketing/calendar — 7-day prepare-only content plan

export async function GET() {
  const authError = await requireOwnerApiSession();
  if (authError) return authError;

  const ctx = getActiveWorkspaceContext();
  const nowIso = new Date().toISOString();
  const snapshot = getInventorySnapshot(ctx.workspace.id);
  const appointments = listAppointments(ctx.workspace.id);
  const todayKey = appointmentDayKey(nowIso);
  const weekSlots = appointments.filter(
    (a) =>
      a.status !== "cancelled" &&
      a.status !== "no_show" &&
      appointmentDayKey(a.startsAt) >= todayKey,
  ).length;
  const livreTargetSlots = Math.max(5, weekSlots + 2);

  const calendar = buildSalesContentCalendar({
    workspaceId: ctx.workspace.id,
    vehicles: snapshot?.vehicles ?? [],
    nowIso,
    livreTargetSlots,
  });

  return NextResponse.json({
    ok: true,
    calendar,
    weekAppointmentCount: weekSlots,
    publishAuthorized: false,
    note: "Prepare-only 7-day plan. Human publishes and sends.",
  });
}
