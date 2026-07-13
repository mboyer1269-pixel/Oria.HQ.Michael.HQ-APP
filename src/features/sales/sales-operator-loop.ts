// Buckingham operator loop — pure workflow state from inventory + listings + leads.
// Prepare-only: human publishes and sends on each external channel.

import type { InventoryDebrief } from "@/features/inventory/inventory-debrief";
import type { VehicleStock } from "@/features/inventory/vehicle-stock";
import type { MarketplaceListingPacket } from "@/features/marketplace-listings/listing-packet";
import type { SalesLead } from "@/features/sales/sales-lead";
import { buildPublishCandidates } from "@/features/sales/publish-agent";

export type OperatorLoopStep =
  | "sync_inventory"
  | "prepare_listing"
  | "publish_manual"
  | "capture_lead"
  | "follow_up"
  | "close_outcome";

export const OPERATOR_LOOP_STEPS: readonly {
  id: OperatorLoopStep;
  labelFr: string;
  detailFr: string;
}[] = [
  {
    id: "sync_inventory",
    labelFr: "1. Sync inventaire",
    detailFr: "Rafraîchir le stock depuis buckinghamgm.com",
  },
  {
    id: "prepare_listing",
    labelFr: "2. Préparer fiche",
    detailFr: "Titre, prix, description, photos — Oria prépare",
  },
  {
    id: "publish_manual",
    labelFr: "3. Publier (toi)",
    detailFr: "Copier bundle → Facebook Marketplace → marquer publié",
  },
  {
    id: "capture_lead",
    labelFr: "4. Capturer prospect",
    detailFr: "Chaque message inbound → banque leads",
  },
  {
    id: "follow_up",
    labelFr: "5. Relancer",
    detailFr: "SMS préparé — tu envoies depuis ton téléphone",
  },
  {
    id: "close_outcome",
    labelFr: "6. Closer",
    detailFr: "Sold avec stock # ou Lost avec raison",
  },
];

export type OperatorLoopSnapshot = {
  vehicleCount: number;
  preparedCount: number;
  readyToPublishCount: number;
  publishedCount: number;
  activeLeadCount: number;
  dueFollowUpCount: number;
  topPublishStockIds: string[];
  nextActionsFr: string[];
};

export function buildOperatorLoopSnapshot(input: {
  vehicles: VehicleStock[];
  listings: MarketplaceListingPacket[];
  leads: SalesLead[];
  debrief: InventoryDebrief | null;
  nowIso: string;
}): OperatorLoopSnapshot {
  const prepared = input.listings.filter((l) => l.status !== "superseded");
  const readyToPublish = prepared.filter(
    (l) => l.status === "ready_for_manual_publish" || l.status === "prepared",
  );
  const published = prepared.filter((l) => l.status === "published_manual");
  const activeLeads = input.leads.filter((l) => l.stage !== "sold" && l.stage !== "lost");
  const dueFollowUpCount = activeLeads.filter(
    (l) => l.nextFollowUpAt && l.nextFollowUpAt <= input.nowIso,
  ).length;

  const candidates = buildPublishCandidates({
    vehicles: input.vehicles,
    highlights: input.debrief?.highlights,
    listings: input.listings,
    limit: 3,
  });

  const nextActionsFr: string[] = [];
  if (input.vehicles.length === 0) {
    nextActionsFr.push("Sync le site web pour charger l'inventaire.");
  }
  if (readyToPublish.length > 0) {
    nextActionsFr.push(
      `${readyToPublish.length} fiche(s) prête(s) — publie sur Marketplace puis marque publié.`,
    );
  } else if (candidates.length > 0) {
    nextActionsFr.push(`Prépare les priorités : ${candidates.map((c) => c.stockId).join(", ")}.`);
  }
  if (published.length > 0 && activeLeads.length === 0) {
    nextActionsFr.push("Capture chaque message Marketplace comme lead dès qu'il arrive.");
  }
  if (dueFollowUpCount > 0) {
    nextActionsFr.push(`${dueFollowUpCount} relance(s) due(s) — file du matin.`);
  }
  if (nextActionsFr.length === 0) {
    nextActionsFr.push("Boucle à jour — maintiens 3–5 annonces live et relance sous 15 min.");
  }

  return {
    vehicleCount: input.vehicles.length,
    preparedCount: prepared.length,
    readyToPublishCount: readyToPublish.length,
    publishedCount: published.length,
    activeLeadCount: activeLeads.length,
    dueFollowUpCount,
    topPublishStockIds: candidates.map((c) => c.stockId),
    nextActionsFr,
  };
}

/** Latest non-superseded packet per stockId. */
export function latestListingByStock(
  listings: readonly MarketplaceListingPacket[],
): Map<string, MarketplaceListingPacket> {
  const map = new Map<string, MarketplaceListingPacket>();
  const sorted = [...listings].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  for (const listing of sorted) {
    if (listing.status === "superseded") continue;
    if (!map.has(listing.stockId)) map.set(listing.stockId, listing);
  }
  return map;
}
