// Publishing bundle — Agent Publication output for Sales Desk.
// Combines Marketplace listing + social amplification + lead hooks.
// Prepare-only: human publishes on Facebook; no bot/cookies/API auto-post.

import type { VehicleStock } from "@/features/inventory/vehicle-stock";
import type { MarketplaceListingPacket } from "@/features/marketplace-listings/listing-packet";
import { prepareListingFromStock } from "@/features/marketplace-listings/listing-packet";
import { lookupModelKnowledge } from "@/features/sales/gm-model-knowledge";
import {
  buildFacebookPagePost,
  buildReelScript,
  buildMetaAdCopy,
  type MarketingContentBundle,
} from "@/features/sales/marketing-content";

export type PublishingBundleStatus =
  | "draft"
  | "approved_for_publish"
  | "published_manual"
  | "superseded";

export type PublishingBundle = {
  bundleId: string;
  workspaceId: string;
  stockId: string;
  vehicleTitle: string;
  marketplace: MarketplaceListingPacket;
  marketing: MarketingContentBundle;
  leadHookFr: string;
  publishChecklistFr: string[];
  priorityScore: number;
  priorityReasonFr: string;
  status: PublishingBundleStatus;
  createdAt: string;
  updatedAt: string;
  requiresManualPublish: true;
  noExecutionAuthorized: true;
};

export type BuildPublishingBundleInput = {
  bundleId: string;
  workspaceId: string;
  vehicle: VehicleStock;
  packetId?: string;
  locationHint?: string;
  nowIso: string;
};

function formatPrice(priceCad: number | undefined): string {
  if (priceCad === undefined) return "prix sur demande";
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(priceCad);
}

function scorePublishPriority(vehicle: VehicleStock): { score: number; reasonFr: string } {
  let score = 50;
  const reasons: string[] = [];

  if (vehicle.photoUrls.length >= 8) {
    score += 15;
    reasons.push("8+ photos (conversion Marketplace élevée)");
  } else if (vehicle.photoUrls.length >= 3) {
    score += 8;
    reasons.push("photos suffisantes pour publier");
  } else {
    score -= 10;
    reasons.push("enrichir photos avant publication");
  }

  if (typeof vehicle.priceCad === "number") {
    score += 10;
    reasons.push("prix affiché clair");
  } else {
    score -= 5;
    reasons.push("ajouter prix pour plus de leads");
  }

  if (vehicle.condition === "new") {
    score += 12;
    reasons.push("neuf = forte demande locale");
  } else if (vehicle.condition === "cpo") {
    score += 8;
    reasons.push("CPO = angle confiance");
  }

  if (vehicle.listingUrl) {
    score += 5;
    reasons.push("fiche concession liée");
  }

  const knowledge = lookupModelKnowledge(vehicle);
  if (knowledge) {
    score += 7;
    reasons.push(`formation dispo (${knowledge.model})`);
  }

  return {
    score: Math.min(100, Math.max(0, score)),
    reasonFr: reasons.slice(0, 3).join(" · "),
  };
}

function buildLeadHook(vehicle: VehicleStock): string {
  const knowledge = lookupModelKnowledge(vehicle);
  const title = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
  const price = formatPrice(vehicle.priceCad);

  if (knowledge) {
    return [
      `🔥 ${title} — ${price} (+ taxes)`,
      knowledge.threeLineStory.useCaseFr,
      `Réponds « ESSAI » ou appelle Buckingham GM Gatineau — essai cette semaine.`,
    ].join("\n");
  }

  return [
    `🔥 ${title} — ${price} (+ taxes)`,
    `Disponible maintenant chez Buckingham Chevrolet Buick GMC (Gatineau).`,
    `Réponds à l'annonce ou appelle pour réserver ton essai.`,
  ].join("\n");
}

