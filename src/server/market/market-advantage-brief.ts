// Market advantage brief — stock/market → sales talking points (prepare-only).
// Informed by public AutoTrader comps + AutoTrader merchandising research
// (Great Price badge ≈ +60% leads; 11+ photos ≈ +185% leads).

import type { VehicleStock } from "@/features/inventory/vehicle-stock";
import { findComparableOnLot } from "@/features/inventory/inventory-debrief";
import type { MarketCompListing } from "./autotrader-comps-parser";

export type MarketTarget = {
  year: number;
  make: string;
  model: string;
};

export type MarketAdvantageBrief = {
  target: MarketTarget;
  sourceUrl: string;
  compCount: number;
  marketPriceMinCad?: number;
  marketPriceMaxCad?: number;
  marketPriceMedianCad?: number;
  marketMileageMedianKm?: number;
  greatPriceCount: number;
  comps: MarketCompListing[];
  onLotComparables: VehicleStock[];
  talkingPoints: string[];
  frenchSummary: string;
};

function median(nums: number[]): number | undefined {
  if (nums.length === 0) return undefined;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2)
    : sorted[mid];
}

function formatCad(n: number | undefined): string {
  if (n === undefined) return "—";
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatKm(n: number | undefined): string {
  if (n === undefined) return "—";
  return `${new Intl.NumberFormat("fr-CA").format(n)} km`;
}

export function buildMarketAdvantageBrief(input: {
  target: MarketTarget;
  comps: MarketCompListing[];
  sourceUrl: string;
  inventory: VehicleStock[];
  focusVehicle?: VehicleStock | null;
}): MarketAdvantageBrief {
  const priced = input.comps
    .map((c) => c.priceCad)
    .filter((n): n is number => typeof n === "number");
  const mileages = input.comps
    .map((c) => c.mileageKm)
    .filter((n): n is number => typeof n === "number");

  const marketPriceMinCad = priced.length ? Math.min(...priced) : undefined;
  const marketPriceMaxCad = priced.length ? Math.max(...priced) : undefined;
  const marketPriceMedianCad = median(priced);
  const marketMileageMedianKm = median(mileages);
  const greatPriceCount = input.comps.filter((c) => c.priceBadge === "great").length;

  const onLotComparables = input.focusVehicle
    ? [input.focusVehicle, ...findComparableOnLot(input.inventory, input.target).filter((v) => v.stockId !== input.focusVehicle!.stockId)].slice(0, 6)
    : findComparableOnLot(input.inventory, input.target);

  const talkingPoints: string[] = [];
  const { year, make, model } = input.target;

  if (input.comps.length === 0) {
    talkingPoints.push(
      `Aucune annonce AutoTrader Gatineau trouvée pour ${year} ${make} ${model} — élargis l'année (±1) ou vérifie l'orthographe.`,
    );
  } else {
    talkingPoints.push(
      `Marché Gatineau (${input.comps.length} annonces) : ${formatCad(marketPriceMinCad)} → ${formatCad(marketPriceMaxCad)} (médiane ${formatCad(marketPriceMedianCad)}).`,
    );
    talkingPoints.push(
      `Kilométrage médian marché : ${formatKm(marketMileageMedianKm)}. Si ton unité est sous cette médiane → angle « moins roulé ».`,
    );
    if (greatPriceCount > 0) {
      talkingPoints.push(
        `${greatPriceCount} annonces badge « Great price » — AutoTrader rapporte ~+60% leads sur ces badges. Prix trop haut = tu disparais.`,
      );
    }
    talkingPoints.push(
      `Merchandising : 11+ photos = ~+185% leads (guide AutoTrader). Enrichis la VDP avant publish Marketplace.`,
    );
  }

  const focus = input.focusVehicle ?? onLotComparables[0];
  if (focus && typeof focus.priceCad === "number" && marketPriceMedianCad !== undefined) {
    const delta = focus.priceCad - marketPriceMedianCad;
    const abs = Math.abs(delta);
    if (delta <= -500) {
      talkingPoints.push(
        `Ton ${focus.year} ${focus.make} ${focus.model} (${focus.stockId}) à ${formatCad(focus.priceCad)} est ~${formatCad(abs)} sous la médiane marché ${year} ${make} ${model} → angle prix agressif.`,
      );
    } else if (delta >= 500) {
      talkingPoints.push(
        `Ton ${focus.year} ${focus.make} ${focus.model} (${focus.stockId}) à ${formatCad(focus.priceCad)} est ~${formatCad(abs)} au-dessus de la médiane. Justifie avec CPO/démo/équipement/garantie GM, sinon ajuste.`,
      );
    } else {
      talkingPoints.push(
        `Ton ${focus.year} ${focus.make} ${focus.model} (${focus.stockId}) est aligné médiane marché — gagne sur photos, essai rapide et réactivité SMS.`,
      );
    }
  }

  if (onLotComparables.length > 0 && !input.focusVehicle) {
    const names = onLotComparables
      .slice(0, 3)
      .map((v) => `${v.stockId} ${v.year} ${v.make} ${v.model} (${formatCad(v.priceCad)})`)
      .join(" · ");
    talkingPoints.push(
      `Sur ton lot, unités comparables à un acheteur ${make} ${model} : ${names}.`,
    );
    talkingPoints.push(
      `Script : « Le marché ${make} ${model} ${year} tourne autour de ${formatCad(marketPriceMedianCad)}. Voici ce que j'ai en GM avec le même job quotidien, plus le service local Buckingham. »`,
    );
  }

  if (onLotComparables.length === 0 && !input.focusVehicle) {
    talkingPoints.push(
      `Pas d'équivalent évident sur ton lot pour ${make} ${model}. Garde le brief pour un trade-in / objection concurrente.`,
    );
  }

  const frenchSummary =
    input.comps.length === 0
      ? `Brief marché ${year} ${make} ${model} : aucune comp AutoTrader Gatineau.`
      : `Brief marché ${year} ${make} ${model} (Gatineau) : médiane ${formatCad(marketPriceMedianCad)} ` +
        `(${formatCad(marketPriceMinCad)}–${formatCad(marketPriceMaxCad)}), ` +
        `${input.comps.length} comps, ${onLotComparables.length} unités proches sur ton lot.`;

  return {
    target: input.target,
    sourceUrl: input.sourceUrl,
    compCount: input.comps.length,
    marketPriceMinCad,
    marketPriceMaxCad,
    marketPriceMedianCad,
    marketMileageMedianKm,
    greatPriceCount,
    comps: input.comps.slice(0, 12),
    onLotComparables,
    talkingPoints,
    frenchSummary,
  };
}
