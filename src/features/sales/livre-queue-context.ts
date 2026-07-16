// src/features/sales/livre-queue-context.ts
//
// Pure helper: map appointments → morning-queue livre scoring context.

import {
  appointmentDayKey,
  type SalesAppointment,
} from "@/features/sales/appointment-book";
import type { LivreScoreContext } from "@/features/sales/sales-lead";

/**
 * Build per-lead livre context for morning-queue scoring.
 */
export function buildLivreScoreContextMap(
  appointments: readonly SalesAppointment[],
  nowIso: string,
  timeZone = "America/Toronto",
): Map<string, LivreScoreContext> {
  const todayKey = appointmentDayKey(nowIso, timeZone);
  const map = new Map<string, LivreScoreContext>();

  for (const a of appointments) {
    if (a.status === "cancelled" || a.status === "no_show") continue;
    const dayKey = appointmentDayKey(a.startsAt, timeZone);
    const prior = map.get(a.leadId) ?? {};
    const isToday = dayKey === todayKey;
    const isUpcoming =
      a.status === "scheduled" || a.status === "confirmed"
        ? a.startsAt >= nowIso || isToday
        : false;
    map.set(a.leadId, {
      hasAppointmentToday: Boolean(prior.hasAppointmentToday || isToday),
      hasUpcomingAppointment: Boolean(prior.hasUpcomingAppointment || isUpcoming),
    });
  }

  return map;
}
