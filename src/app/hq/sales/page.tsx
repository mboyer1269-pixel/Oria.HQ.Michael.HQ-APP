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
import { getInventorySnapshot } from "@/server/inventory/inventory-store";
import { listSalesLeads } from "@/server/sales/lead-bank-store";
import { listMarketplaceListings } from "@/server/marketplace-listings/listing-store";
import { listSocialPublications } from "@/server/marketing/publication-store";

export const dynamic = "force-dynamic";

// /hq/sales — Sales Desk (Buckingham operator morning loop)
// Inventory sync → publisher agent (FB Page auto via Graph API + Marketplace
// assisted queue) → marketing director (content packs + calendar) → lead bank
// → SMS drafts. Marketplace final click and sends stay human.

export default async function SalesDeskPage() {
  const access = await requireOwnerAccess("/hq/sales");
  if (access.status === "forbidden") {
    return <OwnerAccessDenied email={access.user.email} />;
  }

  const { activeWorkspace } = getActiveWorkspaceContext();
  const nowIso = new Date().toISOString();
  const leads = listSalesLeads(activeWorkspace.id);
  const queue = buildMorningQueue(leads, nowIso);
  const snapshot = getInventorySnapshot(activeWorkspace.id);
  const listings = listMarketplaceListings(activeWorkspace.id);
  const publications = listSocialPublications(activeWorkspace.id);
  const dueCount = queue.filter((q) => q.due).length;
  const activeLeadCount = leads.filter((l) => l.stage !== "sold" && l.stage !== "lost").length;

  return (
    <CockpitShell active="sales" crumb="Sales Desk">
      <HqPageHeader
        backHref={"/hq" as Route}
        eyebrow="Sales Desk — Buckingham GM"
        icon={Car}
        tone="amber"
        title="Inventaire. Publication. Marketing. Leads."
        description={
          <>
            Sync le site → l&apos;agent publication pousse tes véhicules (Page FB auto + file
            Marketplace) → le directeur marketing génère posts, pubs et scripts vidéo → chaque
            réponse devient un lead. Activix arrive lundi.
          </>
        }
      />

      <HqSummaryRail>
        <HqMetric label="Relances dues" value={dueCount} tone={dueCount > 0 ? "amber" : "neutral"} />
        <HqMetric label="Leads actifs" value={activeLeadCount} tone="sky" />
        <HqMetric
          label="Véhicules en mémoire"
          value={snapshot?.vehicles.length ?? 0}
          tone={(snapshot?.vehicles.length ?? 0) > 0 ? "emerald" : "neutral"}
        />
        <HqMetric
          label="Fiches préparées"
          value={listings.length}
          tone={listings.length > 0 ? "violet" : "neutral"}
        />
        <HqMetric
          label="Publications agent"
          value={publications.length}
          tone={publications.length > 0 ? "emerald" : "neutral"}
        />
      </HqSummaryRail>

      <HqWidget title="Poste de vente" eyebrow="Prepare → action humaine" icon={Car} tone="amber">
        <SalesDeskClient
          queue={queue}
          vehicles={snapshot?.vehicles ?? []}
          listings={listings}
          dueCount={dueCount}
          activeLeadCount={activeLeadCount}
        />
      </HqWidget>
    </CockpitShell>
  );
}
