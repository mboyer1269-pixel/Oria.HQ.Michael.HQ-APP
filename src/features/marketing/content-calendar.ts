// src/features/marketing/content-calendar.ts
//
// Marketing director — 7-day content calendar built from the live inventory.
// Pure and deterministic: mixes vehicle spotlights, video days, trust posts
// and lead-magnet CTAs so the page feeds prospects all week without spamming
// the same stock twice.

import type { VehicleStock } from "@/features/inventory/vehicle-stock";
import { buildAutoPilotPlan } from "./social-publication";
import { vehicleLabel } from "./social-publication";

export type CalendarSlotKind =
  | "vehicle_spotlight"
  | "reel_video"
  | "trust_story"
  | "lead_magnet"
  | "market_insight";

export type ContentCalendarSlot = {
  /** 0 = today. */
  dayOffset: number;
  dayLabelFr: string;
  kind: CalendarSlotKind;
  titleFr: string;
  /** What to post / film — concrete instruction for the operator. */
  briefFr: string;
  /** Stock tied to the slot when applicable. */
  stockId?: string;
  vehicleLabel?: string;
  channelHint: "facebook_page" | "marketplace" | "reel_short" | "youtube";
};

export type ContentCalendar = {
  calendarId: string;
  workspaceId: string;
  generatedAt: string;
  slots: ContentCalendarSlot[];
  operatorNotesFr: string[];
};

const DAY_LABELS_FR = [
  "Dimanche",
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
];

function dayLabelFor(nowIso: string, offset: number): string {
  const base = new Date(nowIso);
  const d = new Date(base.getTime() + offset * 86_400_000);
  const label = DAY_LABELS_FR[d.getUTCDay()] ?? "Jour";
  return offset === 0 ? `${label} (aujourd'hui)` : label;
}

const TRUST_STORY_BRIEF =
  "Photo d'une livraison récente (client souriant avec ses clés, avec accord) ou de l'équipe. " +
  "Texte court : remercier le client, mentionner le modèle vendu, inviter aux questions en privé.";

const LEAD_MAGNET_BRIEF =
  "Post « Évaluation d'échange gratuite en 24h » : demandez année/marque/modèle/kilométrage en message privé. " +
  "Chaque réponse devient un lead à capturer dans le Sales Desk (source web_form).";

const MARKET_INSIGHT_BRIEF =
  "Utilise le Brief marché (AutoTrader Gatineau) du Sales Desk : partage 1 chiffre honnête " +
  "(ex. prix médian du segment) + pourquoi ton stock se compare bien. Crédibilité = leads qualifiés.";

/**
 * Build the 7-day plan. Vehicle slots come from the auto-pilot scoring so the
 * calendar spotlights the stock most likely to generate messages.
 */
