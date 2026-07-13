// src/features/marketing/content-pack.ts
//
// Marketing director — per-vehicle content pack generator.
// Pure, deterministic (no I/O, no AI key needed): Facebook post, optimized
// Marketplace description, ad copy, and short-video scripts (Reels / Shorts /
// YouTube) built from stock data + GM model knowledge when available.

import type { VehicleStock } from "@/features/inventory/vehicle-stock";
import { lookupModelKnowledge } from "@/features/sales/gm-model-knowledge";
import { buildUtmUrl, vehicleLabel } from "./social-publication";

export type VideoScene = {
  /** e.g. "0-3s" */
  timecode: string;
  shot: string;
  voiceoverFr: string;
};

export type VideoScript = {
  platform: "reel_short" | "youtube";
  durationSeconds: number;
  hookFr: string;
  scenes: VideoScene[];
  ctaFr: string;
  captionFr: string;
  hashtags: string[];
};

export type AdCopy = {
  headlineFr: string;
  primaryTextFr: string;
  descriptionFr: string;
  ctaLabelFr: string;
};

export type VehicleContentPack = {
  packId: string;
  workspaceId: string;
  stockId: string;
  vehicleLabel: string;
  /** Facebook Page post caption (ready to auto-publish). */
  facebookPostFr: string;
  /** Marketplace description optimized for messages (hook-first). */
  marketplaceDescriptionFr: string;
  adCopy: AdCopy;
  videoScripts: VideoScript[];
  hashtags: string[];
  /** Angles the seller can reuse in replies (from model knowledge). */
  sellingAnglesFr: string[];
  photoUrls: string[];
  linkUrl?: string;
  utmUrl?: string;
  createdAt: string;
};

const BASE_HASHTAGS = [
  "#BuckinghamGM",
  "#Gatineau",
  "#Outaouais",
  "#AutoQuebec",
  "#Chevrolet",
  "#Buick",
  "#GMC",
];

function formatPriceFr(priceCad: number | undefined): string {
  if (priceCad === undefined) return "prix sur demande";
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(priceCad);
}

function conditionFr(condition: VehicleStock["condition"]): string {
  if (condition === "new") return "Neuf";
  if (condition === "cpo") return "Certifié (CPO)";
  return "Occasion";
}

function buildHashtags(vehicle: VehicleStock): string[] {
  const model = vehicle.model.replace(/\s+/g, "");
  const make = vehicle.make.replace(/\s+/g, "");
  const tags = [
    `#${make}${model}`,
    `#${model}${vehicle.year}`,
    vehicle.condition === "new" ? "#VehiculeNeuf" : "#VehiculeOccasion",
    ...BASE_HASHTAGS,
  ];
  return [...new Set(tags)].slice(0, 12);
}

function knowledgeAngles(vehicle: VehicleStock): string[] {
  const card = lookupModelKnowledge(vehicle);
  if (!card) return [];
  const angles: string[] = [];
  angles.push(card.threeLineStory.useCaseFr);
  for (const fb of card.featureBenefitsFr.slice(0, 3)) {
    angles.push(`${fb.feature} → ${fb.benefit}`);
  }
  return angles;
}

function firstBenefitLine(vehicle: VehicleStock): string {
  const card = lookupModelKnowledge(vehicle);
  if (card) return card.threeLineStory.useCaseFr;
  if (vehicle.condition === "new") {
    return `Le ${vehicle.model} ${vehicle.year} vient d'arriver sur notre lot — style, techno et garantie GM complète.`;
  }
  return `${vehicleLabel(vehicle)} inspecté et prêt à partir — une occasion solide au bon prix.`;
}

function buildFacebookPost(vehicle: VehicleStock, utmUrl?: string): string {
  const label = vehicleLabel(vehicle);
  const price = formatPriceFr(vehicle.priceCad);
  const mileage =
    vehicle.mileageKm !== undefined
      ? `${new Intl.NumberFormat("fr-CA").format(vehicle.mileageKm)} km`
      : null;
  const lines = [
    `🚗 ${label} — ${conditionFr(vehicle.condition)}`,
    "",
    firstBenefitLine(vehicle),
    "",
    `💰 ${price} (+ taxes et frais)`,
    mileage ? `🛣️ ${mileage}` : null,
    vehicle.exteriorColor ? `🎨 ${vehicle.exteriorColor}` : null,
    `📍 Buckingham Chevrolet Buick GMC — Gatineau`,
    "",
    "Essai routier cette semaine ? Écrivez-nous en message privé ou passez nous voir.",
    utmUrl ? `👉 Fiche complète : ${utmUrl}` : null,
    "",
    buildHashtags(vehicle).join(" "),
  ];
  return lines.filter((l) => l !== null).join("\n");
}

