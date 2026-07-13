// Lead prospect playbook — prioritizes vehicles and actions for more sales.
// Pure scoring: no I/O. Powers Publication Agent recommendations.

import type { VehicleStock } from "@/features/inventory/vehicle-stock";
import type { SalesLead } from "@/features/sales/sales-lead";
import { buildInventoryDebrief } from "@/features/inventory/inventory-debrief";
import { lookupModelKnowledge } from "@/features/sales/gm-model-knowledge";

export type ProspectAction =
  | "publish_marketplace"
  | "boost_with_reel"
  | "enrich_photos"
  | "add_price"
  | "follow_up_leads"
  | "learn_model";

export type VehicleProspectRecommendation = {
  stockId: string;
  vehicleTitle: string;
  priorityScore: number;
  primaryAction: ProspectAction;
  actionLabelFr: string;
  reasonFr: string;
  estimatedLeadImpactFr: string;
};

export type LeadProspectPlaybook = {
  generatedAt: string;
  frenchSummary: string;
  topVehicles: VehicleProspectRecommendation[];
  dailyActionsFr: string[];
  weeklyTargetsFr: string[];
  leadGapNotesFr: string[];
};

function vehicleTitle(v: VehicleStock): string {
  const trim = v.trim ? ` ${v.trim}` : "";
  return `${v.year} ${v.make} ${v.model}${trim}`;
}

function scoreVehicle(v: VehicleStock, publishedStockIds: Set<string>): {
  score: number;
  action: ProspectAction;
  reasonFr: string;
  impactFr: string;
} {
  let score = 40;
  let action: ProspectAction = "publish_marketplace";
  const reasons: string[] = [];

  if (publishedStockIds.has(v.stockId)) {
    score -= 30;
    action = "boost_with_reel";
    reasons.push("déjà sur Marketplace — amplifier avec Reel");
  } else {
    score += 20;
    reasons.push("pas encore publié — priorité Marketplace");
  }

  if (v.photoUrls.length < 5) {
    score -= 15;
    action = "enrich_photos";
    reasons.push("photos insuffisantes (<5)");
  } else if (v.photoUrls.length >= 11) {
    score += 15;
    reasons.push("11+ photos = conversion optimale");
  }

  if (typeof v.priceCad !== "number") {
    score -= 12;
    if (action === "publish_marketplace") action = "add_price";
    reasons.push("prix manquant");
  } else {
    score += 8;
  }

  if (v.condition === "new") {
    score += 10;
    reasons.push("neuf = demande forte");
  }

  if (lookupModelKnowledge(v) && v.condition === "new") {
    score += 5;
    reasons.push("formation dispo — pitch affûté");
  }

  const impact =
    score >= 75
      ? "Élevé — publier cette semaine peut générer 3-8 messages"
      : score >= 55
        ? "Moyen — 1-3 leads possibles avec bonne annonce"
        : "Faible — corriger photos/prix avant publication";

  return {
    score: Math.min(100, Math.max(0, score)),
    action,
    reasonFr: reasons.slice(0, 2).join(" · "),
    impactFr: impact,
  };
}

const ACTION_LABELS: Record<ProspectAction, string> = {
  publish_marketplace: "Publier sur Marketplace",
  boost_with_reel: "Booster avec Reel",
  enrich_photos: "Enrichir photos VDP",
  add_price: "Ajouter prix avant publication",
  follow_up_leads: "Relancer leads chauds",
  learn_model: "Formation modèle (Apprendre)",
};

/**
 * Build a daily playbook for the sales rep to maximize leads.
 */
export function buildLeadProspectPlaybook(input: {
  vehicles: VehicleStock[];
  leads: SalesLead[];
  publishedStockIds?: string[];
  nowIso: string;
}): LeadProspectPlaybook {
  const published = new Set(input.publishedStockIds ?? []);
  const debrief = buildInventoryDebrief(input.vehicles);

  const recommendations = input.vehicles
    .map((v) => {
      const scored = scoreVehicle(v, published);
      return {
        stockId: v.stockId,
        vehicleTitle: vehicleTitle(v),
        priorityScore: scored.score,
        primaryAction: scored.action,
        actionLabelFr: ACTION_LABELS[scored.action],
        reasonFr: scored.reasonFr,
        estimatedLeadImpactFr: scored.impactFr,
      };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 8);

  const activeLeads = input.leads.filter((l) => l.stage !== "sold" && l.stage !== "lost");
  const dueLeads = activeLeads.filter((l) => {
    if (!l.nextFollowUpAt) return false;
    return new Date(l.nextFollowUpAt) <= new Date(input.nowIso);
  });

  const dailyActions: string[] = [];
  if (dueLeads.length > 0) {
    dailyActions.push(`Relancer ${dueLeads.length} lead(s) dû(s) — file du matin en priorité`);
  }
  const topPublish = recommendations.filter((r) => r.primaryAction === "publish_marketplace").slice(0, 2);
  for (const r of topPublish) {
    dailyActions.push(`Publier ${r.vehicleTitle} sur Marketplace (score ${r.priorityScore})`);
  }
  if (recommendations.some((r) => r.primaryAction === "boost_with_reel")) {
    dailyActions.push("Filmer 1 Reel avec le script Directeur Marketing (véhicule déjà publié)");
  }
  if (debrief.photoReadyPct < 80) {
    dailyActions.push(`Enrichir photos — couverture actuelle ${debrief.photoReadyPct}%`);
  }
  if (dailyActions.length === 0) {
    dailyActions.push("Sync inventaire puis préparer 2 fiches Marketplace");
  }

  const leadGapNotes: string[] = [];
  if (activeLeads.length < 5) {
    leadGapNotes.push("Moins de 5 leads actifs — publier 2+ annonces cette semaine");
  }
  const marketplaceLeads = activeLeads.filter(
    (l) => l.source === "marketplace_message" || l.source === "marketplace_post",
  );
  if (marketplaceLeads.length === 0 && published.size > 0) {
    leadGapNotes.push("Annonces publiées mais 0 lead Marketplace — revoir titre/prix/photos");
  }

  const frenchSummary = [
    `${input.vehicles.length} véhicules en stock`,
    `${activeLeads.length} leads actifs`,
    `${dueLeads.length} relances dues`,
    `Top priorité : ${recommendations[0]?.vehicleTitle ?? "sync inventaire"}`,
  ].join(" · ");

  return {
    generatedAt: input.nowIso,
    frenchSummary,
    topVehicles: recommendations,
    dailyActionsFr: dailyActions.slice(0, 5),
    weeklyTargetsFr: [
      "Publier 3-5 annonces Marketplace (neufs + occasions chaudes)",
      "Capturer 100% des messages Marketplace dans la lead bank",
      "Publier 2 Reels / Shorts par semaine",
      "Closer chaque lead sold/lost le jour même",
      "Traiter la file du matin avant midi",
    ],
    leadGapNotesFr: leadGapNotes,
  };
}
