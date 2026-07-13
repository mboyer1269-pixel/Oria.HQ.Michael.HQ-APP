// src/features/sales/marketing-content-pack.ts
//
// Directeur Marketing — content packs multi-canal pour Sales Desk.
// Prepare-only: posts, pubs, Reels, Shorts. Human publishes (Meta API = Yellow Zone).

import type { VehicleStock } from "@/features/inventory/vehicle-stock";

export type MarketingChannel =
  | "marketplace"
  | "facebook_page"
  | "instagram_reel"
  | "youtube_short"
  | "meta_ad";

export const MARKETING_CHANNELS: readonly MarketingChannel[] = [
  "marketplace",
  "facebook_page",
  "instagram_reel",
  "youtube_short",
  "meta_ad",
];

export type MarketingPackStatus = "draft" | "ready_to_publish" | "published_manual";

export const MARKETING_PACK_STATUSES: readonly MarketingPackStatus[] = [
  "draft",
  "ready_to_publish",
  "published_manual",
];

export type MarketingAsset = {
  channel: MarketingChannel;
  label: string;
  hook: string;
  body: string;
  cta: string;
  hashtags: string[];
  /** Suggested video length for Reel / Short. */
  durationHintSec?: number;
  /** Shot list for phone filming. */
  shotList?: string[];
  voiceoverScript?: string;
};

export type MarketingContentPack = {
  packId: string;
  workspaceId: string;
  stockId: string;
  vehicleLabel: string;
  /** Sales angle chosen for conversion (Outaouais / Buckingham). */
  angle: string;
  assets: MarketingAsset[];
  /** Suggested daypart for posting. */
  publishWindowHint: string;
  leadCapturePrompt: string;
  status: MarketingPackStatus;
  createdAt: string;
  updatedAt: string;
  requiresManualPublish: true;
  noExecutionAuthorized: true;
};

export type MarketingPackValidation = {
  valid: boolean;
  errors: string[];
};

function requireText(value: unknown, field: string, errors: string[]): void {
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`${field} must be non-empty`);
  }
}

export function validateMarketingContentPack(input: unknown): MarketingPackValidation {
  const errors: string[] = [];
  if (!input || typeof input !== "object") {
    return { valid: false, errors: ["pack must be an object"] };
  }
  const p = input as Record<string, unknown>;
  requireText(p.packId, "packId", errors);
  requireText(p.workspaceId, "workspaceId", errors);
  requireText(p.stockId, "stockId", errors);
  requireText(p.vehicleLabel, "vehicleLabel", errors);
  requireText(p.angle, "angle", errors);
  requireText(p.publishWindowHint, "publishWindowHint", errors);
  requireText(p.leadCapturePrompt, "leadCapturePrompt", errors);
  requireText(p.createdAt, "createdAt", errors);
  requireText(p.updatedAt, "updatedAt", errors);
  if (
    typeof p.status !== "string" ||
    !MARKETING_PACK_STATUSES.includes(p.status as MarketingPackStatus)
  ) {
    errors.push(`status must be one of: ${MARKETING_PACK_STATUSES.join(", ")}`);
  }
  if (!Array.isArray(p.assets) || p.assets.length === 0) {
    errors.push("assets must be a non-empty array");
  } else {
    for (const asset of p.assets) {
      if (!asset || typeof asset !== "object") {
        errors.push("each asset must be an object");
        continue;
      }
      const a = asset as Record<string, unknown>;
      if (
        typeof a.channel !== "string" ||
        !MARKETING_CHANNELS.includes(a.channel as MarketingChannel)
      ) {
        errors.push(`asset.channel must be one of: ${MARKETING_CHANNELS.join(", ")}`);
      }
      requireText(a.label, "asset.label", errors);
      requireText(a.hook, "asset.hook", errors);
      requireText(a.body, "asset.body", errors);
      requireText(a.cta, "asset.cta", errors);
      if (!Array.isArray(a.hashtags)) errors.push("asset.hashtags must be an array");
    }
  }
  if (p.requiresManualPublish !== true) errors.push("requiresManualPublish must be true");
  if (p.noExecutionAuthorized !== true) errors.push("noExecutionAuthorized must be true");
  return { valid: errors.length === 0, errors };
}

