// Inventory debrief — operator-facing stock briefing from a VehicleStock[].
// Pure helpers: no I/O. Used by sync response, Sales Desk, and Joris.

import type { VehicleStock } from "@/features/inventory/vehicle-stock";

export type InventoryMakeBucket = {
  make: string;
  count: number;
};

export type InventoryModelBucket = {
  key: string;
  year: number;
  make: string;
  model: string;
  count: number;
  minPriceCad?: number;
  maxPriceCad?: number;
};

export type InventoryHighlight = {
  stockId: string;
  year: number;
  make: string;
  model: string;
  trim?: string;
  condition: VehicleStock["condition"];
  priceCad?: number;
  photoCount: number;
  photoUrl?: string;
  reason: string;
};

export type InventoryDebrief = {
  vehicleCount: number;
  withPhotoCount: number;
  withPriceCount: number;
  withVinCount: number;
  newCount: number;
  usedCount: number;
  cpoCount: number;
  demoCount: number;
  priceMinCad?: number;
  priceMaxCad?: number;
  priceMedianCad?: number;
  photoReadyPct: number;
  byMake: InventoryMakeBucket[];
  topModels: InventoryModelBucket[];
  highlights: InventoryHighlight[];
  operatorNotes: string[];
  frenchSummary: string;
};

function median(nums: number[]): number | undefined {
  if (nums.length === 0) return undefined;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
  }
  return sorted[mid];
}

function formatCad(n: number | undefined): string {
  if (n === undefined) return "—";
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(n);
}

function isDemo(v: VehicleStock): boolean {
  return (v.stockId + (v.stockNumber ?? "")).toUpperCase().includes("DEMO");
}

/**
 * Build a sales-operator debrief so Michael can "know the lot" at a glance.
 */
export function buildInventoryDebrief(vehicles: VehicleStock[]): InventoryDebrief {
  const byMakeMap = new Map<string, number>();
  const byModelMap = new Map<
    string,
    { year: number; make: string; model: string; count: number; prices: number[] }
  >();

  let withPhotoCount = 0;
  let withPriceCount = 0;
  let withVinCount = 0;
  let newCount = 0;
  let usedCount = 0;
  let cpoCount = 0;
  let demoCount = 0;
  const prices: number[] = [];

  for (const v of vehicles) {
    byMakeMap.set(v.make, (byMakeMap.get(v.make) ?? 0) + 1);
    const modelKey = `${v.year} ${v.make} ${v.model}`;
    const prior = byModelMap.get(modelKey) ?? {
      year: v.year,
      make: v.make,
      model: v.model,
      count: 0,
      prices: [] as number[],
    };
    prior.count += 1;
    if (typeof v.priceCad === "number") prior.prices.push(v.priceCad);
    byModelMap.set(modelKey, prior);

    if (v.photoUrls.length > 0) withPhotoCount += 1;
    if (typeof v.priceCad === "number") {
      withPriceCount += 1;
      prices.push(v.priceCad);
    }
    if (v.vin) withVinCount += 1;
    if (v.condition === "new") newCount += 1;
    else if (v.condition === "cpo") cpoCount += 1;
    else usedCount += 1;
    if (isDemo(v)) demoCount += 1;
  }

  const byMake = [...byMakeMap.entries()]
    .map(([make, count]) => ({ make, count }))
    .sort((a, b) => b.count - a.count);

  const topModels = [...byModelMap.entries()]
    .map(([key, row]) => ({
      key,
      year: row.year,
      make: row.make,
      model: row.model,
      count: row.count,
      minPriceCad: row.prices.length ? Math.min(...row.prices) : undefined,
      maxPriceCad: row.prices.length ? Math.max(...row.prices) : undefined,
    }))
    .sort((a, b) => b.count - a.count || b.year - a.year)
    .slice(0, 10);

  const priced = vehicles
    .filter((v) => typeof v.priceCad === "number")
    .sort((a, b) => (b.priceCad ?? 0) - (a.priceCad ?? 0));

  const highlights: InventoryHighlight[] = [];
  const top = priced[0];
  if (top) {
    highlights.push({
      stockId: top.stockId,
      year: top.year,
      make: top.make,
      model: top.model,
      trim: top.trim,
      condition: top.condition,
      priceCad: top.priceCad,
      photoCount: top.photoUrls.length,
      photoUrl: top.photoUrls[0],
      reason: "Plus haut prix affiché — à prioriser pour marge / client premium",
    });
  }
  const entry = [...priced].reverse()[0];
  if (entry && entry.stockId !== top?.stockId) {
    highlights.push({
      stockId: entry.stockId,
      year: entry.year,
      make: entry.make,
      model: entry.model,
      trim: entry.trim,
      condition: entry.condition,
      priceCad: entry.priceCad,
      photoCount: entry.photoUrls.length,
      photoUrl: entry.photoUrls[0],
      reason: "Plus bas prix — bon levier volume / premier contact Marketplace",
    });
  }
  const demos = vehicles.filter(isDemo).slice(0, 2);
  for (const d of demos) {
    if (highlights.some((h) => h.stockId === d.stockId)) continue;
    highlights.push({
      stockId: d.stockId,
      year: d.year,
      make: d.make,
      model: d.model,
      trim: d.trim,
      condition: d.condition,
      priceCad: d.priceCad,
      photoCount: d.photoUrls.length,
      photoUrl: d.photoUrls[0],
      reason: "Démo — argument km bas + équipement, vs marché occasion",
    });
  }

  const photoReadyPct =
    vehicles.length === 0 ? 0 : Math.round((withPhotoCount / vehicles.length) * 100);

  const operatorNotes: string[] = [];
  if (vehicles.length === 0) {
    operatorNotes.push("Inventaire vide — lance Sync site web.");
  } else {
    operatorNotes.push(
      `${newCount} neufs · ${usedCount} occasions · ${cpoCount} CPO · ${demoCount} démos repérées.`,
    );
    if (photoReadyPct < 90) {
      operatorNotes.push(
        `Couverture photo ${photoReadyPct}% — enrichis via fiche VDP avant Marketplace (11+ photos = +185% leads AutoTrader).`,
      );
    } else {
      operatorNotes.push(
        `Couverture photo ${photoReadyPct}% — OK pour fiches. Vise 11+ angles avant publish Marketplace.`,
      );
    }
    if (withPriceCount < vehicles.length) {
      operatorNotes.push(
        `${vehicles.length - withPriceCount} unités sans prix — à corriger avant comparaison marché.`,
      );
    }
    operatorNotes.push(
      "Pour vendre plus vite : compare une unité au marché AutoTrader (Gatineau) et sors 3 angles plus-value.",
    );
  }

  const priceMinCad = prices.length ? Math.min(...prices) : undefined;
  const priceMaxCad = prices.length ? Math.max(...prices) : undefined;
  const priceMedianCad = median(prices);

  const makeLine = byMake
    .slice(0, 4)
    .map((m) => `${m.make} ${m.count}`)
    .join(" · ");

  const frenchSummary =
    vehicles.length === 0
      ? "Aucun véhicule en mémoire."
      : `Débrief lot : ${vehicles.length} unités (${makeLine}). ` +
        `Fourchette ${formatCad(priceMinCad)} → ${formatCad(priceMaxCad)} ` +
        `(médiane ${formatCad(priceMedianCad)}). ` +
        `${newCount} neufs / ${usedCount + cpoCount} occasions. ` +
        `Photos prêtes : ${photoReadyPct}%.`;

  return {
    vehicleCount: vehicles.length,
    withPhotoCount,
    withPriceCount,
    withVinCount,
    newCount,
    usedCount,
    cpoCount,
    demoCount,
    priceMinCad,
    priceMaxCad,
    priceMedianCad,
    photoReadyPct,
    byMake,
    topModels,
    highlights,
    operatorNotes,
    frenchSummary,
  };
}

