// Marketing content — Directeur Marketing output for Sales Desk.
// Pure generators: FB posts, Reels, YouTube Shorts, Meta Ads copy.
// Quebec / Gatineau / Buckingham GM context. No external I/O.

import type { VehicleStock } from "@/features/inventory/vehicle-stock";
import { lookupModelKnowledge } from "@/features/sales/gm-model-knowledge";

export type FacebookPostDraft = {
  body: string;
  hashtags: string[];
  bestPostTimeFr: string;
  ctaFr: string;
};

export type ReelScriptDraft = {
  hookFr: string;
  beatsFr: string[];
  ctaFr: string;
  durationSec: number;
  onScreenTextFr: string[];
  musicSuggestionFr: string;
};

export type MetaAdCopyDraft = {
  headlineFr: string;
  primaryTextFr: string;
  descriptionFr: string;
  audienceHintFr: string;
  budgetHintFr: string;
};

export type MarketingContentBundle = {
  facebookPost: FacebookPostDraft;
  reelScript: ReelScriptDraft;
  youtubeShortScript: ReelScriptDraft;
  metaAd: MetaAdCopyDraft;
};

const DEALER_NAME = "Buckingham Chevrolet Buick GMC";
const LOCATION = "Gatineau / Outaouais";
const PHONE_HINT = "819-986-4111";
const WEBSITE = "buckinghamgm.com";

const BASE_HASHTAGS = [
  "#BuckinghamGM",
  "#Gatineau",
  "#Outaouais",
  "#VoitureNeuve",
  "#Concessionnaire",
  "#EssaiRoutier",
];

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
  return `${v.year} ${v.make} ${v.model}${trim}`;
}

function conditionLabel(v: VehicleStock): string {
  if (v.condition === "new") return "NEUF";
  if (v.condition === "cpo") return "CPO certifié";
  return "OCCASION";
}

function makeHashtags(v: VehicleStock): string[] {
  const tags = [...BASE_HASHTAGS];
  tags.push(`#${v.make.replace(/\s+/g, "")}`);
  tags.push(`#${v.model.replace(/\s+/g, "")}`);
  if (v.condition === "new") tags.push("#Neuf2026", "#GMCanada");
  if (v.make === "Chevrolet") tags.push("#Chevy");
  if (v.make === "GMC") tags.push("#GMC");
  if (v.make === "Buick") tags.push("#Buick");
  return tags;
}

function bestPostTime(): string {
  return "Mardi–Jeudi 11h30–13h ou 18h–20h (pic engagement local Outaouais)";
}

/** Facebook Page post optimized for shares and Messenger leads. */
export function buildFacebookPagePost(vehicle: VehicleStock): FacebookPostDraft {
  const knowledge = lookupModelKnowledge(vehicle);
  const title = vehicleTitle(vehicle);
  const price = formatPrice(vehicle.priceCad);
  const cond = conditionLabel(vehicle);

  const angle = knowledge
    ? knowledge.threeLineStory.useCaseFr
    : `Disponible maintenant chez ${DEALER_NAME}.`;

  const body = [
    `🚗 ${cond} — ${title}`,
    ``,
    `💰 ${price} (+ taxes & frais)`,
    knowledge ? `✨ ${angle}` : angle,
    vehicle.mileageKm !== undefined
      ? `📍 ${new Intl.NumberFormat("fr-CA").format(vehicle.mileageKm)} km`
      : vehicle.condition === "new"
        ? `📍 Kilométrage neuf`
        : null,
    ``,
    `👉 Essai routier cette semaine à ${LOCATION}.`,
    `📞 ${PHONE_HINT} · ${WEBSITE}`,
    ``,
    `Réponds en commentaire ou envoie-nous un message — on te réserve un créneau.`,
  ]
    .filter((line) => line !== null)
    .join("\n");

  return {
    body,
    hashtags: makeHashtags(vehicle),
    bestPostTimeFr: bestPostTime(),
    ctaFr: "Réserve ton essai — message privé ou appel",
  };
}

type ReelOptions = { platform?: "facebook" | "youtube" };

