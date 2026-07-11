// src/server/joris/marketplace-listing-intent.ts
//
// Parse stock refs from chat and prepare Marketplace packets (no publish).

import { formatMarketplaceUploadChecklist } from "@/features/marketplace-listings/listing-packet";
import { getInventorySnapshot } from "@/server/inventory/inventory-store";
import { syncPublicInventory } from "@/server/inventory/public-inventory-sync";
import { prepareMarketplaceListing } from "@/server/marketplace-listings/prepare-listing";

const STOCK_RE = /\b(\d{4,6}-(?:NEUF|DEMO|OCC|CPO|[A-Z]{2,8})|\d{5,6})\b/i;
const VIN_RE = /\b([A-HJ-NPR-Z0-9]{17})\b/i;

export function extractStockRefFromMessage(message: string): string | null {
  const vin = message.match(VIN_RE)?.[1];
  if (vin) return vin.toUpperCase();
  const stock = message.match(STOCK_RE)?.[1];
  return stock ? stock.toUpperCase() : null;
}

export function wantsInventorySync(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("sync inventaire") ||
    lower.includes("synchronise inventaire") ||
    lower.includes("synchroniser inventaire") ||
    lower.includes("rafraîchir inventaire") ||
    lower.includes("rafraichir inventaire") ||
    lower.includes("update inventaire") ||
    (lower.includes("inventaire") && (lower.includes("site") || lower.includes("buckingham")))
  );
}

export type MarketplaceListingIntentResult = {
  summary: string;
  stockRef?: string;
  packetId?: string;
  synced?: boolean;
  vehicleCount?: number;
};

/**
 * Handle marketplace.listing.prepare / inventory sync chat requests.
 */
export async function handleMarketplaceListingIntent(input: {
  workspaceId: string;
  message: string;
}): Promise<MarketplaceListingIntentResult> {
  const lower = input.message.toLowerCase();
  const syncRequested = wantsInventorySync(input.message);
  let synced = false;
  let vehicleCount: number | undefined;

  const snap = getInventorySnapshot(input.workspaceId);
  if (syncRequested || !snap || snap.vehicles.length === 0) {
    const sync = await syncPublicInventory({ workspaceId: input.workspaceId });
    if (!sync.ok) {
      return {
        summary:
          `Je n'ai pas pu synchroniser l'inventaire public (${sync.errors.join("; ")}). ` +
          `Tu peux encore ingérer du JSON via /api/inventory/snapshot.`,
      };
    }
    synced = true;
    vehicleCount = sync.vehicleCount;
  }

  // Pure sync request without stock prepare
  if (
    syncRequested &&
    !lower.includes("marketplace") &&
    !lower.includes("fiche") &&
    !extractStockRefFromMessage(input.message)
  ) {
    return {
      summary:
        `Inventaire public synchronisé : ${vehicleCount} véhicules en mémoire. ` +
        `Dis-moi un # de stock (ex. « prépare fiche Marketplace 26344-NEUF ») et je prépare la fiche.`,
      synced,
      vehicleCount,
    };
  }

  const stockRef = extractStockRefFromMessage(input.message);
  if (!stockRef) {
    const sample = (getInventorySnapshot(input.workspaceId)?.vehicles ?? [])
      .slice(0, 5)
      .map((v) => `• ${v.stockId} — ${v.year} ${v.make} ${v.model}`)
      .join("\n");
    return {
      summary:
        `Pour préparer une fiche Marketplace, donne-moi un # de stock (ex. 26344-NEUF).\n` +
        (sample ? `Exemples en mémoire :\n${sample}` : "Inventaire vide — dis « sync inventaire » d'abord."),
      synced,
      vehicleCount,
    };
  }

  const prepared = await prepareMarketplaceListing({
    workspaceId: input.workspaceId,
    stockId: stockRef,
  });
  if (!prepared.ok) {
    return {
      summary: `Impossible de préparer la fiche pour ${stockRef} : ${prepared.errors.join("; ")}`,
      stockRef,
      synced,
      vehicleCount,
    };
  }

  const checklist = formatMarketplaceUploadChecklist(prepared.packet);
  return {
    summary:
      `Fiche Marketplace prête pour ${stockRef} (publication manuelle).\n\n${checklist}` +
      (prepared.photoEnrichment?.enriched ? "\n\n(Photos enrichies depuis la fiche concession.)" : ""),
    stockRef,
    packetId: prepared.packet.packetId,
    synced,
    vehicleCount,
  };
}
