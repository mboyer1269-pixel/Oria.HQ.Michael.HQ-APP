// src/features/sales/marketing-content-pack.ts
//
// Directeur Marketing — multi-channel publish kits from inventory stock.
// Prepare-only: copy/paste into Marketplace, Facebook, Reels, YouTube, Meta Ads.
// No Facebook bot, cookies, or auto-publish (Meta ToS + product NO-GO).

import type { VehicleStock } from "@/features/inventory/vehicle-stock";

export type MarketingPublishPriority = "hot" | "standard" | "nurture";

export type MarketingContentPack = {
  packId: string;
  workspaceId: string;
  stockId: string;
  vehicleLabel: string;
  publishPriority: MarketingPublishPriority;
  marketplace: {
    title: string;
    description: string;
    priceCad?: number;
    locationHint: string;
    photoUrls: string[];
  };
  facebookPost: {
    caption: string;
    hashtags: string[];
    cta: string;
  };
  reel: {
    hook: string;
    beats: string[];
    voiceover: string;
    onScreenText: string[];
    durationSec: number;
    cta: string;
  };
  youtubeShort: {
    title: string;
    description: string;
    tags: string[];
    thumbnailHint: string;
  };
  metaAd: {
    primaryText: string;
    headline: string;
    description: string;
    callToAction: string;
  };
  /** What the rep says / types when an inbound lead replies. */
  leadCaptureScript: string;
  /** Ordered human publish checklist (speed → more posts → more leads). */
  publishChecklist: string[];
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
  requireText(p.createdAt, "createdAt", errors);
  requireText(p.updatedAt, "updatedAt", errors);
  if (p.requiresManualPublish !== true) errors.push("requiresManualPublish must be true");
  if (p.noExecutionAuthorized !== true) errors.push("noExecutionAuthorized must be true");
  if (!p.marketplace || typeof p.marketplace !== "object") {
    errors.push("marketplace must be an object");
  } else {
    const m = p.marketplace as Record<string, unknown>;
    requireText(m.title, "marketplace.title", errors);
    requireText(m.description, "marketplace.description", errors);
  }
  if (!p.facebookPost || typeof p.facebookPost !== "object") {
    errors.push("facebookPost must be an object");
  }
  if (!p.reel || typeof p.reel !== "object") {
    errors.push("reel must be an object");
  }
  if (!p.youtubeShort || typeof p.youtubeShort !== "object") {
    errors.push("youtubeShort must be an object");
  }
  if (!p.metaAd || typeof p.metaAd !== "object") {
    errors.push("metaAd must be an object");
  }
  return { valid: errors.length === 0, errors };
}

function formatPrice(priceCad: number | undefined): string {
  if (priceCad === undefined) return "Prix sur demande";
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(priceCad);
}

function vehicleLabel(v: VehicleStock): string {
  const trim = v.trim ? ` ${v.trim}` : "";
  return `${v.year} ${v.make} ${v.model}${trim}`.trim();
}

function conditionLabel(v: VehicleStock): string {
  if (v.condition === "new") return "Neuf";
  if (v.condition === "cpo") return "CPO";
  return "Occasion";
}

function inferPublishPriority(v: VehicleStock): MarketingPublishPriority {
  const photos = v.photoUrls.length;
  if (v.condition === "new" && photos >= 6 && v.priceCad !== undefined) return "hot";
  if (photos >= 4 && v.priceCad !== undefined) return "standard";
  return "nurture";
}

function dealerCtaLine(): string {
  return "Répondez « ESSAI » ou appelez Buckingham Chevrolet Buick GMC (Gatineau) pour réserver votre essai aujourd’hui.";
}

/**
 * Build conversion-oriented Marketplace description (manual publish).
 * Strong CTA + scarcity + dealer trust — optimized for inbound leads.
 */
