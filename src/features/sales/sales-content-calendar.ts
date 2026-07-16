// src/features/sales/sales-content-calendar.ts
//
// 7-day marketing calendar for the sales adjoint — prepare-only.
// Deterministic from inventory: spotlights, reels, trust, lead magnets.
// No auto-publish. Operator copies briefs into FB / Marketplace / Reels.

import type { VehicleStock } from "@/features/inventory/vehicle-stock";

export type CalendarSlotKind =
  | "vehicle_spotlight"
  | "reel_video"
  | "trust_story"
  | "lead_magnet"
  | "market_insight"
  | "livre_fill";

export type SalesContentCalendarSlot = {
  dayOffset: number;
  dayLabelFr: string;
  kind: CalendarSlotKind;
  titleFr: string;
  briefFr: string;
  stockId?: string;
  vehicleLabel?: string;
  channelHint: "facebook_page" | "marketplace" | "reel_short" | "sms_warm";
};

export type SalesContentCalendar = {
  calendarId: string;
  workspaceId: string;
  generatedAt: string;
  slots: SalesContentCalendarSlot[];
  operatorNotesFr: string[];
  requiresManualPublish: true;
  noExecutionAuthorized: true;
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

function vehicleLabel(v: VehicleStock): string {
  const trim = v.trim ? ` ${v.trim}` : "";
  return `${v.year} ${v.make} ${v.model}${trim}`;
}

function formatPrice(priceCad: number | undefined): string {
  if (priceCad === undefined) return "prix sur demande";
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(priceCad);
}

/** Prefer photo-ready, priced units; alternate new/used. */
export function rankVehiclesForCalendar(vehicles: readonly VehicleStock[]): VehicleStock[] {
  return [...vehicles].sort((a, b) => {
    const aScore =
      (a.photoUrls.length >= 3 ? 3 : a.photoUrls.length) +
      (a.priceCad !== undefined ? 2 : 0) +
      (a.condition === "new" ? 1 : 0);
    const bScore =
      (b.photoUrls.length >= 3 ? 3 : b.photoUrls.length) +
      (b.priceCad !== undefined ? 2 : 0) +
      (b.condition === "new" ? 1 : 0);
    return bScore - aScore;
  });
}

/**
 * Build a 7-day prepare-only content plan that also reminds the rep to fill the livre.
 */
export function buildSalesContentCalendar(input: {
  workspaceId: string;
  vehicles: readonly VehicleStock[];
  nowIso: string;
  calendarId?: string;
  /** How many empty livre slots to aim for this week (operator goal). */
  livreTargetSlots?: number;
}): SalesContentCalendar {
  const ranked = rankVehiclesForCalendar(input.vehicles);
  const [v0, v1, v2, v3] = ranked;
  const livreTarget = input.livreTargetSlots ?? 5;

  const slots: SalesContentCalendarSlot[] = [
    v0
      ? {
          dayOffset: 0,
          dayLabelFr: dayLabelFor(input.nowIso, 0),
          kind: "vehicle_spotlight",
          titleFr: `Spotlight — ${vehicleLabel(v0)}`,
          briefFr:
            `Publier sur la Page FB + coller la description Marketplace. ` +
            `Prix ${formatPrice(v0.priceCad)}. CTA : « Répondez pour un essai — on réserve dans le livre. » ` +
            `Puis Sales Desk → Marketing → Préparer le pack.`,
          stockId: v0.stockId,
          vehicleLabel: vehicleLabel(v0),
          channelHint: "facebook_page",
        }
      : {
          dayOffset: 0,
          dayLabelFr: dayLabelFor(input.nowIso, 0),
          kind: "lead_magnet",
          titleFr: "Évaluation d'échange gratuite",
          briefFr:
            "Post : évaluation d'échange en 24h. Demande année/marque/modèle/km en MP. " +
            "Chaque réponse → capturer dans le lead bank (source web_form).",
          channelHint: "facebook_page",
        },
    {
      dayOffset: 1,
      dayLabelFr: dayLabelFor(input.nowIso, 1),
      kind: "reel_video",
      titleFr: v1 ? `Reel 20–30s — ${vehicleLabel(v1)}` : "Reel — tour du lot",
      briefFr: v1
        ? `Filmer walkaround 3 plans. Utilise le script Reel du pack marketing (${v1.stockId}). Hook prix + CTA livre.`
        : "Filmer 3 nouveaux arrivages en 20s. CTA : message privé pour essai.",
      stockId: v1?.stockId,
      vehicleLabel: v1 ? vehicleLabel(v1) : undefined,
      channelHint: "reel_short",
    },
    {
      dayOffset: 2,
      dayLabelFr: dayLabelFor(input.nowIso, 2),
      kind: "livre_fill",
      titleFr: `Remplir le livre — objectif ${livreTarget} essais`,
      briefFr:
        `File du matin : pour chaque lead chaud sans RDV, préparer SMS « Inviter essai (livre) ». ` +
        `Cible : ${livreTarget} créneaux cette semaine. Priorité marketplace_message / phone_in / walk_in.`,
      channelHint: "sms_warm",
    },
    {
      dayOffset: 3,
      dayLabelFr: dayLabelFor(input.nowIso, 3),
      kind: "trust_story",
      titleFr: "Preuve sociale / livraison",
      briefFr:
        "Photo livraison (avec accord) ou équipe. Texte court : modèle + remerciement + « questions en privé ». " +
        "Pas de spam inventaire ce jour-là.",
      channelHint: "facebook_page",
    },
    v2
      ? {
          dayOffset: 4,
          dayLabelFr: dayLabelFor(input.nowIso, 4),
          kind: "vehicle_spotlight",
          titleFr: `Marketplace — ${vehicleLabel(v2)}`,
          briefFr:
            `Préparer fiche Marketplace (Sales Desk). Hook premier ligne. ` +
            `Après publish manuel, marquer published_manual. Capturer chaque inbound.`,
          stockId: v2.stockId,
          vehicleLabel: vehicleLabel(v2),
          channelHint: "marketplace",
        }
      : {
          dayOffset: 4,
          dayLabelFr: dayLabelFor(input.nowIso, 4),
          kind: "lead_magnet",
          titleFr: "Financement — « combien par mois ? »",
          briefFr:
            "Post soft : « Envoie-nous ton budget mensuel — on te montre 2–3 options GM en stock. » " +
            "Chaque MP → lead bank + invite essai.",
          channelHint: "facebook_page",
        },
    {
      dayOffset: 5,
      dayLabelFr: dayLabelFor(input.nowIso, 5),
      kind: "market_insight",
      titleFr: "Brief marché Outaouais",
      briefFr:
        "Sales Desk → Brief marché AutoTrader. Partage 1 chiffre honnête (médiane) + pourquoi ton stock GM se compare. " +
        "Crédibilité → leads qualifiés pour le livre.",
      channelHint: "facebook_page",
    },
    {
      dayOffset: 6,
      dayLabelFr: dayLabelFor(input.nowIso, 6),
      kind: v3 ? "reel_video" : "livre_fill",
      titleFr: v3 ? `Reel week-end — ${vehicleLabel(v3)}` : "Relances livre week-end",
      briefFr: v3
        ? `Reel court + SMS warm aux leads nurture/contacted sans créneau. Pack marketing ${v3.stockId}.`
        : "Relancer les leads due + confirmer les essais de lundi. Livre d'abord.",
      stockId: v3?.stockId,
      vehicleLabel: v3 ? vehicleLabel(v3) : undefined,
      channelHint: v3 ? "reel_short" : "sms_warm",
    },
  ];

  return {
    calendarId:
      input.calendarId ?? `cal_${input.workspaceId}_${input.nowIso.replace(/[:.]/g, "")}`,
    workspaceId: input.workspaceId,
    generatedAt: input.nowIso,
    slots,
    operatorNotesFr: [
      "Prepare-only : tu publies et tu envoies — Oria ne poste pas.",
      `Objectif livre : ${livreTarget} essais planifiés cette semaine.`,
      "Alternez Page FB / Marketplace / Reel pour ne pas saturer un canal.",
      ranked.length === 0
        ? "Sync inventaire d'abord pour des spotlights véhicule concrets."
        : `${ranked.length} véhicule(s) en mémoire pour alimenter le calendrier.`,
    ],
    requiresManualPublish: true,
    noExecutionAuthorized: true,
  };
}
