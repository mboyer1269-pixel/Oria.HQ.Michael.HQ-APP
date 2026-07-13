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
import { buildLeadProspectPlaybook } from "@/features/sales/lead-prospect-playbook";
import { listPublishingBundles } from "@/server/sales/publishing-queue-store";

export const dynamic = "force-dynamic";

// /hq/sales — Sales Desk (Buckingham operator morning loop)
// Inventory sync → Marketplace fiche prepare → lead bank → SMS drafts.
// Prepare-only: human publishes and sends.

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
  const dueCount = queue.filter((q) => q.due).length;
  const activeLeadCount = leads.filter((l) => l.stage !== "sold" && l.stage !== "lost").length;
  const publishingBundles = listPublishingBundles(activeWorkspace.id);
  const prospectPlaybook = buildLeadProspectPlaybook({
    vehicles: snapshot?.vehicles ?? [],
    leads,
    publishedStockIds: publishingBundles
      .filter((b) => b.status === "published_manual")
      .map((b) => b.stockId),
    nowIso,
  });

  return (
    <CockpitShell active="sales" crumb="Sales Desk">
      <HqPageHeader
        backHref={"/hq" as Route}
        eyebrow="Sales Desk — Buckingham GM"
        icon={Car}
        tone="amber"
        title="Agent Publication. Directeur Marketing. Leads."
        description={
          <>
            Agent Publication prépare Marketplace + Facebook en un clic. Directeur Marketing génère
            posts, Reels, YouTube Shorts et pubs Meta. Playbook prospects pour vendre plus.
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
      </HqSummaryRail>

      <HqWidget title="Poste de vente" eyebrow="Agents → approuve → publie" icon={Car} tone="amber">
        <SalesDeskClient
          queue={queue}
          vehicles={snapshot?.vehicles ?? []}
          listings={listings}
          dueCount={dueCount}
          activeLeadCount={activeLeadCount}
          prospectPlaybook={prospectPlaybook}
          initialPublishingBundles={publishingBundles}
        />
      </HqWidget>
    </CockpitShell>
  );
}