export function buildMarketplaceLeadDescription(v: VehicleStock): string {
  const label = vehicleLabel(v);
  const mileage =
    v.mileageKm !== undefined
      ? `${new Intl.NumberFormat("fr-CA").format(v.mileageKm)} km`
      : v.condition === "new"
        ? "Neuf / bas km"
        : null;
  const lines = [
    `${label} — ${conditionLabel(v)} | Buckingham GM`,
    `💰 ${formatPrice(v.priceCad)} (+ taxes & frais) — confirmez la dispo en concession.`,
    mileage ? `📍 Kilométrage : ${mileage}` : null,
    v.exteriorColor ? `🎨 Couleur : ${v.exteriorColor}` : null,
    v.stockNumber || v.stockId ? `🔖 Stock : ${v.stockNumber ?? v.stockId}` : null,
    "",
    "Pourquoi écrire maintenant ?",
    "• Essai rapide Gatineau / Buckingham — on s’occupe de vous.",
    "• Photos + fiche concession vérifiées (pas une annonce fantôme).",
    "• Financement / échange évalués sans pression.",
    "",
    dealerCtaLine(),
    v.listingUrl ? `Fiche concession : ${v.listingUrl}` : null,
    v.photoUrls.length > 0
      ? `📸 ${Math.min(v.photoUrls.length, 20)} photos à uploader (plus de photos = plus de messages).`
      : "⚠️ Ajoutez des photos avant publication — sinon le post sous-performe.",
  ];
  return lines.filter((line) => line !== null).join("\n");
}

/**
 * Directeur Marketing pack: Marketplace + FB + Reel + YouTube Short + Meta Ad.
 * Always locks manual publish / no execution.
 */
export function prepareMarketingContentPack(input: {
  packId: string;
  workspaceId: string;
  vehicle: VehicleStock;
  locationHint?: string;
  nowIso: string;
}): MarketingContentPack {
  const v = input.vehicle;
  const label = vehicleLabel(v);
  const price = formatPrice(v.priceCad);
  const location = input.locationHint ?? "Gatineau / Buckingham, QC";
  const priority = inferPublishPriority(v);
  const hashtags = [
    "#BuckinghamGM",
    "#Gatineau",
    `#${v.make.replace(/\s+/g, "")}`,
    `#${v.model.replace(/\s+/g, "")}`,
    v.condition === "new" ? "#AutoNeuve" : "#AutoOccasion",
    "#Outaouais",
  ];

  const marketplaceTitle = `${label} — ${conditionLabel(v)} | Buckingham GM`;
  const marketplaceDescription = buildMarketplaceLeadDescription(v);

  const facebookCaption = [
    `🚗 ${label} disponible chez Buckingham Chevrolet Buick GMC.`,
    ``,
    `${conditionLabel(v)} · ${price}`,
    mileageLine(v),
    ``,
    `Idéal pour rouler Gatineau–Ottawa sans stress. Photos + essai en concession.`,
    ``,
    `👉 Commentez ESSAI ou envoyez un message privé — on vous rappelle rapidement.`,
    v.listingUrl ? `Fiche : ${v.listingUrl}` : null,
  ]
    .filter((line) => line !== null)
    .join("\n");

  const reelHook =
    v.condition === "new"
      ? `Neuf ${v.year} — ${v.make} ${v.model} à Buckingham GM 🔥`
      : `${label} à ${price} — regarde avant qu’il parte`;

  const reelBeats = [
    "0–2s : face avant + prix à l’écran",
    "2–6s : tour 360 rapide (coins + jantes)",
    "6–12s : intérieur (tableau de bord + places arrière)",
    "12–18s : détail différenciateur (4x4, hybride, écran, coffre…)",
    "18–25s : toi à la caméra + CTA ESSAI + téléphone concession",
  ];

  const voiceover = [
    `Voici le ${label}, ${conditionLabel(v).toLowerCase()}, chez Buckingham GM à Gatineau.`,
    `Affiché à ${price}.`,
    `Si tu veux l’essayer cette semaine, écris ESSAI en commentaire — on te réserve un créneau.`,
  ].join(" ");

  const youtubeTitle = `${label} ${conditionLabel(v)} — Buckingham GM Gatineau | ${price}`;
  const youtubeDescription = [
    `${label} disponible chez Buckingham Chevrolet Buick GMC (Gatineau / Buckingham).`,
    `Prix affiché : ${price}.`,
    ``,
    `Essai · financement · évaluation d’échange.`,
    dealerCtaLine(),
    v.listingUrl ? `Fiche : ${v.listingUrl}` : "",
    ``,
    hashtags.join(" "),
  ]
    .filter(Boolean)
    .join("\n");

  const metaPrimary = [
    `${label} — ${conditionLabel(v)} chez Buckingham GM (Gatineau).`,
    `Prix affiché ${price}. Essai rapide, équipe locale, zéro pression.`,
    `Touchez « Envoyer un message » pour réserver votre essai.`,
  ].join(" ");

  const leadCaptureScript = [
    `Merci pour votre intérêt pour le ${label} !`,
    `Je suis représentant chez Buckingham GM (Gatineau).`,
    `On peut faire un essai dès aujourd’hui ou demain — quel créneau vous arrange (matin / après-midi) ?`,
    `Aussi : avez-vous un véhicule en échange ?`,
  ].join(" ");

  const publishChecklist = [
    "1) Marketplace : coller titre + description + prix + 11+ photos (priorité #1 leads).",
    "2) Marquer publié dans Sales Desk + capturer chaque inbound comme lead.",
    "3) Post Facebook page/concession : coller caption + 3–5 photos + hashtags.",
    "4) Filmer Reel 20–25s avec le script (hook + beats) — publier le jour même.",
    "5) YouTube Short : même clip + titre/description du kit.",
    "6) (Option) Meta Ads : coller primary/headline/CTA — budget test 15–25 $/jour sur 3–5 jours.",
    "7) Chaque message → Capture rapide (source Marketplace/FB) + relance SMS préparée.",
  ];

  return {
    packId: input.packId,
    workspaceId: input.workspaceId,
    stockId: v.stockId,
    vehicleLabel: label,
    publishPriority: priority,
    marketplace: {
      title: marketplaceTitle,
      description: marketplaceDescription,
      priceCad: v.priceCad,
      locationHint: location,
      photoUrls: [...v.photoUrls].slice(0, 20),
    },
    facebookPost: {
      caption: facebookCaption,
      hashtags,
      cta: "Commentez ESSAI ou message privé pour réserver votre essai.",
    },
    reel: {
      hook: reelHook,
      beats: reelBeats,
      voiceover,
      onScreenText: [label, price, "Écris ESSAI 👇", "Buckingham GM · Gatineau"],
      durationSec: 25,
      cta: "Écris ESSAI pour un essai cette semaine",
    },
    youtubeShort: {
      title: youtubeTitle.slice(0, 100),
      description: youtubeDescription,
      tags: [
        v.make,
        v.model,
        "Buckingham GM",
        "Gatineau",
        conditionLabel(v),
        "essai auto",
      ],
      thumbnailHint: "Face avant + prix CAD en gros + logo Buckingham GM",
    },
    metaAd: {
      primaryText: metaPrimary,
      headline: `${label} · ${price}`,
      description: "Essai Gatineau — Buckingham Chevrolet Buick GMC",
      callToAction: "SEND_MESSAGE",
    },
    leadCaptureScript,
    publishChecklist,
    createdAt: input.nowIso,
    updatedAt: input.nowIso,
    requiresManualPublish: true,
    noExecutionAuthorized: true,
  };
}

