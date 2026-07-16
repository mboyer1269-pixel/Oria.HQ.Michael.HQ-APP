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
  /** Meilleure fenêtre de publication / d'action (heure locale). */
  bestTimeFr: string;
  /** KPI à suivre pour ce slot (mesure vendeur, pas vanity). */
  kpiFr: string;
  /** Pourquoi ce slot ce jour-là — la stratégie derrière. */
  strategyFr: string;
  stockId?: string;
  vehicleLabel?: string;
  channelHint: "facebook_page" | "marketplace" | "reel_short" | "sms_warm";
};

export type WeeklyTarget = {
  labelFr: string;
  target: number;
  unitFr: string;
};

export type SalesContentCalendar = {
  calendarId: string;
  workspaceId: string;
  generatedAt: string;
  slots: SalesContentCalendarSlot[];
  /** Objectifs hebdo mesurables (leads, RDV, closings). */
  weeklyTargetsFr: WeeklyTarget[];
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
  const newUnits = ranked.filter((v) => v.condition === "new");
  const usedUnits = ranked.filter((v) => v.condition !== "new");
  // Alterne neuf / occasion pour couvrir les 2 acheteurs types.
  const v0 = usedUnits[0] ?? ranked[0];
  const v1 = newUnits[0] ?? ranked[1];
  const v2 = usedUnits[1] ?? ranked[2];
  const v3 = newUnits[1] ?? ranked[3];
  const livreTarget = input.livreTargetSlots ?? 5;

  const slots: SalesContentCalendarSlot[] = [
    v0
      ? {
          dayOffset: 0,
          dayLabelFr: dayLabelFor(input.nowIso, 0),
          kind: "vehicle_spotlight",
          titleFr: `Spotlight ${v0.condition === "new" ? "neuf" : "occasion"} — ${vehicleLabel(v0)}`,
          briefFr:
            `Fiche Marketplace complète (hook 2 lignes + 5-8 puces + confiance + CTA essai) + post Page FB. ` +
            `Prix ${formatPrice(v0.priceCad)}. Photo de couverture : avant 3/4. ` +
            `Sales Desk → Marketing → Préparer le pack + ZIP photos.`,
          bestTimeFr: "17h30-19h30 (retour du travail — pic Marketplace)",
          kpiFr: "Messages entrants sur l'annonce (cible : 3+ en 48h)",
          strategyFr:
            v0.condition === "new"
              ? "Le neuf en début de semaine capte les acheteurs qui ont magasiné le week-end."
              : "L'occasion < 25 k$ est la reine de Marketplace — impulsion locale, réponse < 5 min = RDV.",
          stockId: v0.stockId,
          vehicleLabel: vehicleLabel(v0),
          channelHint: "marketplace",
        }
      : {
          dayOffset: 0,
          dayLabelFr: dayLabelFor(input.nowIso, 0),
          kind: "lead_magnet",
          titleFr: "Évaluation d'échange gratuite",
          briefFr:
            "Post : évaluation d'échange en 24h. Demande année/marque/modèle/km en MP. " +
            "Chaque réponse → capturer dans le lead bank (source web_form).",
          bestTimeFr: "12h-13h (pause dîner)",
          kpiFr: "MP reçus avec infos véhicule (cible : 2+)",
          strategyFr: "Un trade-in est un double deal : une reprise + une vente. Aimant à leads n°1.",
          channelHint: "facebook_page",
        },
    {
      dayOffset: 1,
      dayLabelFr: dayLabelFor(input.nowIso, 1),
      kind: "reel_video",
      titleFr: v1 ? `Reel 20-30s — ${vehicleLabel(v1)}` : "Reel — tour du lot",
      briefFr: v1
        ? `Walkaround 3 plans, ta face + ta voix (authenticité > production). Script Reel du pack marketing (${v1.stockId}). ` +
          `Hook prix dans les 3 premières secondes + CTA « MP pour ton essai ».`
        : "Filmer 3 nouveaux arrivages en 20s, face caméra. CTA : message privé pour essai.",
      bestTimeFr: "19h-21h (pic vidéo courte)",
      kpiFr: "Vues complètes + MP générés (cible : 1 lead / Reel)",
      strategyFr:
        "La vidéo courte authentique bat la photo studio en 2026 — le vendeur visible crée la confiance avant la visite.",
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
        `File du matin : pour chaque lead chaud sans RDV → SMS « Inviter essai (livre) » avec 2 choix de créneau. ` +
        `Relance J2 pour les inbounds Marketplace d'avant-hier (séquence du pack marketing). ` +
        `Priorité : marketplace_message / phone_in / walk_in.`,
      bestTimeFr: "9h-11h (avant l'affluence plancher)",
      kpiFr: `Créneaux livre confirmés (cible : ${Math.max(2, Math.ceil(livreTarget / 3))} aujourd'hui)`,
      strategyFr:
        "Mardi/mercredi = jours creux plancher : parfaits pour transformer les leads du week-end en RDV jeudi-samedi.",
      channelHint: "sms_warm",
    },
    {
      dayOffset: 3,
      dayLabelFr: dayLabelFor(input.nowIso, 3),
      kind: "trust_story",
      titleFr: "Preuve sociale / livraison",
      briefFr:
        "Photo livraison (avec accord client) ou coulisses équipe. Texte court : modèle vendu + remerciement + " +
        "« des questions ? MP ». Zéro vente directe aujourd'hui — on bâtit la crédibilité.",
      bestTimeFr: "11h-13h",
      kpiFr: "Portée locale + nouveaux abonnés Page",
      strategyFr:
        "1 post confiance pour 2 posts inventaire : l'algorithme et les acheteurs se lassent du 100 % stock.",
      channelHint: "facebook_page",
    },
    v2
      ? {
          dayOffset: 4,
          dayLabelFr: dayLabelFor(input.nowIso, 4),
          kind: "vehicle_spotlight",
          titleFr: `Marketplace ${v2.condition === "new" ? "neuf" : "occasion"} — ${vehicleLabel(v2)}`,
          briefFr:
            `2e fiche de la semaine (jamais le même véhicule 2x). Tous les champs Marketplace remplis = ` +
            `plus de visibilité algorithme. Après publication : marquer published_manual + capturer chaque inbound.`,
          bestTimeFr: "16h-18h jeudi (acheteurs planifient le week-end)",
          kpiFr: "Messages + RDV week-end pris (cible : 2 essais sam.)",
          strategyFr:
            "Jeudi = meilleur jour pour vendre le week-end : l'acheteur qui écrit jeudi soir essaie samedi matin.",
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
            "Post soft : « Envoie-nous ton budget mensuel — on te montre 2-3 options GM en stock. » " +
            "Chaque MP → lead bank + invite essai.",
          bestTimeFr: "16h-18h",
          kpiFr: "MP budget reçus (cible : 2+)",
          strategyFr: "Le paiement mensuel est LA question réelle — y répondre en premier gagne le client.",
          channelHint: "facebook_page",
        },
    {
      dayOffset: 5,
      dayLabelFr: dayLabelFor(input.nowIso, 5),
      kind: "market_insight",
      titleFr: "Brief marché Outaouais",
      briefFr:
        "Sales Desk → Brief marché AutoTrader. Partager 1 chiffre honnête (ex. prix médian du segment) + " +
        "pourquoi ton stock GM se compare bien. Éducation = leads qualifiés.",
      bestTimeFr: "10h-12h samedi (recherche active)",
      kpiFr: "Clics / réponses qualifiées (pas de vanity likes)",
      strategyFr:
        "Le contenu éducatif honnête transforme le vendeur en référence locale — les acheteurs reviennent vers celui qui informe.",
      channelHint: "facebook_page",
    },
    {
      dayOffset: 6,
      dayLabelFr: dayLabelFor(input.nowIso, 6),
      kind: v3 ? "reel_video" : "livre_fill",
      titleFr: v3 ? `Reel week-end — ${vehicleLabel(v3)}` : "Relances livre week-end",
      briefFr: v3
        ? `Reel court authentique + SMS warm aux leads nurture/contacted sans créneau (pack ${v3.stockId}). ` +
          `Confirmer les essais de lundi (SMS confirm du livre).`
        : "Relancer les leads dus + confirmer les essais de lundi. Livre d'abord, contenu ensuite.",
      bestTimeFr: "10h-12h dimanche (magasinage canapé)",
      kpiFr: "Essais confirmés pour la semaine suivante",
      strategyFr:
        "Dimanche = pré-remplir le livre de lundi-mardi. Un lundi avec 3 essais confirmés change la semaine.",
      stockId: v3?.stockId,
      vehicleLabel: v3 ? vehicleLabel(v3) : undefined,
      channelHint: v3 ? "reel_short" : "sms_warm",
    },
  ];

  const weeklyTargetsFr: WeeklyTarget[] = [
    { labelFr: "Nouvelles annonces Marketplace publiées", target: 2, unitFr: "fiches" },
    { labelFr: "Leads capturés (toutes sources)", target: 8, unitFr: "leads" },
    { labelFr: "Essais planifiés au livre", target: livreTarget, unitFr: "créneaux" },
    { labelFr: "Réponse aux inbounds", target: 5, unitFr: "min max" },
    { labelFr: "Ventes closes (sold)", target: 2, unitFr: "véhicules" },
  ];

  return {
    calendarId:
      input.calendarId ?? `cal_${input.workspaceId}_${input.nowIso.replace(/[:.]/g, "")}`,
    workspaceId: input.workspaceId,
    generatedAt: input.nowIso,
    slots,
    weeklyTargetsFr,
    operatorNotesFr: [
      "Prepare-only : tu publies et tu envoies — Oria ne poste pas.",
      `Objectif livre : ${livreTarget} essais planifiés cette semaine.`,
      "Règle d'or : répondre aux inbounds en < 5 minutes — le premier qui répond gagne le RDV.",
      "Ratio contenu : 2 posts inventaire max pour 1 post confiance/éducation.",
      "Retirer chaque annonce vendue en < 24h (protège le compte + la crédibilité).",
      newUnits.length > 0 && usedUnits.length > 0
        ? `Mix inventaire : ${newUnits.length} neuf(s) / ${usedUnits.length} occasion(s) — le calendrier alterne les deux.`
        : ranked.length === 0
          ? "Sync inventaire d'abord pour des spotlights véhicule concrets."
          : `${ranked.length} véhicule(s) en mémoire pour alimenter le calendrier.`,
    ],
    requiresManualPublish: true,
    noExecutionAuthorized: true,
  };
}
