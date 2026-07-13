// Publish Agent — prioritizes inventory for Marketplace, batch prepare hints.
// Prepare-only: accelerates human publish workflow; no Facebook API/bot.

import type { VehicleStock } from "@/features/inventory/vehicle-stock";
import type { InventoryHighlight } from "@/features/inventory/inventory-debrief";
import type { MarketplaceListingPacket } from "@/features/marketplace-listings/listing-packet";

export const FACEBOOK_MARKETPLACE_CREATE_URL =
  "https://www.facebook.com/marketplace/create/vehicle";

export type PublishCandidate = {
  stockId: string;
  title: string;
  priceCad?: number;
  photoCount: number;
  photoUrl?: string;
  priorityScore: number;
  reasons: string[];
  alreadyPrepared: boolean;
  alreadyPublished: boolean;
};

function vehicleTitle(v: VehicleStock): string {
  const trim = v.trim ? ` ${v.trim}` : "";
  return `${v.year} ${v.make} ${v.model}${trim}`.trim();
}

function scoreVehicle(
  v: VehicleStock,
  highlightStockIds: Set<string>,
  preparedStockIds: Set<string>,
  publishedStockIds: Set<string>,
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  if (publishedStockIds.has(v.stockId)) {
    return { score: -100, reasons: ["Déjà publié"] };
  }
  if (preparedStockIds.has(v.stockId)) {
    score += 5;
    reasons.push("Fiche déjà préparée — publier maintenant");
  }
  if (highlightStockIds.has(v.stockId)) {
    score += 15;
    reasons.push("Priorité débrief inventaire");
  }
  if (v.photoUrls.length >= 8) {
    score += 10;
    reasons.push("Beaucoup de photos (conversion +)");
  } else if (v.photoUrls.length >= 3) {
    score += 5;
    reasons.push("Photos suffisantes");
  } else {
    score -= 5;
    reasons.push("Peu de photos — enrichir avant publish");
  }
  if (typeof v.priceCad === "number") {
    score += 3;
    reasons.push("Prix affiché");
  }
  if (v.condition === "new") {
    score += 8;
    reasons.push("Neuf — forte demande Marketplace");
  } else if (v.condition === "cpo") {
    score += 4;
    reasons.push("CPO — rassure l'acheteur");
  }
  if (v.listingUrl) {
    score += 2;
    reasons.push("Fiche concession liée");
  }

  return { score, reasons };
}

/**
 * Rank vehicles for today's Marketplace publish sprint.
 */
export function buildPublishCandidates(input: {
  vehicles: VehicleStock[];
  highlights?: InventoryHighlight[];
  listings?: MarketplaceListingPacket[];
  limit?: number;
}): PublishCandidate[] {
  const highlightStockIds = new Set((input.highlights ?? []).map((h) => h.stockId));
  const preparedStockIds = new Set(
    (input.listings ?? [])
      .filter((l) => l.status !== "published_manual" && l.status !== "superseded")
      .map((l) => l.stockId),
  );
  const publishedStockIds = new Set(
    (input.listings ?? []).filter((l) => l.status === "published_manual").map((l) => l.stockId),
  );

  const candidates = input.vehicles
    .map((v) => {
      const { score, reasons } = scoreVehicle(
        v,
        highlightStockIds,
        preparedStockIds,
        publishedStockIds,
      );
      return {
        stockId: v.stockId,
        title: vehicleTitle(v),
        priceCad: v.priceCad,
        photoCount: v.photoUrls.length,
        photoUrl: v.photoUrls[0],
        priorityScore: score,
        reasons,
        alreadyPrepared: preparedStockIds.has(v.stockId),
        alreadyPublished: publishedStockIds.has(v.stockId),
      };
    })
    .filter((c) => !c.alreadyPublished)
    .sort((a, b) => b.priorityScore - a.priorityScore);

  const limit = input.limit ?? 8;
  return candidates.slice(0, limit);
}

/** Full copy bundle for fastest manual Marketplace upload. */
export function formatPublishBundle(packet: MarketplaceListingPacket): string {
  const price =
    packet.priceCad !== undefined
      ? new Intl.NumberFormat("fr-CA", {
          style: "currency",
          currency: "CAD",
          maximumFractionDigits: 0,
        }).format(packet.priceCad)
      : "sur demande";

  return [
    "=== BUNDLE PUBLICATION MARKETPLACE ===",
    `Packet: ${packet.packetId}`,
    "",
    "TITRE (copier) :",
    packet.title,
    "",
    "PRIX :",
    price,
    "",
    "LIEU :",
    packet.locationHint,
    "",
    "DESCRIPTION :",
    packet.description,
    "",
    `PHOTOS (${packet.photoUrls.length}) — télécharger puis uploader :`,
    ...packet.photoUrls.map((u, i) => `${i + 1}. ${u}`),
    "",
    "Étapes :",
    `1. Ouvrir ${FACEBOOK_MARKETPLACE_CREATE_URL}`,
    "2. Coller titre, prix, lieu, description",
    "3. Uploader les photos",
    "4. Publier → marquer publié dans Sales Desk",
    "5. Capturer chaque message inbound comme lead",
    "",
    "Oria ne publie pas automatiquement — conformité Meta.",
  ].join("\n");
}