function mileageLine(v: VehicleStock): string | null {
  if (v.mileageKm !== undefined) {
    return `Kilométrage : ${new Intl.NumberFormat("fr-CA").format(v.mileageKm)} km`;
  }
  if (v.condition === "new") return "Kilométrage : neuf";
  return null;
}

/** Full kit as plain text for one-tap clipboard (rep publishes channel by channel). */
export function formatMarketingPackClipboard(pack: MarketingContentPack): string {
  return [
    `KIT MARKETING — ${pack.vehicleLabel} (${pack.stockId})`,
    `Priorité publication : ${pack.publishPriority.toUpperCase()}`,
    `⚠️ Prepare-only — tu publies manuellement (pas d’auto-post Facebook).`,
    "",
    "=== CHECKLIST ===",
    ...pack.publishChecklist,
    "",
    "=== MARKETPLACE — TITRE ===",
    pack.marketplace.title,
    "",
    "=== MARKETPLACE — DESCRIPTION ===",
    pack.marketplace.description,
    "",
    "=== FACEBOOK — CAPTION ===",
    pack.facebookPost.caption,
    "",
    pack.facebookPost.hashtags.join(" "),
    "",
    "=== REEL — HOOK ===",
    pack.reel.hook,
    "",
    "=== REEL — VOICEOVER ===",
    pack.reel.voiceover,
    "",
    "=== REEL — BEATS ===",
    ...pack.reel.beats.map((b) => `• ${b}`),
    "",
    "=== YOUTUBE SHORT — TITRE ===",
    pack.youtubeShort.title,
    "",
    "=== YOUTUBE SHORT — DESCRIPTION ===",
    pack.youtubeShort.description,
    "",
    "=== META AD ===",
    `Primary: ${pack.metaAd.primaryText}`,
    `Headline: ${pack.metaAd.headline}`,
    `Description: ${pack.metaAd.description}`,
    `CTA: ${pack.metaAd.callToAction}`,
    "",
    "=== SCRIPT CAPTURE LEAD (inbound) ===",
    pack.leadCaptureScript,
  ].join("\n");
}