function buildPublishChecklist(vehicle: VehicleStock, packet: MarketplaceListingPacket): string[] {
  const steps = [
    "1. Ouvrir Facebook Marketplace → Créer une annonce → Véhicule.",
    `2. Coller le titre : « ${packet.title} »`,
    packet.priceCad !== undefined
      ? `3. Prix : ${formatPrice(packet.priceCad)} (+ taxes & frais)`
      : "3. Prix : sur demande — confirmer avec le desk.",
    `4. Lieu : ${packet.locationHint}`,
    `5. Téléverser ${packet.photoUrls.length} photo(s) depuis les URLs du bundle.`,
    "6. Coller la description Marketplace (section dédiée du bundle).",
    "7. Publier l'annonce Marketplace.",
    "8. Partager sur la Page Facebook Buckingham avec le post pré-rédigé.",
    "9. Filmer/publier le Reel avec le script fourni (optionnel, +40% portée).",
    "10. Marquer « Publié » dans Sales Desk + capturer chaque message entrant comme lead.",
  ];

  if (vehicle.photoUrls.length < 8) {
    steps.splice(
      4,
      0,
      "⚠️ Ajouter photos VDP si possible (11+ photos = +185% leads selon benchmarks AutoTrader).",
    );
  }

  return steps;
}

/**
 * Build a full publishing bundle for the Publication Agent.
 * Always locks requiresManualPublish — rep approves and publishes manually.
 */
export function buildPublishingBundle(input: BuildPublishingBundleInput): PublishingBundle {
  const v = input.vehicle;
  const marketplace = prepareListingFromStock({
    packetId: input.packetId ?? `mkt_${v.stockId}_${input.nowIso.replace(/[:.]/g, "")}`,
    workspaceId: input.workspaceId,
    vehicle: v,
    locationHint: input.locationHint ?? "Gatineau / Buckingham, QC",
    nowIso: input.nowIso,
  });

  const marketing = {
    facebookPost: buildFacebookPagePost(v),
    reelScript: buildReelScript(v),
    youtubeShortScript: buildReelScript(v, { platform: "youtube" }),
    metaAd: buildMetaAdCopy(v),
  };

  const priority = scorePublishPriority(v);
  const trim = v.trim ? ` ${v.trim}` : "";
  const vehicleTitle = `${v.year} ${v.make} ${v.model}${trim}`.trim();

  return {
    bundleId: input.bundleId,
    workspaceId: input.workspaceId,
    stockId: v.stockId,
    vehicleTitle,
    marketplace,
    marketing,
    leadHookFr: buildLeadHook(v),
    publishChecklistFr: buildPublishChecklist(v, marketplace),
    priorityScore: priority.score,
    priorityReasonFr: priority.reasonFr,
    status: "draft",
    createdAt: input.nowIso,
    updatedAt: input.nowIso,
    requiresManualPublish: true,
    noExecutionAuthorized: true,
  };
}

/** Full copy-paste payload for the rep's publish session. */
export function formatPublishingBundleClipboard(bundle: PublishingBundle): string {
  const m = bundle.marketing;
  return [
    "═══ BUNDLE PUBLICATION BUCKINGHAM GM ═══",
    `Véhicule : ${bundle.vehicleTitle} (${bundle.stockId})`,
    `Priorité : ${bundle.priorityScore}/100 — ${bundle.priorityReasonFr}`,
    "",
    "── MARKETPLACE ──",
    `Titre : ${bundle.marketplace.title}`,
    bundle.marketplace.priceCad !== undefined
      ? `Prix : ${formatPrice(bundle.marketplace.priceCad)}`
      : "Prix : sur demande",
    `Lieu : ${bundle.marketplace.locationHint}`,
    "",
    "Description :",
    bundle.marketplace.description,
    "",
    `Photos (${bundle.marketplace.photoUrls.length}) :`,
    ...bundle.marketplace.photoUrls.map((u, i) => `  ${i + 1}. ${u}`),
    "",
    "── POST PAGE FACEBOOK ──",
    m.facebookPost.body,
    m.facebookPost.hashtags.join(" "),
    "",
    "── SCRIPT REEL (30-45s) ──",
    m.reelScript.hookFr,
    ...m.reelScript.beatsFr.map((b, i) => `${i + 1}. ${b}`),
    `CTA : ${m.reelScript.ctaFr}`,
    "",
    "── PUB META (brouillon) ──",
    `Titre : ${m.metaAd.headlineFr}`,
    `Texte : ${m.metaAd.primaryTextFr}`,
    `Description : ${m.metaAd.descriptionFr}`,
    "",
    "── ACCROCHE LEAD ──",
    bundle.leadHookFr,
    "",
    "── CHECKLIST ──",
    ...bundle.publishChecklistFr,
    "",
    "Oria ne publie pas automatiquement — tu valides et publies sur Facebook.",
  ].join("\n");
}
