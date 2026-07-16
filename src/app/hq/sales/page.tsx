import type { Route } from "next";
import { Car } from "lucide-react";
import { requireOwnerAccess } from "@/server/auth/owner";
import { OwnerAccessDenied } from "@/features/hq/components/owner-access-denied";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { CockpitShell } from "@/features/cockpit/components/cockpit-shell";
import {
  HqMetric,
  HqPageHeader,
  HqSummaryRail,
  HqWidget,
} from "@/features/hq/components/hq-widget-system";
import { SalesDeskClient } from "@/features/sales/components/sales-desk-client";
import { buildMorningQueue } from "@/features/sales/sales-lead";
import { buildLivre, appointmentDayKey } from "@/features/sales/appointment-book";
import { buildLivreScoreContextMap } from "@/features/sales/livre-queue-context";
import { buildSalesContentCalendar } from "@/features/sales/sales-content-calendar";
import { getInventorySnapshot } from "@/server/inventory/inventory-store";
import { listSalesLeads } from "@/server/sales/lead-bank-store";
import { listAppointments } from "@/server/sales/appointment-book-store";
import { listMarketplaceListings } from "@/server/marketplace-listings/listing-store";

export const dynamic = "force-dynamic";

// /hq/sales — Sales Desk (Buckingham operator morning loop)
// Livre RDV → marketing calendar → inventory → Marketplace → warm follow-ups.
// Prepare-only: human publishes and sends.

export default async function SalesDeskPage() {
  const access = await requireOwnerAccess("/hq/sales");
  if (access.status === "forbidden") {
    return <OwnerAccessDenied email={access.user.email} />;
  }

  const { activeWorkspace } = getActiveWorkspaceContext();
  const nowIso = new Date().toISOString();
  const leads = listSalesLeads(activeWorkspace.id);
  const appointments = listAppointments(activeWorkspace.id);
  const livreByLeadId = buildLivreScoreContextMap(appointments, nowIso);
  const queue = buildMorningQueue(leads, nowIso, { livreByLeadId });
  const snapshot = getInventorySnapshot(activeWorkspace.id);
  const listings = listMarketplaceListings(activeWorkspace.id);
  const livre = buildLivre(appointments, nowIso);
  const todayKey = appointmentDayKey(nowIso);
  const weekAppointmentCount = appointments.filter(
    (a) =>
      a.status !== "cancelled" &&
      a.status !== "no_show" &&
      appointmentDayKey(a.startsAt) >= todayKey,
  ).length;
  const contentCalendar = buildSalesContentCalendar({
    workspaceId: activeWorkspace.id,
    vehicles: snapshot?.vehicles ?? [],
    nowIso,
    livreTargetSlots: Math.max(5, weekAppointmentCount + 2),
  });
  const dueCount = queue.filter((q) => q.due).length;
  const activeLeadCount = leads.filter((l) => l.stage !== "sold" && l.stage !== "lost").length;
  const needsSlotCount = queue.filter((q) => q.livreHint === "needs_slot").length;

  return (
    <CockpitShell active="sales" crumb="Sales Desk">
      <HqPageHeader
        backHref={"/hq" as Route}
        eyebrow="Sales Desk — Buckingham GM"
        icon={Car}
        tone="amber"
        title="Adjoint ventes — Livre, marketing, inventaire."
        description={
          <>
            Remplis ton livre de RDV → calendrier 7 jours → packs marketing → sync inventaire →
            fiches Marketplace → relances warm. Prepare-only : toi tu publies et tu envoies.
          </>
        }
      />

      <HqSummaryRail>
        <HqMetric label="Relances dues" value={dueCount} tone={dueCount > 0 ? "amber" : "neutral"} />
        <HqMetric
          label="Créneaux livre"
          value={weekAppointmentCount}
          tone={weekAppointmentCount > 0 ? "amber" : "neutral"}
        />
        <HqMetric
          label="Sans RDV"
          value={needsSlotCount}
          tone={needsSlotCount > 0 ? "sky" : "neutral"}
        />
        <HqMetric
          label="Véhicules"
          value={snapshot?.vehicles.length ?? 0}
          tone={(snapshot?.vehicles.length ?? 0) > 0 ? "emerald" : "neutral"}
        />
      </HqSummaryRail>

      <HqWidget title="Poste de vente" eyebrow="Prepare → action humaine" icon={Car} tone="amber">
        <SalesDeskClient
          queue={queue}
          vehicles={snapshot?.vehicles ?? []}
          listings={listings}
          livre={livre}
          weekAppointmentCount={weekAppointmentCount}
          contentCalendar={contentCalendar}
          dueCount={dueCount}
          activeLeadCount={activeLeadCount}
        />
      </HqWidget>
    </CockpitShell>
  );
}
