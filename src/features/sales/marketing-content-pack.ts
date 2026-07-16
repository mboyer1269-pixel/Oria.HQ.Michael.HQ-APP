// src/features/sales/marketing-content-pack.ts
//
// Sales adjoint marketing packs — prepare-only copy for FB Page, Marketplace,
// ads, and warm prospecting SMS that fills the appointment book ("livre").
// Pure / deterministic. No I/O, no auto-publish, no auto-send.

import type { VehicleStock } from "@/features/inventory/vehicle-stock";
import { lookupModelKnowledge } from "@/features/sales/gm-model-knowledge";

export type MarketingAdCopy = {
  headlineFr: string;
  primaryTextFr: string;
  descriptionFr: string;
  ctaLabelFr: string;
};

export type MarketingVideoScene = {
  timecode: string;
  shot: string;
  voiceoverFr: string;
};

export type MarketingVideoScript = {
  platform: "reel_short";
  durationSeconds: number;
  hookFr: string;
  scenes: MarketingVideoScene[];
  ctaFr: string;
  captionFr: string;
  hashtags: string[];
};

export type SalesMarketingPack = {
  packId: string;
  stockId: string;
  vehicleLabel: string;
  /** Facebook Page post — human copies/pastes. */
  facebookPostFr: string;
  /** First Marketplace line (hook before truncation). */
  marketplaceHookFr: string;
  /** Full Marketplace description. */
  marketplaceDescriptionFr: string;
  /** Warm SMS to invite a known contact for a test-drive slot (livre). */
  prospectingSmsFr: string;
  adCopy: MarketingAdCopy;
  videoScript: MarketingVideoScript;
  sellingAnglesFr: string[];
  hashtags: string[];
  photoUrls: string[];
  createdAt: string;
  requiresManualPublish: true;
  noExecutionAuthorized: true;
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

function vehicleLabel(vehicle: VehicleStock): string {
  const trim = vehicle.trim ? ` ${vehicle.trim}` : "";
  return `${vehicle.year} ${vehicle.make} ${vehicle.model}${trim}`;
}

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
  const angles: string[] = [card.threeLineStory.useCaseFr];
  for (const fb of card.featureBenefitsFr.slice(0, 3)) {
    angles.push(`${fb.feature} → ${fb.benefit}`);
  }
  return angles;
}

function firstBenefitLine(vehicle: VehicleStock): string {
  const card = lookupModelKnowledge(vehicle);
  if (card) return card.threeLineStory.useCaseFr;
  if (vehicle.condition === "new") {
    return `Le ${vehicle.model} ${vehicle.year} vient d'arriver sur notre lot — style, techno et garantie GM.`;
  }
  return `${vehicleLabel(vehicle)} inspecté et prêt à partir — une occasion solide au bon prix.`;
}

export type BuildMarketingPackInput = {
  vehicle: VehicleStock;
  workspaceId: string;
  nowIso: string;
  packId?: string;
  /** Optional first name for personalized prospecting SMS. */
  prospectFirstName?: string;
};

/**
 * Build a copy-ready marketing + prospecting pack for one vehicle.
 * Always prepare-only — never publishes or sends.
 */