function buildMarketplaceDescription(vehicle: VehicleStock, utmUrl?: string): string {
  const label = vehicleLabel(vehicle);
  const price = formatPriceFr(vehicle.priceCad);
  const mileage =
    vehicle.mileageKm !== undefined
      ? `${new Intl.NumberFormat("fr-CA").format(vehicle.mileageKm)} km`
      : vehicle.condition === "new"
        ? "Neuf / bas kilométrage"
        : null;
  const angles = knowledgeAngles(vehicle).slice(0, 2);
  const lines = [
    // Hook first — Marketplace truncates: the first line must sell the click.
    `✅ ${label} · ${price} · disponible MAINTENANT à Gatineau`,
    "",
    ...angles.map((a) => `• ${a}`),
    angles.length > 0 ? "" : null,
    mileage ? `Kilométrage : ${mileage}` : null,
    vehicle.exteriorColor ? `Couleur : ${vehicle.exteriorColor}` : null,
    `Stock : ${vehicle.stockNumber ?? vehicle.stockId}`,
    vehicle.vin ? `NIV : ${vehicle.vin}` : null,
    "",
    "Concessionnaire Buckingham Chevrolet Buick GMC — financement sur place, échange accepté, inspection complète.",
    "Répondez à cette annonce pour réserver votre essai routier (réponse rapide).",
    utmUrl ? `Fiche concession : ${utmUrl}` : null,
    "",
    "Prix + taxes et frais. Prix et disponibilité sujets à changement — confirmer en concession.",
  ];
  return lines.filter((l) => l !== null).join("\n");
}

function buildAdCopy(vehicle: VehicleStock): AdCopy {
  const label = vehicleLabel(vehicle);
  const price = formatPriceFr(vehicle.priceCad);
  return {
    headlineFr:
      vehicle.priceCad !== undefined
        ? `${label} — à partir de ${price}`
        : `${label} — disponible à Gatineau`,
    primaryTextFr: [
      firstBenefitLine(vehicle),
      `Disponible maintenant chez Buckingham GM (Gatineau). Financement sur place, échange accepté.`,
      `Réservez votre essai routier en 30 secondes.`,
    ].join(" "),
    descriptionFr: `${conditionFr(vehicle.condition)} · Stock ${vehicle.stockNumber ?? vehicle.stockId} · Buckingham Chevrolet Buick GMC`,
    ctaLabelFr: "Réserver un essai",
  };
}

function buildReelScript(vehicle: VehicleStock): VideoScript {
  const label = vehicleLabel(vehicle);
  const price = formatPriceFr(vehicle.priceCad);
  const card = lookupModelKnowledge(vehicle);
  const walkaround = card?.walkaroundFr ?? [];

  const scenes: VideoScene[] = [
    {
      timecode: "0-3s",
      shot: "Plan avant 3/4, marche rapide vers le véhicule, phares allumés",
      voiceoverFr:
        vehicle.priceCad !== undefined
          ? `Ce ${vehicle.model} ${vehicle.year} à ${price}… il ne restera pas longtemps.`
          : `Ce ${vehicle.model} ${vehicle.year} vient d'arriver — regarde ça.`,
    },
    {
      timecode: "3-10s",
      shot:
        walkaround[0]?.zone
          ? `Zone « ${walkaround[0].zone} » — plan rapproché`
          : "Tour extérieur rapide (roues, ligne de toit, arrière)",
      voiceoverFr:
        walkaround[0]?.talk ??
        `${conditionFr(vehicle.condition)}, inspecté, prêt à partir aujourd'hui.`,
    },
    {
      timecode: "10-20s",
      shot: "Intérieur : écran central allumé, volant, sièges",
      voiceoverFr:
        walkaround.find((w) => w.zone.toLowerCase().includes("cabine"))?.talk ??
        "CarPlay / Android Auto, écrans modernes — tu restes connecté sans effort.",
    },
    {
      timecode: "20-28s",
      shot: "Plan final devant la concession, pancarte Buckingham GM visible",
      voiceoverFr: `Buckingham GM à Gatineau. Écris-moi « ESSAI » en commentaire ou en privé — je te le réserve.`,
    },
  ];

  return {
    platform: "reel_short",
    durationSeconds: 28,
    hookFr:
      vehicle.priceCad !== undefined
        ? `${label} à ${price} — pourquoi tout le monde le demande`
        : `${label} — le tour en 30 secondes`,
    scenes,
    ctaFr: "Commente « ESSAI » ou écris-nous en privé — réponse rapide garantie.",
    captionFr: [
      `${label} · ${price} · Gatineau 📍`,
      `Essai routier cette semaine — écris « ESSAI » 👇`,
      buildHashtags(vehicle).slice(0, 8).join(" "),
    ].join("\n"),
    hashtags: buildHashtags(vehicle).slice(0, 8),
  };
}

