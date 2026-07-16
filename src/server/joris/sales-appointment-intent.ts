// Joris intent: dealership appointment book ("livre de RDV") — prepare-only.

import {
  buildLivre,
  formatAppointmentSlotFr,
  purposeLabelFr,
} from "@/features/sales/appointment-book";
import { listAppointments, scheduleAppointment } from "@/server/sales/appointment-book-store";
import { listSalesLeads } from "@/server/sales/lead-bank-store";
import { extractStockRefFromMessage } from "./marketplace-listing-intent";

const LEAD_ID_RE = /\b(lead_[a-z0-9_]+)\b/i;
const ISO_OR_LOCAL_RE =
  /\b(20\d{2}-\d{2}-\d{2})(?:[tT\s](\d{1,2}):(\d{2}))?\b/;

function extractLeadId(message: string): string | null {
  const m = message.match(LEAD_ID_RE);
  return m?.[1] ?? null;
}

function extractStartsAt(message: string): string | null {
  const m = message.match(ISO_OR_LOCAL_RE);
  if (!m) return null;
  const date = m[1]!;
  const hour = m[2] ? m[2].padStart(2, "0") : "14";
  const minute = m[3] ?? "00";
  // Interpret as America/Toronto wall time approx via offset-less local → UTC ISO
  // For prepare-only chat we accept the composed ISO; UI uses datetime-local.
  return `${date}T${hour}:${minute}:00.000Z`;
}

function findLeadByNameHint(workspaceId: string, message: string) {
  const leads = listSalesLeads(workspaceId).filter(
    (l) => l.stage !== "sold" && l.stage !== "lost",
  );
  const lower = message.toLowerCase();
  for (const lead of leads) {
    const first = lead.fullName.trim().split(/\s+/)[0]?.toLowerCase();
    if (first && first.length >= 3 && lower.includes(first)) {
      return lead;
    }
  }
  return null;
}

export async function handleSalesAppointmentLivreIntent(input: {
  workspaceId: string;
  userId: string;
  message: string;
}): Promise<{ summary: string }> {
  const nowIso = new Date().toISOString();
  const appointments = listAppointments(input.workspaceId);
  const livre = buildLivre(appointments, nowIso);
  const today = livre[0];

  const leadId = extractLeadId(input.message);
  const startsAt = extractStartsAt(input.message);
  const leadHint = leadId
    ? listSalesLeads(input.workspaceId).find((l) => l.leadId === leadId)
    : findLeadByNameHint(input.workspaceId, input.message);

  if (leadHint && startsAt) {
    const stockRef = extractStockRefFromMessage(input.message);
    const result = scheduleAppointment({
      workspaceId: input.workspaceId,
      leadId: leadHint.leadId,
      startsAt,
      purpose: /essai/i.test(input.message) ? "test_drive" : "showroom",
      stockId: stockRef ?? leadHint.interestedStockIds[0],
      vehicleHint: leadHint.interestedModels[0],
      createdByUserId: input.userId,
      nowIso,
    });
    if (!result.ok) {
      return {
        summary:
          `Je n'ai pas pu ajouter le créneau au livre : ${result.errors.join("; ")}. ` +
          `Vérifie le lead et le consentement, puis réessaie depuis le Sales Desk.`,
      };
    }
    const slot = formatAppointmentSlotFr(result.appointment.startsAt);
    return {
      summary:
        `Livre mis à jour — ${result.appointment.fullName} · ` +
        `${purposeLabelFr(result.appointment.purpose)} · ${slot}. ` +
        `Stage lead → appointment_set. ` +
        `Prepare-only : ouvre Sales Desk → Livre pour copier le SMS de confirmation. ` +
        `Oria n'envoie rien.`,
    };
  }

  const lines: string[] = [];
  lines.push("## Livre de RDV (7 jours) — Buckingham GM");
  lines.push("");
  if (!today || today.appointments.length === 0) {
    lines.push("Aujourd'hui : aucun créneau. Objectif adjoint : remplir le livre.");
  } else {
    lines.push(`Aujourd'hui (${today.dayKey}) — ${today.appointments.length} créneau(x) :`);
    for (const a of today.appointments) {
      lines.push(
        `• ${formatAppointmentSlotFr(a.startsAt)} — ${a.fullName} · ${purposeLabelFr(a.purpose)}` +
          (a.vehicleHint ? ` · ${a.vehicleHint}` : ""),
      );
    }
  }
  lines.push("");
  const upcoming = livre.slice(1).flatMap((d) => d.appointments).slice(0, 5);
  if (upcoming.length > 0) {
    lines.push("Prochains :");
    for (const a of upcoming) {
      lines.push(
        `• ${formatAppointmentSlotFr(a.startsAt)} — ${a.fullName} · ${purposeLabelFr(a.purpose)}`,
      );
    }
    lines.push("");
  }
  lines.push(
    "Pour ajouter : « réserve un essai pour lead_… le 2026-07-17 14:00 » " +
      "ou utilise le Sales Desk → Livre. SMS = prepare-only (toi tu envoies).",
  );
  return { summary: lines.join("\n") };
}