export function buildSalesMarketingPack(input: BuildMarketingPackInput): SalesMarketingPack {
  const { vehicle, nowIso } = input;
  const label = vehicleLabel(vehicle);
  const price = formatPriceFr(vehicle.priceCad);
  const angles = knowledgeAngles(vehicle);
  const hashtags = buildHashtags(vehicle);
  const mileage =
    vehicle.mileageKm !== undefined
      ? `${new Intl.NumberFormat("fr-CA").format(vehicle.mileageKm)} km`
      : null;

  const marketplaceHookFr = `✅ ${label} · ${price} · disponible MAINTENANT à Gatineau`;

  const marketplaceDescriptionFr = [
    marketplaceHookFr,
    "",
    ...angles.slice(0, 2).map((a) => `• ${a}`),
    angles.length > 0 ? "" : null,
    mileage ? `Kilométrage : ${mileage}` : null,
    vehicle.exteriorColor ? `Couleur : ${vehicle.exteriorColor}` : null,
    `Stock : ${vehicle.stockNumber ?? vehicle.stockId}`,
    vehicle.vin ? `NIV : ${vehicle.vin}` : null,
    "",
    "Concessionnaire Buckingham Chevrolet Buick GMC — financement sur place, échange accepté.",
    "Répondez pour réserver votre essai routier (réponse rapide). On remplit le livre cette semaine.",
    "",
    "Prix + taxes et frais. Disponibilité à confirmer en concession.",
  ]
    .filter((l) => l !== null)
    .join("\n");

  const facebookPostFr = [
    `${label} — ${conditionFr(vehicle.condition)}`,
    "",
    firstBenefitLine(vehicle),
    "",
    `Prix : ${price} (+ taxes et frais)`,
    mileage ? `Km : ${mileage}` : null,
    vehicle.exteriorColor ? `Couleur : ${vehicle.exteriorColor}` : null,
    "📍 Buckingham Chevrolet Buick GMC — Gatineau / Buckingham",
    "",
    "Essai cette semaine ? Écrivez en message privé — on réserve votre créneau dans le livre.",
    "",
    hashtags.join(" "),
  ]
    .filter((l) => l !== null)
    .join("\n");

  const first = input.prospectFirstName?.trim() || "bonjour";
  const prospectingSmsFr =
    first === "bonjour"
      ? `Bonjour, le ${label} à ${price} est encore disponible chez Buckingham GM. ` +
        `Je peux vous bloquer un essai cette semaine dans mon livre — quel jour vous arrange ?`
      : `Bonjour ${first}, le ${label} à ${price} est encore disponible chez Buckingham GM. ` +
        `Je peux vous bloquer un essai cette semaine dans mon livre — quel jour vous arrange ?`;

  const adCopy: MarketingAdCopy = {
    headlineFr:
      vehicle.priceCad !== undefined
        ? `${label} — à partir de ${price}`
        : `${label} — disponible à Gatineau`,
    primaryTextFr: [
      firstBenefitLine(vehicle),
      "Disponible maintenant chez Buckingham GM (Gatineau). Financement sur place, échange accepté.",
      "Réservez votre essai — on remplit le livre cette semaine.",
    ].join(" "),
    descriptionFr: `${conditionFr(vehicle.condition)} · Stock ${vehicle.stockNumber ?? vehicle.stockId} · Buckingham Chevrolet Buick GMC`,
    ctaLabelFr: "Réserver un essai",
  };

  const card = lookupModelKnowledge(vehicle);
  const walkaround = card?.walkaroundFr ?? [];
  const videoScript: MarketingVideoScript = {
    platform: "reel_short",
    durationSeconds: 20,
    hookFr:
      vehicle.priceCad !== undefined
        ? `Ce ${vehicle.model} ${vehicle.year} à ${price}… il ne restera pas longtemps.`
        : `Ce ${vehicle.model} ${vehicle.year} vient d'arriver — regarde ça.`,
    scenes: [
      {
        timecode: "0-3s",
        shot: "Plan avant 3/4, marche rapide vers le véhicule",
        voiceoverFr:
          vehicle.priceCad !== undefined
            ? `Ce ${vehicle.model} ${vehicle.year} à ${price}… il ne restera pas longtemps.`
            : `Ce ${vehicle.model} ${vehicle.year} vient d'arriver — regarde ça.`,
      },
      {
        timecode: "3-10s",
        shot: walkaround[0]?.zone
          ? `Walkaround ${walkaround[0].zone}`
          : "Walkaround latéral + intérieur tableau de bord",
        voiceoverFr:
          walkaround[0]?.talk ??
          angles[0] ??
          `Conçu pour le quotidien Outaouais — pratique, fiable, prêt à partir.`,
      },
      {
        timecode: "10-18s",
        shot: "Détail clé puis CTA face caméra",
        voiceoverFr:
          walkaround[1]?.talk ??
          `Passe nous voir à Buckingham GM — on te réserve un essai dans le livre cette semaine.`,
      },
    ],
    ctaFr: "Message privé → on bloque ton créneau",
    captionFr: `${label} · ${price} · Buckingham GM Gatineau\n${hashtags.slice(0, 6).join(" ")}`,
    hashtags,
  };

  return {
    packId:
      input.packId ??
      `mkt_${vehicle.stockId}_${nowIso.replace(/[:.]/g, "")}`,
    stockId: vehicle.stockId,
    vehicleLabel: label,
    facebookPostFr,
    marketplaceHookFr,
    marketplaceDescriptionFr,
    prospectingSmsFr,
    adCopy,
    videoScript,
    sellingAnglesFr: angles,
    hashtags,
    photoUrls: vehicle.photoUrls ?? [],
    createdAt: nowIso,
    requiresManualPublish: true,
    noExecutionAuthorized: true,
  };
}