function buildYoutubeScript(vehicle: VehicleStock): VideoScript {
  const label = vehicleLabel(vehicle);
  const price = formatPriceFr(vehicle.priceCad);
  const card = lookupModelKnowledge(vehicle);
  const mustKnow = card?.mustKnowFr ?? [];

  const scenes: VideoScene[] = [
    {
      timecode: "0-5s",
      shot: "Face caméra devant le véhicule",
      voiceoverFr: `${label} : voici ce qu'il faut savoir avant d'acheter — en moins d'une minute.`,
    },
    {
      timecode: "5-20s",
      shot: "Extérieur : tour complet lent, arrêts sur les points forts",
      voiceoverFr:
        mustKnow[0] ??
        `${conditionFr(vehicle.condition)}, ${price}, disponible immédiatement chez Buckingham GM.`,
    },
    {
      timecode: "20-40s",
      shot: "Intérieur : démonstration écran, espace arrière, coffre",
      voiceoverFr:
        mustKnow[1] ??
        "Techno complète, espace surprenant, et la garantie GM Canada qui vient avec.",
    },
    {
      timecode: "40-55s",
      shot: "Face caméra, coordonnées à l'écran",
      voiceoverFr: `Le lien de la fiche est dans la description. Questions ? Commentez ou appelez Buckingham GM à Gatineau — je réponds vite.`,
    },
  ];

  return {
    platform: "youtube",
    durationSeconds: 55,
    hookFr: `${label} — ce que personne ne vous dit avant l'achat`,
    scenes,
    ctaFr: "Lien de la fiche en description — abonnez-vous pour les nouveaux arrivages.",
    captionFr: [
      `${label} disponible chez Buckingham Chevrolet Buick GMC (Gatineau).`,
      `Prix affiché : ${price} (+ taxes et frais).`,
      "Réservez votre essai routier — coordonnées en description.",
    ].join("\n"),
    hashtags: buildHashtags(vehicle).slice(0, 6),
  };
}

export function buildVehicleContentPack(input: {
  packId: string;
  workspaceId: string;
  vehicle: VehicleStock;
  nowIso: string;
}): VehicleContentPack {
  const { vehicle } = input;
  const utmUrl = buildUtmUrl(vehicle.listingUrl, vehicle.stockId, "facebook_page");
  return {
    packId: input.packId,
    workspaceId: input.workspaceId,
    stockId: vehicle.stockId,
    vehicleLabel: vehicleLabel(vehicle),
    facebookPostFr: buildFacebookPost(vehicle, utmUrl),
    marketplaceDescriptionFr: buildMarketplaceDescription(vehicle, utmUrl),
    adCopy: buildAdCopy(vehicle),
    videoScripts: [buildReelScript(vehicle), buildYoutubeScript(vehicle)],
    hashtags: buildHashtags(vehicle),
    sellingAnglesFr: knowledgeAngles(vehicle),
    photoUrls: [...vehicle.photoUrls].slice(0, 20),
    linkUrl: vehicle.listingUrl,
    utmUrl,
    createdAt: input.nowIso,
  };
}