export function buildContentCalendar(input: {
  calendarId: string;
  workspaceId: string;
  vehicles: readonly VehicleStock[];
  nowIso: string;
}): ContentCalendar {
  const picks = buildAutoPilotPlan({
    vehicles: input.vehicles,
    recentPublications: [],
    nowIso: input.nowIso,
    maxPerRun: 4,
  });

  const slots: ContentCalendarSlot[] = [];
  const [first, second, third, fourth] = picks;

  slots.push(
    first
      ? {
          dayOffset: 0,
          dayLabelFr: dayLabelFor(input.nowIso, 0),
          kind: "vehicle_spotlight",
          titleFr: `Spotlight — ${vehicleLabel(first.vehicle)}`,
          briefFr:
            `Publier la fiche préparée (photos + prix + CTA essai). Raisons du choix : ${first.reasons.join(", ")}.`,
          stockId: first.vehicle.stockId,
          vehicleLabel: vehicleLabel(first.vehicle),
          channelHint: "facebook_page",
        }
      : {
          dayOffset: 0,
          dayLabelFr: dayLabelFor(input.nowIso, 0),
          kind: "lead_magnet",
          titleFr: "Évaluation d'échange gratuite",
          briefFr: LEAD_MAGNET_BRIEF,
          channelHint: "facebook_page",
        },
  );

  slots.push({
    dayOffset: 1,
    dayLabelFr: dayLabelFor(input.nowIso, 1),
    kind: "reel_video",
    titleFr: second
      ? `Reel 30s — ${vehicleLabel(second.vehicle)}`
      : "Reel 30s — tour du lot (nouveaux arrivages)",
    briefFr: second
      ? "Filmer le script Reel généré par le pack contenu (hook 3s, tour extérieur, intérieur, CTA « ESSAI »)."
      : "Filmer 30s de nouveaux arrivages en marchant sur le lot — hook : « 3 arrivages que tout le monde va demander ».",
    stockId: second?.vehicle.stockId,
    vehicleLabel: second ? vehicleLabel(second.vehicle) : undefined,
    channelHint: "reel_short",
  });

  slots.push({
    dayOffset: 2,
    dayLabelFr: dayLabelFor(input.nowIso, 2),
    kind: "trust_story",
    titleFr: "Preuve sociale — livraison / équipe",
    briefFr: TRUST_STORY_BRIEF,
    channelHint: "facebook_page",
  });

  slots.push(
    third
      ? {
          dayOffset: 3,
          dayLabelFr: dayLabelFor(input.nowIso, 3),
          kind: "vehicle_spotlight",
          titleFr: `Spotlight — ${vehicleLabel(third.vehicle)}`,
          briefFr: `Publier la fiche Marketplace préparée + post Page. Raisons : ${third.reasons.join(", ")}.`,
          stockId: third.vehicle.stockId,
          vehicleLabel: vehicleLabel(third.vehicle),
          channelHint: "marketplace",
        }
      : {
          dayOffset: 3,
          dayLabelFr: dayLabelFor(input.nowIso, 3),
          kind: "market_insight",
          titleFr: "Chiffre marché de la semaine",
          briefFr: MARKET_INSIGHT_BRIEF,
          channelHint: "facebook_page",
        },
  );

  slots.push({
    dayOffset: 4,
    dayLabelFr: dayLabelFor(input.nowIso, 4),
    kind: "lead_magnet",
    titleFr: "Évaluation d'échange gratuite",
    briefFr: LEAD_MAGNET_BRIEF,
    channelHint: "facebook_page",
  });

  slots.push({
    dayOffset: 5,
    dayLabelFr: dayLabelFor(input.nowIso, 5),
    kind: "reel_video",
    titleFr: fourth
      ? `Vidéo YouTube 60s — ${vehicleLabel(fourth.vehicle)}`
      : "Vidéo YouTube 60s — question fréquente des clients",
    briefFr: fourth
      ? "Filmer le script YouTube généré (must-know + tour + CTA fiche en description)."
      : "Répondre en 60s à une vraie question client (ex. « AWD ou pneus d'hiver ? ») — positionne l'expert.",
    stockId: fourth?.vehicle.stockId,
    vehicleLabel: fourth ? vehicleLabel(fourth.vehicle) : undefined,
    channelHint: "youtube",
  });

  slots.push({
    dayOffset: 6,
    dayLabelFr: dayLabelFor(input.nowIso, 6),
    kind: "market_insight",
    titleFr: "Chiffre marché de la semaine",
    briefFr: MARKET_INSIGHT_BRIEF,
    channelHint: "facebook_page",
  });

  const operatorNotesFr = [
    "Règle d'or : chaque post doit finir par un appel à l'action qui déclenche un message privé.",
    "Chaque message privé reçu = lead à capturer immédiatement (source marketplace_message ou web_form).",
    "Ne publie jamais le même véhicule 2 jours de suite — la variété nourrit l'algorithme.",
    picks.length === 0
      ? "Inventaire vide : lance « Sync site web » pour alimenter le calendrier avec du vrai stock."
      : `Véhicules priorisés cette semaine : ${picks.map((p) => p.vehicle.stockId).join(", ")}.`,
  ];

  return {
    calendarId: input.calendarId,
    workspaceId: input.workspaceId,
    generatedAt: input.nowIso,
    slots,
    operatorNotesFr,
  };
}