function formatPrice(priceCad: number | undefined): string {
  if (priceCad === undefined) return "prix sur demande";
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(priceCad);
}

function vehicleTitle(v: VehicleStock): string {
  const trim = v.trim ? ` ${v.trim}` : "";
  return `${v.year} ${v.make} ${v.model}${trim}`.trim();
}

function conditionLabel(v: VehicleStock): string {
  if (v.condition === "new") return "Neuf";
  if (v.condition === "cpo") return "Certifié";
  return "Occasion";
}

function pickAngle(v: VehicleStock): string {
  if (v.condition === "new") {
    return "Neuf disponible immédiatement — essai rapide Outaouais";
  }
  if (v.condition === "cpo") {
    return "CPO = garantie + confiance — alternative intelligente au neuf";
  }
  if (v.mileageKm !== undefined && v.mileageKm < 40000) {
    return "Bas kilométrage — valeur forte vs marché Gatineau";
  }
  return "Rapport qualité-prix — réponse rapide aux messages Marketplace";
}

function baseFacts(v: VehicleStock): string[] {
  const lines: string[] = [];
  lines.push(`${conditionLabel(v)} · ${formatPrice(v.priceCad)}`);
  if (v.mileageKm !== undefined) {
    lines.push(`${new Intl.NumberFormat("fr-CA").format(v.mileageKm)} km`);
  } else if (v.condition === "new") {
    lines.push("Neuf / bas km");
  }
  if (v.exteriorColor) lines.push(`Couleur : ${v.exteriorColor}`);
  if (v.stockNumber || v.stockId) lines.push(`Stock ${v.stockNumber ?? v.stockId}`);
  return lines;
}

function buildMarketplaceAsset(v: VehicleStock, title: string): MarketingAsset {
  const facts = baseFacts(v);
  const hook =
    v.condition === "new"
      ? `${title} NEUF — disponible cette semaine à Buckingham GM`
      : `${title} — prêt pour essai à Gatineau / Buckingham`;
  const body = [
    hook,
    "",
    ...facts.map((f) => `• ${f}`),
    "",
    "Pourquoi répondre maintenant ?",
    "• Essai le jour même (selon disponibilité)",
    "• Équipe locale Outaouais — réponses rapides",
    "• Financement et reprise évalués sans pression",
    "",
    "Disponible chez Buckingham Chevrolet Buick GMC.",
    v.listingUrl ? `Fiche concession : ${v.listingUrl}` : null,
    "",
    "Écrivez « ESSAI » + votre numéro — on vous rappelle sous 15 minutes (heures d'ouverture).",
  ]
    .filter((line) => line !== null)
    .join("\n");

  return {
    channel: "marketplace",
    label: "Annonce Marketplace",
    hook,
    body,
    cta: "Écrivez ESSAI + votre numéro pour un rappel rapide.",
    hashtags: [],
  };
}

function buildFacebookPageAsset(v: VehicleStock, title: string): MarketingAsset {
  const price = formatPrice(v.priceCad);
  const hook =
    v.condition === "new"
      ? `Nouveau sur le lot : ${title}`
      : `Coup de cœur de la semaine : ${title}`;
  const body = [
    hook,
    "",
    `${conditionLabel(v)} · ${price}`,
    v.mileageKm !== undefined
      ? `${new Intl.NumberFormat("fr-CA").format(v.mileageKm)} km — prêt pour la route.`
      : "Disponible immédiatement pour essai.",
    "",
    "Tu cherches un véhicule fiable dans l'Outaouais ?",
    "Viens le voir à Buckingham Chevrolet Buick GMC — on te réserve un créneau d'essai.",
    "",
    "Commente ESSAI ou envoie un message privé avec ton nom + numéro.",
    v.listingUrl ? `Détails : ${v.listingUrl}` : null,
  ]
    .filter((line) => line !== null)
    .join("\n");

  return {
    channel: "facebook_page",
    label: "Post Facebook Page",
    hook,
    body,
    cta: "Commente ESSAI ou message privé → nom + numéro.",
    hashtags: ["#BuckinghamGM", "#Gatineau", "#Outaouais", `#${v.make}`, `#${v.model}`],
  };
}

