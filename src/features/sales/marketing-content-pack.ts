// Marketing content packs for Buckingham GM — prepare-only, human publishes.
// Rule-based generation (no API keys). Optimized for Outaouais lead conversion.

import type { VehicleStock } from "@/features/inventory/vehicle-stock";
import { lookupModelKnowledge } from "@/features/sales/gm-model-knowledge";

export type MarketingChannel =
  | "facebook_post"
  | "facebook_ad"
  | "instagram_reel"
  | "youtube_short"
  | "marketplace_hook";

export const MARKETING_CHANNELS: readonly MarketingChannel[] = [
  "facebook_post",
  "facebook_ad",
  "instagram_reel",
  "youtube_short",
  "marketplace_hook",
];

export type MarketingContentPiece = {
  channel: MarketingChannel;
  label: string;
  headline: string;
  body: string;
  callToAction: string;
  hashtags: string[];
  /** Optional shot list / timing for video formats. */
  shotNotes?: string[];
};

export type MarketingContentPack = {
  packId: string;
  stockId: string;
  vehicleTitle: string;
  priceCad?: number;
  pieces: MarketingContentPiece[];
  leadTips: string[];
  createdAt: string;
  requiresManualPublish: true;
  noExecutionAuthorized: true;
};

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
  if (v.condition === "new") return "neuf";
  if (v.condition === "cpo") return "occasion certifiée";
  return "occasion";
}

function mileageLine(v: VehicleStock): string | null {
  if (v.condition === "new") return "kilométrage bas / neuf";
  if (v.mileageKm === undefined) return null;
  return `${new Intl.NumberFormat("fr-CA").format(v.mileageKm)} km`;
}

const BASE_HASHTAGS = [
  "#BuckinghamGM",
  "#Gatineau",
  "#Outaouais",
  "#Chevrolet",
  "#Buick",
  "#GMC",
  "#Voiture",
  "#Auto",
];

function makeHashtags(v: VehicleStock): string[] {
  const makeTag = `#${v.make.replace(/\s+/g, "")}`;
  const modelTag = `#${v.model.replace(/\s+/g, "")}`;
  return [...new Set([...BASE_HASHTAGS, makeTag, modelTag])].slice(0, 12);
}

function hookLine(v: VehicleStock): string {
  const title = vehicleTitle(v);
  const price = formatPrice(v.priceCad);
  const cond = conditionLabel(v);
  if (v.condition === "new") {
    return `🔥 ${title} — ${cond} à ${price} chez Buckingham GM (Gatineau). Essai cette semaine!`;
  }
  const km = mileageLine(v);
  return `✅ ${title} — ${cond}${km ? `, ${km}` : ""} — ${price}. Disponible maintenant à Buckingham GM.`;
}

/**
 * Build a multi-channel marketing pack from inventory stock.
 * All outputs are copy-ready drafts — human publishes on each platform.
 */
