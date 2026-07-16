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

export type QuickReply = {
  /** Buyer message this answers, e.g. "Est-ce encore disponible ?" */
  triggerFr: string;
  /** Copy-ready reply that pushes toward a booked test drive. */
  replyFr: string;
};

export type FollowUpStep = {
  /** e.g. "J0 — 1h après contact" */
  whenFr: string;
  channel: "sms" | "messenger";
  messageFr: string;
  goalFr: string;
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
  /** Réponses rapides aux messages entrants (< 5 min = RDV). */
  quickRepliesFr: QuickReply[];
  /** Objections fréquentes + réponse courte (depuis fiches modèle GM). */
  objectionRepliesFr: Array<{ objection: string; reply: string }>;
  /** Séquence de relance J0 → J5 pour convertir inbound en essai. */
  followUpSequenceFr: FollowUpStep[];
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

  // Réponses rapides — le premier à répondre gagne le RDV.
  const quickRepliesFr: QuickReply[] = [
    {
      triggerFr: "Est-ce encore disponible ?",
      replyFr:
        `Oui, le ${label} est encore disponible ! Je peux vous le réserver pour un essai ` +
        `aujourd'hui ou demain — quel moment vous convient ? (Je bloque le créneau tout de suite.)`,
    },
    {
      triggerFr: "C'est quoi votre meilleur prix ?",
      replyFr:
        `Le prix affiché est ${price} + taxes/frais — déjà positionné sur le marché Gatineau. ` +
        `Venez le voir : si le véhicule vous convient, on regarde financement + échange ensemble et ` +
        `je vous fais le meilleur scénario total. Quel jour pour l'essai ?`,
    },
    {
      triggerFr: "Acceptez-vous les échanges ?",
      replyFr:
        `Oui — échange accepté et évalué sur place en 20 minutes. Amenez le véhicule lors de ` +
        `votre essai du ${vehicle.model}, vous repartez avec un chiffre ferme. Quel créneau vous arrange ?`,
    },
    {
      triggerFr: "Financement possible ?",
      replyFr:
        `Financement sur place (GM Canada + banques). Pré-approbation possible avant même de vous ` +
        `déplacer — envoyez-moi simplement un bon moment pour vous appeler 5 minutes.`,
    },
    {
      triggerFr: "Il est où exactement ?",
      replyFr:
        `Chez Buckingham Chevrolet Buick GMC, à Gatineau (secteur Buckingham). Je peux préparer le ` +
        `véhicule à l'avant pour votre arrivée — dites-moi quand vous passez.`,
    },
  ];

  // Objections — fiche formation GM d'abord, complétées par les classiques du plancher.
  const genericObjectionsFr =
    vehicle.condition === "new"
      ? [
          {
            objection: "C'est trop cher pour moi.",
            reply:
              "Regardons le paiement mensuel plutôt que le prix total — avec les taux GM et votre échange, ça change souvent tout.",
          },
          {
            objection: "Je veux y penser.",
            reply:
              "Parfait — je vous bloque un essai sans engagement. C'est le meilleur moyen de savoir si ça vaut la réflexion.",
          },
          {
            objection: "Je magasine encore ailleurs.",
            reply:
              "Bonne idée de comparer ! Venez faire l'essai ici d'abord — vous aurez une vraie référence, et mon chiffre échange en main.",
          },
        ]
      : [
          {
            objection: "Pourquoi ce prix pour un usagé ?",
            reply:
              "Inspection complète + historique dispo — je vous montre le dossier sur place. Comparez avec le marché : le prix se défend.",
          },
          {
            objection: "Je veux y penser.",
            reply:
              "Aucun souci — les occasions à ce prix partent vite par contre. Je peux vous le tenir 24h avec un essai réservé ?",
          },
          {
            objection: "Il y a moins cher sur Marketplace.",
            reply:
              "Chez un particulier, oui — sans inspection, sans garantie, sans recours. Ici : dossier complet + financement. La différence se paie une fois.",
          },
        ];
  const cardObjections =
    card?.objectionsFr.slice(0, 4).map((o) => ({ objection: o.objection, reply: o.reply })) ?? [];
  const seenObjections = new Set(cardObjections.map((o) => o.objection));
  const objectionRepliesFr = [
    ...cardObjections,
    ...genericObjectionsFr.filter((o) => !seenObjections.has(o.objection)),
  ].slice(0, 5);

  // Séquence de relance — inbound → essai booké.
  const followUpSequenceFr: FollowUpStep[] = [
    {
      whenFr: "J0 — dans les 5 minutes",
      channel: "messenger",
      messageFr:
        `Oui, le ${label} est disponible ! Voulez-vous passer le voir aujourd'hui ou demain ? ` +
        `Je réserve votre créneau d'essai tout de suite.`,
      goalFr: "Répondre avant tout le monde — proposer 2 choix de créneau.",
    },
    {
      whenFr: "J0 — 2-3h sans réponse",
      channel: "messenger",
      messageFr:
        `Je garde le ${vehicle.model} à l'œil pour vous — il y a d'autres demandes dessus. ` +
        `Souhaitez-vous que je vous bloque un essai avant le week-end ?`,
      goalFr: "Urgence honnête (vrai intérêt marché) + créneau concret.",
    },
    {
      whenFr: "J2 — relance valeur",
      channel: "sms",
      messageFr:
        `Bonjour, c'est au sujet du ${label} chez Buckingham GM. J'ai les détails financement / ` +
        `échange si ça peut aider votre décision. Un essai cette semaine ?`,
      goalFr: "Ajouter de la valeur (financement/échange), pas juste « suivre ».",
    },
    {
      whenFr: "J5 — dernière touche propre",
      channel: "sms",
      messageFr:
        `Dernier message promis ! Le ${vehicle.model} est toujours là. Si le timing est mauvais, ` +
        `dites-le-moi et je vous recontacte quand VOUS voulez. Sinon, mon livre a des places jeudi/vendredi.`,
      goalFr: "Sortie propre ou conversion — jamais de spam après.",
    },
  ];

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
    quickRepliesFr,
    objectionRepliesFr,
    followUpSequenceFr,
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