function buildReelAsset(v: VehicleStock, title: string): MarketingAsset {
  const price = formatPrice(v.priceCad);
  const hook = v.condition === "new" ? `Neuf. Dispo. ${title}.` : `${title} — regarde ça.`;
  const voiceoverScript = [
    `Tu cherches un ${v.make} ${v.model} dans l'Outaouais ?`,
    `Voici le ${title}, ${conditionLabel(v).toLowerCase()}, à ${price}.`,
    "Essai rapide chez Buckingham GM — envoie ESSAI en commentaire.",
  ].join(" ");

  return {
    channel: "instagram_reel",
    label: "Reel Instagram / Facebook",
    hook,
    body: `${hook}\n\n${voiceoverScript}\n\n${price} · Buckingham GM · Gatineau`,
    cta: "Commente ESSAI pour un rappel.",
    hashtags: ["#ReelAuto", "#BuckinghamGM", "#GatineauAutos", `#${v.model}`],
    durationHintSec: 22,
    shotList: [
      "0–3s : face avant + logo Buckingham (texte hook)",
      "3–8s : tour du véhicule (profil + roues)",
      "8–14s : intérieur (volant + écran)",
      "14–18s : détail différenciateur (hayon / sièges / écran)",
      "18–22s : CTA plein écran « ESSAI » + prix",
    ],
    voiceoverScript,
  };
}

function buildYoutubeShortAsset(v: VehicleStock, title: string): MarketingAsset {
  const price = formatPrice(v.priceCad);
  const hook = `${title} à ${price} — Outaouais`;
  const voiceoverScript = [
    `Trois raisons de regarder ce ${v.model} aujourd'hui.`,
    `Un : ${conditionLabel(v).toLowerCase()} et prêt pour essai.`,
    `Deux : prix affiché ${price}.`,
    "Trois : Buckingham GM à Gatineau — réponse locale, pas un call center.",
    "Écris ESSAI en commentaire si tu veux un créneau.",
  ].join(" ");

  return {
    channel: "youtube_short",
    label: "YouTube Short",
    hook,
    body: `${hook}\n\n${voiceoverScript}`,
    cta: "Commente ESSAI + ta ville (Gatineau, Buckingham, Ottawa…).",
    hashtags: ["#Shorts", "#AutoQuebec", "#BuckinghamGM", `#${v.make}${v.model}`],
    durationHintSec: 35,
    shotList: [
      "Hook texte gros (3s)",
      "Walkaround 360 rapide (12s)",
      "Intérieur + écran (8s)",
      "Prix + stock # (5s)",
      "CTA ESSAI (7s)",
    ],
    voiceoverScript,
  };
}

function buildMetaAdAsset(v: VehicleStock, title: string): MarketingAsset {
  const price = formatPrice(v.priceCad);
  const hook =
    v.condition === "new"
      ? `${title} neuf — essaie-le cette semaine`
      : `${title} — essai sans pression à Gatineau`;
  const body = [
    hook,
    "",
    `Primaire : ${conditionLabel(v)} · ${price}`,
    "Audience : 25 km autour de Gatineau / Buckingham + intérêts véhicules GM.",
    "Objectif : messages / leads (pas vanity likes).",
    "",
    "Texte pub :",
    `${title} disponible chez Buckingham Chevrolet Buick GMC.`,
    "Réponds pour un essai — on te rappelle rapidement.",
  ].join("\n");

  return {
    channel: "meta_ad",
    label: "Pub Meta (Lead / Message)",
    hook,
    body,
    cta: "Envoyer un message / Réserver un essai",
    hashtags: [],
  };
}

