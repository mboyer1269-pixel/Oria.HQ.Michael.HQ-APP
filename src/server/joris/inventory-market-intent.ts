// Joris intent: inventory debrief + market advantage brief (prepare-only).

import { buildInventoryDebrief } from "@/features/inventory/inventory-debrief";
import { getInventorySnapshot } from "@/server/inventory/inventory-store";
import { syncPublicInventory } from "@/server/inventory/public-inventory-sync";
import { fetchMarketAdvantageBrief } from "@/server/market/fetch-market-comps";
import { extractStockRefFromMessage, wantsInventorySync } from "./marketplace-listing-intent";

const YEAR_MAKE_MODEL_RE =
  /\b(20\d{2})\s+(hyundai|kia|toyota|honda|ford|chevrolet|chevy|gmc|buick|nissan|mazda|volkswagen|vw|jeep|ram|dodge|subaru)\s+([a-z0-9][a-z0-9\-]*(?:\s+[a-z0-9][a-z0-9\-]*){0,2})\b/i;
const MAKE_MODEL_YEAR_RE =
  /\b(hyundai|kia|toyota|honda|ford|chevrolet|chevy|gmc|buick|nissan|mazda|volkswagen|vw|jeep|ram|dodge|subaru)\s+([a-z0-9][a-z0-9\-]*(?:\s+[a-z0-9][a-z0-9\-]*){0,2})\s+(20\d{2})\b/i;

function normalizeMake(raw: string): string {
  if (/^chevy$/i.test(raw)) return "Chevrolet";
  if (/^vw$/i.test(raw)) return "Volkswagen";
  if (/^gmc$/i.test(raw)) return "GMC";
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function normalizeModel(raw: string): string | null {
  const cleaned = raw
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b(qui|pour|avec|dans|sur|mon|ma|mes|le|la|les|un|une|au|aux)\b.*$/i, "")
    .trim();
  if (!cleaned) return null;
  return cleaned
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export function extractMarketTargetFromMessage(
  message: string,
): { year: number; make: string; model: string } | null {
  const yearFirst = message.match(YEAR_MAKE_MODEL_RE);
  if (yearFirst) {
    const year = Number.parseInt(yearFirst[1]!, 10);
    const make = normalizeMake(yearFirst[2]!);
    const model = normalizeModel(yearFirst[3]!);
    if (model) return { year, make, model };
  }

  const makeFirst = message.match(MAKE_MODEL_YEAR_RE);
  if (makeFirst) {
    const make = normalizeMake(makeFirst[1]!);
    const model = normalizeModel(makeFirst[2]!);
    const year = Number.parseInt(makeFirst[3]!, 10);
    if (model) return { year, make, model };
  }

  return null;
}

export function wantsInventoryDebrief(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("débrief") ||
    lower.includes("debrief") ||
    lower.includes("bref inventaire") ||
    lower.includes("résumé inventaire") ||
    lower.includes("resume inventaire") ||
    lower.includes("connais mon inventaire") ||
    lower.includes("connaître mon inventaire") ||
    lower.includes("connaitre mon inventaire") ||
    lower.includes("qu'est-ce que j'ai en stock") ||
    lower.includes("ce que j'ai en stock") ||
    (lower.includes("inventaire") &&
      (lower.includes("résumé") || lower.includes("resume") || lower.includes("brief")))
  );
}

export function wantsMarketBrief(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("marché") ||
    lower.includes("marche") ||
    lower.includes("autotrader") ||
    lower.includes("comparable") ||
    lower.includes("comps") ||
    lower.includes("plus-value") ||
    lower.includes("plus value") ||
    lower.includes("versus") ||
    lower.includes("vs mon") ||
    lower.includes("vs inventaire") ||
    lower.includes("contre le marché") ||
    lower.includes("contre le marche") ||
    (lower.includes("comparer") && (lower.includes("marché") || lower.includes("marche") || lower.includes("prix"))) ||
    (lower.includes("compare") && (lower.includes("marché") || lower.includes("marche") || lower.includes("prix")))
  );
}

export type InventoryMarketIntentResult = {
  summary: string;
  synced?: boolean;
  vehicleCount?: number;
  kind: "debrief" | "market" | "both" | "help";
};

/**
 * Handle inventory.market.brief chat requests.
 */
