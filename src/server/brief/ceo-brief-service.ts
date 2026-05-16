import "server-only";

import type { CeoBriefSnapshot } from "@/features/hq/types";
import { listCalendarEvents } from "@/server/calendar/calendar-service";
import { createContactLeadRepository } from "@/server/contact/contact-lead-repository";
import { getDocumentBriefSnapshot } from "@/server/brief/document-index";

function formatTodayISO() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addDaysISO(dateISO: string, days: number) {
  const [year, month, day] = dateISO.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);

  const nextYear = date.getFullYear();
  const nextMonth = String(date.getMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getDate()).padStart(2, "0");

  return `${nextYear}-${nextMonth}-${nextDay}`;
}

function buildHeadline(input: {
  upcomingCount: number;
  newLeadCount: number;
  documentCount: number;
}) {
  const parts: string[] = [];

  if (input.upcomingCount > 0) {
    parts.push(
      input.upcomingCount === 1
        ? "1 rendez-vous à venir"
        : `${input.upcomingCount} rendez-vous à venir`,
    );
  }

  if (input.newLeadCount > 0) {
    parts.push(
      input.newLeadCount === 1
        ? "1 demande à traiter"
        : `${input.newLeadCount} demandes à traiter`,
    );
  }

  if (parts.length === 0 && input.documentCount > 0) {
    return `${input.documentCount} document${input.documentCount > 1 ? "s" : ""} dans ton coffre privé.`;
  }

  if (parts.length === 0) {
    return "HQ calme ce matin — bon moment pour clarifier la priorité du jour.";
  }

  return parts.join(" · ");
}

function buildFocusLine(input: {
  nextEventTitle?: string;
  nextEventWhen?: string;
  newestLeadName?: string;
}) {
  if (input.nextEventTitle && input.nextEventWhen) {
    return `Priorité immédiate: ${input.nextEventTitle} (${input.nextEventWhen}).`;
  }

  if (input.newestLeadName) {
    return `Priorité commerciale: revenir à ${input.newestLeadName} en premier.`;
  }

  return "Priorité du jour: choisir une seule action qui fait avancer Michael HQ ou un futur mode métier.";
}

export async function buildCeoBriefSnapshot(): Promise<CeoBriefSnapshot> {
  const todayISO = formatTodayISO();
  const horizonISO = addDaysISO(todayISO, 14);
  const contactRepository = createContactLeadRepository();

  const [events, newLeads, allRecentLeads, documents] = await Promise.all([
    listCalendarEvents({
      fromDateISO: todayISO,
      toDateISO: horizonISO,
      limit: 6,
    }),
    contactRepository.listRecent({ status: "new", limit: 5 }),
    contactRepository.listRecent({ limit: 5 }),
    getDocumentBriefSnapshot(3),
  ]);

  const agendaItems = events.map((event) => ({
    id: event.id,
    title: event.title,
    dateISO: event.dateISO,
    startTime: event.startTime,
    endTime: event.endTime,
    source: event.source,
  }));

  const leadItems = allRecentLeads.map((lead) => ({
    id: lead.id,
    name: lead.name,
    email: lead.email,
    company: lead.company,
    status: lead.status,
    createdAt: lead.createdAt,
  }));

  const nextEvent = agendaItems[0];
  const newestLead = leadItems[0];

  return {
    generatedAt: new Date().toISOString(),
    headline: buildHeadline({
      upcomingCount: agendaItems.length,
      newLeadCount: newLeads.length,
      documentCount: documents.totalCount,
    }),
    focusLine: buildFocusLine({
      nextEventTitle: nextEvent?.title,
      nextEventWhen: nextEvent ? `${nextEvent.dateISO} ${nextEvent.startTime}` : undefined,
      newestLeadName: newestLead?.name,
    }),
    agenda: {
      upcomingCount: agendaItems.length,
      items: agendaItems,
    },
    leads: {
      newCount: newLeads.length,
      items: leadItems,
    },
    documents: {
      totalCount: documents.totalCount,
      byHat: documents.byHat,
      recentFilenames: documents.recent.map((doc) => doc.filename),
    },
  };
}