/**
 * Build a multi-channel marketing pack optimized for lead gen (Outaouais).
 * Always locks requiresManualPublish / noExecutionAuthorized.
 */
export function buildMarketingContentPack(input: {
  packId: string;
  workspaceId: string;
  vehicle: VehicleStock;
  nowIso: string;
  status?: MarketingPackStatus;
}): MarketingContentPack {
  const v = input.vehicle;
  const title = vehicleTitle(v);
  const angle = pickAngle(v);
  const assets: MarketingAsset[] = [
    buildMarketplaceAsset(v, title),
    buildFacebookPageAsset(v, title),
    buildReelAsset(v, title),
    buildYoutubeShortAsset(v, title),
    buildMetaAdAsset(v, title),
  ];

  return {
    packId: input.packId,
    workspaceId: input.workspaceId,
    stockId: v.stockId,
    vehicleLabel: title,
    angle,
    assets,
    publishWindowHint:
      "Idéal : mardi–jeudi 11h–13h ou 18h–20h (Outaouais). Marketplace + Reel le même jour.",
    leadCapturePrompt:
      "Dès qu'un prospect répond ESSAI / message / commentaire : capture le lead (nom + téléphone) dans Sales Desk avec source marketplace_message ou marketplace_post.",
    status: input.status ?? "ready_to_publish",
    createdAt: input.nowIso,
    updatedAt: input.nowIso,
    requiresManualPublish: true,
    noExecutionAuthorized: true,
  };
}

/** Flatten one asset for clipboard (copy → paste into Meta / YouTube). */
export function formatMarketingAssetClipboard(asset: MarketingAsset): string {
  const lines = [
    `=== ${asset.label} (${asset.channel}) ===`,
    `HOOK: ${asset.hook}`,
    "",
    asset.body,
    "",
    `CTA: ${asset.cta}`,
  ];
  if (asset.hashtags.length > 0) {
    lines.push("", asset.hashtags.join(" "));
  }
  if (asset.durationHintSec) {
    lines.push("", `Durée cible : ~${asset.durationHintSec}s`);
  }
  if (asset.shotList?.length) {
    lines.push("", "Plan de tournage :", ...asset.shotList.map((s) => `• ${s}`));
  }
  if (asset.voiceoverScript) {
    lines.push("", "Voix off :", asset.voiceoverScript);
  }
  lines.push("", "— Prepare-only : publication manuelle (pas d'auto-post Meta).");
  return lines.join("\n");
}

/** Full pack clipboard for the publish agent desk. */
export function formatMarketingPackClipboard(pack: MarketingContentPack): string {
  const blocks = [
    `PACK MARKETING — ${pack.vehicleLabel}`,
    `Angle : ${pack.angle}`,
    `Fenêtre : ${pack.publishWindowHint}`,
    "",
    pack.leadCapturePrompt,
    "",
    ...pack.assets.map((a) => formatMarketingAssetClipboard(a)),
  ];
  return blocks.join("\n\n");
}

/**
 * Rank vehicles for today's publish queue (lead potential).
 * Prefers: photos, new/cpo, priced, then used with photos.
 */
export function rankVehiclesForPublishQueue(
  vehicles: readonly VehicleStock[],
  limit = 5,
): VehicleStock[] {
  const scored = vehicles.map((v) => {
    let score = 0;
    if (v.photoUrls.length >= 5) score += 3;
    else if (v.photoUrls.length > 0) score += 1;
    if (v.condition === "new") score += 3;
    if (v.condition === "cpo") score += 2;
    if (v.priceCad !== undefined) score += 1;
    if (v.listingUrl) score += 1;
    if (v.mileageKm !== undefined && v.mileageKm < 50000) score += 1;
    return { v, score };
  });
  scored.sort((a, b) => b.score - a.score || a.v.stockId.localeCompare(b.v.stockId));
  return scored.slice(0, limit).map((s) => s.v);
}