export async function handleInventoryMarketIntent(input: {
  workspaceId: string;
  message: string;
}): Promise<InventoryMarketIntentResult> {
  const debriefWanted = wantsInventoryDebrief(input.message);
  const marketWanted = wantsMarketBrief(input.message);
  const syncWanted = wantsInventorySync(input.message);
  let synced = false;

  let snap = getInventorySnapshot(input.workspaceId);
  if (syncWanted || !snap || snap.vehicles.length === 0) {
    const sync = await syncPublicInventory({ workspaceId: input.workspaceId });
    if (!sync.ok) {
      return {
        kind: "help",
        summary:
          `Je n'ai pas pu synchroniser l'inventaire (${sync.errors.join("; ")}). ` +
          `Réessaie Sync sur /hq/sales ou ingest JSON.`,
      };
    }
    synced = true;
    snap = sync.snapshot;
  }

  const vehicles = snap?.vehicles ?? [];
  const debrief = buildInventoryDebrief(vehicles);
  const target = extractMarketTargetFromMessage(input.message);
  const stockRef = extractStockRefFromMessage(input.message);
  const focusVehicle = stockRef
    ? vehicles.find(
        (v) =>
          v.stockId.toLowerCase() === stockRef.toLowerCase() ||
          v.vin?.toLowerCase() === stockRef.toLowerCase(),
      )
    : undefined;

  // Pure debrief
  if (debriefWanted && !marketWanted && !target) {
    const top = debrief.topModels
      .slice(0, 5)
      .map((m) => `• ${m.count}× ${m.year} ${m.make} ${m.model}`)
      .join("\n");
    const highlights = debrief.highlights
      .map((h) => `• ${h.stockId} — ${h.year} ${h.make} ${h.model} — ${h.reason}`)
      .join("\n");
    return {
      kind: "debrief",
      synced,
      vehicleCount: debrief.vehicleCount,
      summary:
        `${debrief.frenchSummary}\n\n` +
        `Top modèles:\n${top || "—"}\n\n` +
        `À retenir:\n${highlights || "—"}\n\n` +
        `${debrief.operatorNotes.join("\n")}\n\n` +
        `Dis-moi par ex. « compare Hyundai Tucson 2023 au marché » pour des angles plus-value.`,
    };
  }

  // Market brief (with optional debrief)
  if (marketWanted || target) {
    if (!target && !focusVehicle) {
      return {
        kind: "help",
        synced,
        vehicleCount: debrief.vehicleCount,
        summary:
          `${debrief.frenchSummary}\n\n` +
          `Pour un brief marché, précise année + marque + modèle ` +
          `(ex. « Hyundai Tucson 2023 vs mon inventaire » ou « plus-value pour mon Terrain 2024 »).`,
      };
    }

    const marketTarget = target ?? {
      year: focusVehicle!.year,
      make: focusVehicle!.make,
      model: focusVehicle!.model,
    };

    const market = await fetchMarketAdvantageBrief({
      target: marketTarget,
      inventory: vehicles,
      focusVehicle: focusVehicle ?? null,
    });

    if (!market.ok) {
      return {
        kind: "market",
        synced,
        vehicleCount: debrief.vehicleCount,
        summary:
          `Débrief OK (${debrief.vehicleCount} unités) mais brief marché échoué : ${market.errors.join("; ")}.`,
      };
    }

    const compsLines = market.brief.comps
      .slice(0, 5)
      .map((c) => {
        const price =
          c.priceCad !== undefined
            ? new Intl.NumberFormat("fr-CA", {
                style: "currency",
                currency: "CAD",
                maximumFractionDigits: 0,
              }).format(c.priceCad)
            : "—";
        const km =
          c.mileageKm !== undefined
            ? `${new Intl.NumberFormat("fr-CA").format(c.mileageKm)} km`
            : "km —";
        return `• ${price} · ${km} · ${c.dealerName ?? "vendeur"} · badge ${c.priceBadge ?? "—"}`;
      })
      .join("\n");

    const lotLines = market.brief.onLotComparables
      .map((v) => {
        const price =
          v.priceCad !== undefined
            ? new Intl.NumberFormat("fr-CA", {
                style: "currency",
                currency: "CAD",
                maximumFractionDigits: 0,
              }).format(v.priceCad)
            : "—";
        return `• ${v.stockId} — ${v.year} ${v.make} ${v.model} — ${price}`;
      })
      .join("\n");

    const header = debriefWanted || syncWanted ? `${debrief.frenchSummary}\n\n` : "";

    return {
      kind: debriefWanted ? "both" : "market",
      synced,
      vehicleCount: debrief.vehicleCount,
      summary:
        `${header}${market.brief.frenchSummary}\n\n` +
        `Comps AutoTrader (échantillon):\n${compsLines || "—"}\n\n` +
        `Sur ton lot (comparables):\n${lotLines || "—"}\n\n` +
        `Angles plus-value:\n${market.brief.talkingPoints.map((t) => `• ${t}`).join("\n")}\n\n` +
        `Source: ${market.brief.sourceUrl}`,
    };
  }

  return {
    kind: "help",
    synced,
    vehicleCount: debrief.vehicleCount,
    summary:
      `${debrief.frenchSummary}\n\n` +
      `Je peux :\n` +
      `• « débrief inventaire » — connaître ton lot\n` +
      `• « compare Hyundai Tucson 2023 au marché » — comps + angles vs ton inventaire\n` +
      `• « sync inventaire » puis « Fiche FB » sur /hq/sales`,
  };
}