/**
 * Find inventory units comparable to a market target (e.g. Hyundai Tucson 2023
 * → Terrain / Trailblazer / Encore / Trax on the Buckingham lot).
 */
export function findComparableOnLot(
  vehicles: VehicleStock[],
  target: { year: number; make: string; model: string },
): VehicleStock[] {
  const modelLower = target.model.toLowerCase();
  const year = target.year;

  // Segment heuristics for Gatineau CUV / truck shoppers
  const segmentPeers: Record<string, string[]> = {
    tucson: ["terrain", "equinox", "trailblazer", "encore", "trax", "blazer"],
    santa: ["acadia", "traverse", "enclave"],
    kona: ["trax", "trailblazer", "encore"],
    elantra: ["malibu", "cruze"],
    sonata: ["malibu"],
    sierra: ["silverado"],
    silverado: ["sierra"],
    f150: ["silverado", "sierra"],
    civic: ["malibu", "cruze"],
    crv: ["equinox", "terrain", "trailblazer"],
    rav4: ["equinox", "terrain", "blazer"],
    rogue: ["equinox", "terrain"],
  };

  const peers = segmentPeers[modelLower.split(/\s+/)[0] ?? ""] ?? [];

  const scored = vehicles
    .map((v) => {
      let score = 0;
      const vm = v.model.toLowerCase();
      if (v.make.toLowerCase() === target.make.toLowerCase() && vm.includes(modelLower)) {
        score += 50;
      }
      if (peers.some((p) => vm.includes(p))) score += 30;
      if (Math.abs(v.year - year) <= 2) score += 15;
      else if (Math.abs(v.year - year) <= 4) score += 8;
      if (v.condition !== "new") score += 5;
      if (typeof v.priceCad === "number") score += 3;
      return { v, score };
    })
    .filter((row) => row.score >= 20)
    .sort((a, b) => b.score - a.score || Math.abs(a.v.year - year) - Math.abs(b.v.year - year));

  return scored.slice(0, 6).map((row) => row.v);
}
