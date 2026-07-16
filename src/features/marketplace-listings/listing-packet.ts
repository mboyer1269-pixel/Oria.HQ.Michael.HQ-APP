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
  /** Ordered photo shot-list guidance (2026 Marketplace best practices). */
  photoShotListFr: string[];
  /** Marketplace form fields to fill for full algorithmic visibility. */
  marketplaceFieldsFr: Array<{ field: string; value: string }>;
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
  if (!Array.isArray(p.photoShotListFr)) errors.push("photoShotListFr must be an array");
  if (!Array.isArray(p.marketplaceFieldsFr)) errors.push("marketplaceFieldsFr must be an array");
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
 * Description follows 2026 high-conversion structure:
 * hook (2 lignes avant « Voir plus ») → 5-8 puces → confiance/condition →
 * contexte prix → CTA essai. 100-200 mots, pas de ALL CAPS ni spam.
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
    v.condition === "new" ? "Neuf" : v.condition === "cpo" ? "Certifié (CPO)" : "Occasion";
  const mileage =
    v.mileageKm !== undefined
      ? `${new Intl.NumberFormat("fr-CA").format(v.mileageKm)} km`
      : null;
  const priceLine = formatPrice(v.priceCad);

  // 1) Hook — first 2 lines shown before « Voir plus » must sell the click.
  const hook =
    v.condition === "new"
      ? `${title} neuf, en stock à Gatineau — prêt pour un essai cette semaine.`
      : mileage
        ? `${title} · ${mileage} — inspecté, prêt à partir, à ${priceLine}.`
        : `${title} — inspecté, prêt à partir, à ${priceLine}.`;

  // 2) Key feature bullets (5-8) — what buyers filter on.
  const bullets = [
    `Condition : ${conditionLabel}${v.condition === "new" ? " · garantie GM complète" : " · inspection concession"}`,
    mileage ? `Kilométrage : ${mileage}` : null,
    v.exteriorColor ? `Couleur extérieure : ${v.exteriorColor}` : null,
    v.trim ? `Version : ${v.trim}` : null,
    "Financement sur place · échange accepté · taux compétitifs GM",
    `Stock : ${v.stockNumber ?? v.stockId}${v.vin ? ` · NIV : ${v.vin}` : ""}`,
  ].filter((b): b is string => b !== null);

  // 3) Trust & condition — transparency reduces tire-kickers.
  const trustBlock =
    v.condition === "new"
      ? "Véhicule neuf de concession — dossier complet, aucune surprise. Rapport et fiche technique disponibles sur demande."
      : "Historique et inspection disponibles sur demande (CARFAX sur place). On divulgue tout avant votre déplacement — zéro surprise.";

  // 4) CTA — schedule the test drive (fills the livre).
  const cta =
    "Répondez à cette annonce pour réserver votre essai routier — réponse rapide, créneaux cette semaine.";

  const description = [
    hook,
    "",
    ...bullets.map((b) => `• ${b}`),
    "",
    trustBlock,
    "Concessionnaire Buckingham Chevrolet Buick GMC — Gatineau / Buckingham.",
    v.listingUrl ? `Fiche complète : ${v.listingUrl}` : null,
    "",
    cta,
  ]
    .filter((line) => line !== null)
    .join("\n");

  // Ordered shot-list (2026 data: 8-12 photos, front 3/4 lead).
  const photoShotListFr = [
    "1. Avant 3/4 côté conducteur (30-45°) — photo de couverture, roues braquées, fond dégagé",
    "2. Profil complet côté conducteur",
    "3. Arrière 3/4 — hayon / coffre visible",
    "4. Tableau de bord + écran allumé (CarPlay visible si dispo)",
    "5. Sièges avant (cuir / tissu net, sans objets)",
    "6. Banquette arrière + espace jambes",
    "7. Coffre / espace cargo ouvert",
    "8. Odomètre (photo la plus demandée — coupe les questions km)",
    "9-12. Détails vendeurs : roues, toit ouvrant, hitch, moteur",
    "Éviter : lot encombré, autres véhicules, bannières, reflets pare-brise",
  ];

  // Complete every Marketplace form field — incomplete listings lose reach.
  const marketplaceFieldsFr: Array<{ field: string; value: string }> = [
    { field: "Titre", value: title },
    { field: "Prix", value: v.priceCad !== undefined ? String(v.priceCad) : "Sur demande" },
    { field: "Année", value: String(v.year) },
    { field: "Marque", value: v.make },
    { field: "Modèle", value: `${v.model}${trim}` },
    { field: "État", value: conditionLabel },
    { field: "Kilométrage", value: mileage ?? "Neuf / bas km" },
    { field: "Couleur extérieure", value: v.exteriorColor ?? "Voir photos" },
    { field: "NIV", value: v.vin ?? "Fournir depuis dossier" },
    { field: "Lieu", value: input.locationHint ?? "Gatineau / Buckingham, QC" },
    { field: "Type de vendeur", value: "Concessionnaire" },
  ];

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
    photoShotListFr,
    marketplaceFieldsFr,
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
    "",
    "ÉTAPE 1 — Photos (ZIP → galerie → Marketplace) :",
    ...packet.photoShotListFr.map((s) => `  ${s}`),
    "",
    "ÉTAPE 2 — Champs du formulaire (tous remplis = plus de visibilité) :",
    ...packet.marketplaceFieldsFr.map((f) => `  • ${f.field} : ${f.value}`),
    "",
    "ÉTAPE 3 — Description à coller :",
    packet.description,
    "",
    "Disclaimers :",
    ...packet.disclaimers.map((d) => `• ${d}`),
    "",
    "ÉTAPE 4 — Après publication : marquer publié dans Oria + capturer chaque inbound en lead.",
    "Règle d'or : répondre en < 5 minutes = beaucoup plus de RDV.",
    "",
    "Oria ne publie pas sur Facebook — copie/upload manuel uniquement.",
  ];
  return lines.filter((l) => l !== null).join("\n");
}
