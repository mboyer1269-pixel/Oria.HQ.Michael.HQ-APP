// src/features/marketplace-listings/listing-packet.ts
//
// Facebook Marketplace listing packets prepared from inventory stock.
// Prepare-only: requiresManualPublish locked true. No Facebook bot / cookies.

import type { VehicleStock } from "@/features/inventory/vehicle-stock";

export type MarketplaceListingStatus =
  | "prepared"
  | "ready_for_manual_publish"
  | "published_manual"
  | "superseded";

export const MARKETPLACE_LISTING_STATUSES: readonly MarketplaceListingStatus[] = [
  "prepared",
  "ready_for_manual_publish",
  "published_manual",
  "superseded",
];

export type MarketplaceListingPacket = {
  packetId: string;
  workspaceId: string;
  stockId: string;
  title: string;
  description: string;
  priceCad?: number;
  photoUrls: string[];
  locationHint: string;
  disclaimers: string[];
  /** Dealer listing URL for transparency. */
  sourceListingUrl?: string;
  status: MarketplaceListingStatus;
  createdAt: string;
  updatedAt: string;
  requiresManualPublish: true;
  noExecutionAuthorized: true;
};

export type ListingValidation = {
  valid: boolean;
  errors: string[];
};

function requireText(value: unknown, field: string, errors: string[]): void {
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`${field} must be non-empty`);
  }
}

export function validateMarketplaceListingPacket(input: unknown): ListingValidation {
  const errors: string[] = [];
  if (!input || typeof input !== "object") {
    return { valid: false, errors: ["packet must be an object"] };
  }
  const p = input as Record<string, unknown>;
  requireText(p.packetId, "packetId", errors);
  requireText(p.workspaceId, "workspaceId", errors);
  requireText(p.stockId, "stockId", errors);
  requireText(p.title, "title", errors);
  requireText(p.description, "description", errors);
  requireText(p.locationHint, "locationHint", errors);
  requireText(p.createdAt, "createdAt", errors);
  requireText(p.updatedAt, "updatedAt", errors);
  if (
    typeof p.status !== "string" ||
    !MARKETPLACE_LISTING_STATUSES.includes(p.status as MarketplaceListingStatus)
  ) {
    errors.push(`status must be one of: ${MARKETPLACE_LISTING_STATUSES.join(", ")}`);
  }
  if (!Array.isArray(p.photoUrls)) errors.push("photoUrls must be an array");
  if (!Array.isArray(p.disclaimers)) errors.push("disclaimers must be an array");
  if (p.requiresManualPublish !== true) errors.push("requiresManualPublish must be true");
  if (p.noExecutionAuthorized !== true) errors.push("noExecutionAuthorized must be true");
  return { valid: errors.length === 0, errors };
}

const DEFAULT_DISCLAIMERS = [
  "Prix et disponibilité sujets à changement — confirmer en concession.",
  "Taxes, frais de transport et préparation en sus sauf indication contraire.",
  "Annonce préparée pour publication manuelle (pas d'auto-post).",
];

function formatPrice(priceCad: number | undefined): string {
  if (priceCad === undefined) return "Prix sur demande";
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(priceCad);
}

/**
 * Build a Marketplace listing packet from a stock vehicle.
 * Always locks requiresManualPublish / noExecutionAuthorized.
 */
export function prepareListingFromStock(input: {
  packetId: string;
  workspaceId: string;
  vehicle: VehicleStock;
  locationHint?: string;
  nowIso: string;
  extraDisclaimers?: string[];
}): MarketplaceListingPacket {
  const v = input.vehicle;
  const trim = v.trim ? ` ${v.trim}` : "";
  const title = `${v.year} ${v.make} ${v.model}${trim}`.trim();
  const conditionLabel =
    v.condition === "new" ? "Neuf" : v.condition === "cpo" ? "CPO" : "Occasion";
  const mileage =
    v.mileageKm !== undefined
      ? `${new Intl.NumberFormat("fr-CA").format(v.mileageKm)} km`
      : null;
  const photoCount = v.photoUrls.length;
  const description = [
    `${title} — ${conditionLabel}`,
    `Prix affiché : ${formatPrice(v.priceCad)} (+ taxes & frais)`,
    mileage ? `Kilométrage : ${mileage}` : v.condition === "new" ? "Kilométrage : neuf / bas km" : null,
    v.exteriorColor ? `Couleur ext. : ${v.exteriorColor}` : null,
    v.stockNumber || v.stockId ? `Stock : ${v.stockNumber ?? v.stockId}` : null,
    v.vin ? `NIV : ${v.vin}` : null,
    "",
    "Disponible chez Buckingham Chevrolet Buick GMC (Gatineau / Buckingham).",
    "Essai et prise de rendez-vous bienvenus — répondez à cette annonce.",
    v.listingUrl ? `Fiche concession : ${v.listingUrl}` : null,
    photoCount > 0 ? `Photos jointes : ${photoCount} (à uploader depuis les URLs du packet).` : null,
  ]
    .filter((line) => line !== null)
    .join("\n");

  return {
    packetId: input.packetId,
    workspaceId: input.workspaceId,
    stockId: v.stockId,
    title,
    description,
    priceCad: v.priceCad,
    photoUrls: [...v.photoUrls].slice(0, 20),
    locationHint: input.locationHint ?? "Gatineau / Buckingham, QC",
    disclaimers: [...DEFAULT_DISCLAIMERS, ...(input.extraDisclaimers ?? [])],
    sourceListingUrl: v.listingUrl,
    status: "ready_for_manual_publish",
    createdAt: input.nowIso,
    updatedAt: input.nowIso,
    requiresManualPublish: true,
    noExecutionAuthorized: true,
  };
}

/** Human checklist for copying a packet into Facebook Marketplace. */
export function formatMarketplaceUploadChecklist(packet: MarketplaceListingPacket): string {
  const lines = [
    "Fiche Marketplace prête (publication manuelle) :",
    `• Titre : ${packet.title}`,
    packet.priceCad !== undefined ? `• Prix : ${formatPrice(packet.priceCad)}` : "• Prix : sur demande",
    `• Lieu : ${packet.locationHint}`,
    `• Photos (${packet.photoUrls.length}) :`,
    ...packet.photoUrls.map((u, i) => `  ${i + 1}. ${u}`),
    "",
    "Description à coller :",
    packet.description,
    "",
    "Disclaimers :",
    ...packet.disclaimers.map((d) => `• ${d}`),
    "",
    "Oria ne publie pas sur Facebook — copie/upload manuel uniquement.",
  ];
  return lines.join("\n");
}