export function buildMarketingContentPack(input: {
  packId: string;
  vehicle: VehicleStock;
  nowIso: string;
  channels?: MarketingChannel[];
}): MarketingContentPack {
  const v = input.vehicle;
  const title = vehicleTitle(v);
  const price = formatPrice(v.priceCad);
  const cond = conditionLabel(v);
  const km = mileageLine(v);
  const hashtags = makeHashtags(v);
  const hook = hookLine(v);
  const knowledge = lookupModelKnowledge(v);
  const knowledgeBullets =
    knowledge?.mustKnowFr.slice(0, 3).map((line) => `• ${line}`) ?? [];
  const storyLine = knowledge?.threeLineStory.useCaseFr;
  const dealerLine = "Buckingham Chevrolet Buick GMC — Gatineau / Buckingham, QC";
  const cta =
    "Répondez à ce poste, écrivez-nous en message privé ou appelez pour planifier votre essai.";
  const channels = input.channels ?? [...MARKETING_CHANNELS];

  const pieces: MarketingContentPiece[] = [];

  if (channels.includes("facebook_post")) {
    pieces.push({
      channel: "facebook_post",
      label: "Publication Facebook",
      headline: hook,
      body: [
        hook,
        "",
        `📍 ${dealerLine}`,
        km ? `🛣️ ${km}` : null,
        v.exteriorColor ? `🎨 Couleur : ${v.exteriorColor}` : null,
        `💰 À partir de ${price} (+ taxes et frais)`,
        "",
        "Pourquoi maintenant?",
        `• ${cond.charAt(0).toUpperCase() + cond.slice(1)} disponible sur le lot`,
        storyLine ? `• ${storyLine}` : null,
        ...knowledgeBullets,
        "• Essai routier sur rendez-vous",
        "• Financement et échange bienvenus",
        "",
        cta,
        "",
        hashtags.join(" "),
      ]
        .filter((line) => line !== null)
        .join("\n"),
      callToAction: cta,
      hashtags,
    });
  }

  if (channels.includes("facebook_ad")) {
    pieces.push({
      channel: "facebook_ad",
      label: "Pub Meta (Facebook / Instagram)",
      headline: `${title} — dès ${price}`,
      body: [
        "Titre annonce (max ~40 car.) :",
        `${v.year} ${v.make} ${v.model} — Buckingham GM`,
        "",
        "Texte principal :",
        `${cond.charAt(0).toUpperCase() + cond.slice(1)} ${title} chez Buckingham GM.`,
        km ? `${km}.` : "",
        knowledge?.threeLineStory.whyUsFr ? `${knowledge.threeLineStory.whyUsFr}.` : "",
        `Prix affiché ${price}. Essai rapide — réponse en moins de 2 h.`,
        "",
        "Description lien :",
        "Réservez votre essai à Gatineau",
        "",
        "Audience suggérée :",
        "• 25–55 ans, Gatineau, Hull, Aylmer, Buckingham, Ottawa proche",
        "• Intérêts : véhicules, SUV, camions, financement auto",
        "",
        "CTA bouton : Envoyer message / Appeler maintenant",
      ]
        .filter(Boolean)
        .join("\n"),
      callToAction: "Réservez votre essai — message ou appel",
      hashtags: hashtags.slice(0, 6),
    });
  }

  if (channels.includes("instagram_reel")) {
    pieces.push({
      channel: "instagram_reel",
      label: "Script Reel / Story (30–45 sec)",
      headline: `${title} — walkaround express`,
      body: [
        "HOOK (0–3 sec) :",
        `"Tu cherches un ${v.model} à Gatineau? Regarde ça."`,
        "",
        "CORPS (3–25 sec) :",
        `• Plan extérieur — mentionne ${cond}${km ? `, ${km}` : ""}`,
        `• Prix à l'écran : ${price}`,
        "• 2 features visuelles (phares, intérieur, écran, coffre)",
        `• Badge Buckingham GM + localisation Gatineau`,
        "",
        "CTA (25–35 sec) :",
        '"Écris MARKETPLACE ou ESSAI en commentaire — je te réponds aujourd\'hui."',
        "",
        "Texte à coller sous le Reel :",
        hook,
        "",
        hashtags.join(" "),
      ].join("\n"),
      callToAction: "Commente ESSAI — réponse rapide",
      hashtags,
      shotNotes: [
        "Plan 1 : hero shot avant du véhicule (lumière naturelle)",
        "Plan 2 : badge marque + prix en overlay",
        "Plan 3 : intérieur conducteur 3 sec",
        "Plan 4 : toi devant le véhicule + pointage CTA",
      ],
    });
  }

  if (channels.includes("youtube_short")) {
    pieces.push({
      channel: "youtube_short",
      label: "Script YouTube Short (45–60 sec)",
      headline: `${title} — pourquoi ce lot se vend`,
      body: [
        "Titre YouTube :",
        `${title} ${price} | Buckingham GM Gatineau`,
        "",
        "Script voix off :",
        `"Salut, c'est [ton prénom] chez Buckingham Chevrolet Buick GMC.`,
        `Aujourd'hui : le ${title}, ${cond}${km ? ` avec ${km}` : ""}.`,
        `Prix affiché : ${price}, taxes et frais en sus.`,
        `3 raisons de venir l'essayer : disponibilité immédiate,`,
        `financement sur place, et on sert Gatineau et l'Outaouais depuis des années.`,
        `Lien en bio ou commente ESSAI — on te book un essai cette semaine."`,
        "",
        "Description :",
        `${hook}\n${dealerLine}\n${cta}`,
        "",
        hashtags.join(" "),
      ].join("\n"),
      callToAction: "Commente ESSAI pour réserver",
      hashtags,
      shotNotes: [
        "0–5s : hook face caméra devant le véhicule",
        "5–20s : walkaround latéral",
        "20–35s : intérieur + tableau de bord",
        "35–50s : prix + CTA face caméra",
      ],
    });
  }

  if (channels.includes("marketplace_hook")) {
    pieces.push({
      channel: "marketplace_hook",
      label: "Accroche Marketplace (1re ligne)",
      headline: "Ligne d'accroche pour Messenger",
      body: [
        "Première phrase à mettre en tête de ta fiche Marketplace :",
        hook,
        "",
        "Réponse type au premier message (copier-coller) :",
        `"Salut! Merci pour ton intérêt pour le ${title}.`,
        `Je suis [prénom] chez Buckingham GM à Gatineau.`,
        `Es-tu disponible pour un essai cette semaine — plutôt jour ou soir?"`,
        "",
        "Objectif : obtenir créneau + numéro en 2 messages max.",
      ].join("\n"),
      callToAction: "Booker essai cette semaine",
      hashtags: [],
    });
  }

  const leadTips = [
    "Publie entre 17h et 20h (jeudi–dimanche) pour maximiser les messages Marketplace.",
    "Réponds en moins de 15 min — chaque heure de retard divise les conversions par 2.",
    "Demande toujours : jour préféré + numéro pour confirmer l'essai.",
    "Croise chaque inbound avec la capture lead (packetId) pour ne rien perdre.",
    v.condition === "new"
      ? "Sur les neufs : mentionne garantie et disponibilité immédiate."
      : "Sur l'occasion : mentionne rapport CARFAX / inspection si disponible.",
  ];

  return {
    packId: input.packId,
    stockId: v.stockId,
    vehicleTitle: title,
    priceCad: v.priceCad,
    pieces,
    leadTips,
    createdAt: input.nowIso,
    requiresManualPublish: true,
    noExecutionAuthorized: true,
  };
}
