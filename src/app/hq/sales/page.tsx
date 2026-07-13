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

  return (
    <CockpitShell active="sales" crumb="Sales Desk">
      <HqPageHeader
        backHref={"/hq" as Route}
        eyebrow="Sales Desk — Buckingham GM"
        icon={Car}
        tone="amber"
        title="Publication. Marketing. Leads. Ventes."
        description={
          <>
            Agent Publication (Marketplace prepare → publier → capturer prospects) · Directeur Marketing
            (pubs, Reels, YouTube) · inventaire · formation modèles · file du matin.
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

      <HqWidget title="Poste de vente" eyebrow="Agents prepare → tu publies et closes" icon={Car} tone="amber">
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