/** 30–45s Reel / Short script with walkaround beats. */
export function buildReelScript(
  vehicle: VehicleStock,
  opts?: ReelOptions,
): ReelScriptDraft {
  const knowledge = lookupModelKnowledge(vehicle);
  const title = vehicleTitle(vehicle);
  const price = formatPrice(vehicle.priceCad);
  const platform = opts?.platform ?? "facebook";

  const hook =
    vehicle.condition === "new"
      ? `Ce ${vehicle.model} neuf à ${price} va te surprendre 👀`
      : `${title} — ${price} — prêt pour l'essai`;

  const beats: string[] = [];
  if (knowledge?.walkaroundFr.length) {
    for (const w of knowledge.walkaroundFr.slice(0, 3)) {
      beats.push(`${w.zone} : ${w.talk}`);
    }
  } else {
    beats.push(
      `Plan large devant le concessionnaire — montrer la face du ${vehicle.model}`,
      `Ouvrir la porte, écran/tech si dispo`,
      `Coffre + sièges arrière — espace famille`,
    );
  }
  beats.push(`Prix ${price} chez ${DEALER_NAME} — ${LOCATION}`);

  const onScreen = [
    title,
    price,
    "ESSAI GRATUIT",
    DEALER_NAME,
  ];

  const cta =
    platform === "youtube"
      ? `Lien en description · ${WEBSITE} · Appelle ${PHONE_HINT}`
      : `Écris ESSAI en commentaire ou DM — on te réserve`;

  return {
    hookFr: hook,
    beatsFr: beats,
    ctaFr: cta,
    durationSec: 35,
    onScreenTextFr: onScreen,
    musicSuggestionFr: "Trending upbeat (sans copyright) — énergie positive, tempo 100-120 BPM",
  };
}

/** Meta Ads copy draft — rep reviews before any spend. */
export function buildMetaAdCopy(vehicle: VehicleStock): MetaAdCopyDraft {
  const knowledge = lookupModelKnowledge(vehicle);
  const title = vehicleTitle(vehicle);
  const price = formatPrice(vehicle.priceCad);

  const headline =
    vehicle.condition === "new"
      ? `${vehicle.model} neuf dès ${price}`
      : `${title} — ${price}`;

  const primary = [
    `🚗 ${title} disponible chez ${DEALER_NAME}.`,
    knowledge ? knowledge.threeLineStory.whyUsFr : `Stock local · essai rapide · financement GM.`,
    `Clique pour réserver ton essai à ${LOCATION}.`,
  ].join(" ");

  const audience =
    vehicle.condition === "new"
      ? `25-55 ans, Gatineau + 25 km, intérêts auto/SUV, familles`
      : `30-60 ans, Outaouais, acheteurs occasion/CPO, budget ${price}`;

  return {
    headlineFr: headline.slice(0, 40),
    primaryTextFr: primary.slice(0, 250),
    descriptionFr: `Essai cette semaine · ${PHONE_HINT} · Taxes en sus`,
    audienceHintFr: audience,
    budgetHintFr: "Début suggéré : 15-25$/jour · 5-7 jours · objectif messages/leads",
  };
}

/** Full marketing bundle for one vehicle. */
export function buildMarketingContentBundle(vehicle: VehicleStock): MarketingContentBundle {
  return {
    facebookPost: buildFacebookPagePost(vehicle),
    reelScript: buildReelScript(vehicle),
    youtubeShortScript: buildReelScript(vehicle, { platform: "youtube" }),
    metaAd: buildMetaAdCopy(vehicle),
  };
}

/** Format marketing bundle for clipboard. */
export function formatMarketingBundleClipboard(bundle: MarketingContentBundle, vehicleTitle: string): string {
  return [
    `═══ DIRECTEUR MARKETING — ${vehicleTitle} ═══`,
    "",
    "── POST FACEBOOK ──",
    bundle.facebookPost.body,
    bundle.facebookPost.hashtags.join(" "),
    `Meilleur moment : ${bundle.facebookPost.bestPostTimeFr}`,
  "",
    "── REEL / SHORT ──",
    `Hook : ${bundle.reelScript.hookFr}`,
    ...bundle.reelScript.beatsFr.map((b, i) => `  ${i + 1}. ${b}`),
    `CTA : ${bundle.reelScript.ctaFr}`,
    `Texte à l'écran : ${bundle.reelScript.onScreenTextFr.join(" | ")}`,
    "",
    "── YOUTUBE SHORT ──",
    `Hook : ${bundle.youtubeShortScript.hookFr}`,
    `CTA : ${bundle.youtubeShortScript.ctaFr}`,
    "",
    "── PUB META (brouillon — valider budget avant diffusion) ──",
    `Titre : ${bundle.metaAd.headlineFr}`,
    `Texte : ${bundle.metaAd.primaryTextFr}`,
    `Audience : ${bundle.metaAd.audienceHintFr}`,
    `Budget : ${bundle.metaAd.budgetHintFr}`,
  ].join("\n");
}
