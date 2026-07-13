// Joris intent: Directeur Marketing — multi-channel content packs (prepare-only).

import { buildMarketingContentPack } from "@/features/sales/marketing-content-pack";
import { saveMarketingPack } from "@/server/sales/marketing-pack-store";
import { getInventorySnapshot } from "@/server/inventory/inventory-store";
import { syncPublicInventory } from "@/server/inventory/public-inventory-sync";
import {
  extractGmModelMention,
  extractMarketTargetFromMessage,
} from "@/server/joris/inventory-market-intent";
import { extractStockRefFromMessage, wantsInventorySync } from "./marketplace-listing-intent";

export type SalesMarketingIntentResult = {
  summary: string;
  stockId?: string;
  packId?: string;
};

function findVehicleByModel(
  workspaceId: string,
  target: { year?: number; make: string; model: string },
) {
  const vehicles = getInventorySnapshot(workspaceId)?.vehicles ?? [];
  const modelNeedle = target.model.toLowerCase();
  const makeNeedle = target.make.toLowerCase();

  const matches = vehicles.filter((v) => {
    if (v.make.toLowerCase() !== makeNeedle && !v.make.toLowerCase().includes(makeNeedle)) {
      return false;
    }
    if (!v.model.toLowerCase().includes(modelNeedle)) return false;
    if (target.year !== undefined && v.year !== target.year) return false;
    return true;
  });

  if (matches.length === 0) return null;
  return matches.sort((a, b) => (b.priceCad ?? 0) - (a.priceCad ?? 0))[0] ?? null;
}

function formatPackForChat(
  pack: ReturnType<typeof buildMarketingContentPack>,
  channelFilter?: string,
): string {
  const lowerFilter = channelFilter?.toLowerCase();
  const pieces = pack.pieces.filter((p) => {
    if (!lowerFilter) return true;
    if (lowerFilter.includes("reel")) return p.channel === "instagram_reel";
    if (lowerFilter.includes("youtube")) return p.channel === "youtube_short";
    if (lowerFilter.includes("pub") || lowerFilter.includes("ad")) {
      return p.channel === "facebook_ad" || p.channel === "facebook_post";
    }
    if (lowerFilter.includes("marketplace")) return p.channel === "marketplace_hook";
    return true;
  });

  const selected = pieces.length > 0 ? pieces : pack.pieces.slice(0, 2);
  const blocks = selected.map(
    (p) => `--- ${p.label} ---\n${p.headline}\n\n${p.body}`,
  );

  const tips = pack.leadTips.map((t) => `• ${t}`).join("\n");

  return [
    `Pack marketing prêt pour ${pack.vehicleTitle} (${pack.stockId}).`,
    "Copie-colle sur Facebook / Instagram / YouTube — publication manuelle.",
    "",
    ...blocks,
    "",
    "Conseils leads :",
    tips,
  ].join("\n");
}

function detectChannelFilter(message: string): string | undefined {
  const lower = message.toLowerCase();
  if (lower.includes("reel")) return "reel";
  if (lower.includes("youtube")) return "youtube";
  if (lower.includes("pub") || lower.includes("publicité") || lower.includes("publicite")) {
    return "pub";
  }
  if (lower.includes("marketplace")) return "marketplace";
  return undefined;
}

/**
 * Handle sales.marketing.prepare — contenus pub / Reel / YouTube depuis inventaire.
 */
export async function handleSalesMarketingIntent(input: {
  workspaceId: string;
  message: string;
}): Promise<SalesMarketingIntentResult> {
  if (wantsInventorySync(input.message)) {
    const sync = await syncPublicInventory({ workspaceId: input.workspaceId });
    if (!sync.ok) {
      return {
        summary: `Sync inventaire échouée : ${sync.errors.join("; ")}`,
      };
    }
  }

  const stockRef = extractStockRefFromMessage(input.message);
  let vehicle =
    stockRef !== null
      ? (getInventorySnapshot(input.workspaceId)?.vehicles ?? []).find(
          (v) =>
            v.stockId.toUpperCase() === stockRef ||
            v.stockNumber?.toUpperCase() === stockRef ||
            v.vin?.toUpperCase() === stockRef,
        ) ?? null
      : null;

  if (!vehicle) {
    const target =
      extractMarketTargetFromMessage(input.message) ??
      extractGmModelMention(input.message);
    if (target) {
      vehicle = findVehicleByModel(input.workspaceId, target);
    }
  }

  if (!vehicle) {
    const sample = (getInventorySnapshot(input.workspaceId)?.vehicles ?? [])
      .slice(0, 5)
      .map((v) => `• ${v.stockId} — ${v.year} ${v.make} ${v.model}`)
      .join("\n");
    return {
      summary:
        "Pour générer une pub / Reel / YouTube Short, donne-moi un stock ou un modèle.\n" +
        "Exemples :\n" +
        "• « prépare pub pour le Trax 2026 »\n" +
        "• « génère un reel pour 26344-NEUF »\n" +
        "• « script youtube pour le Terrain »\n" +
        (sample ? `\nEn stock :\n${sample}` : "\nDis « sync inventaire » d'abord."),
    };
  }

  const nowIso = new Date().toISOString();
  const pack = buildMarketingContentPack({
    packId: `mcp_joris_${vehicle.stockId}_${nowIso.replace(/[:.]/g, "")}`,
    vehicle,
    nowIso,
  });

  saveMarketingPack(input.workspaceId, pack);

  return {
    summary: formatPackForChat(pack, detectChannelFilter(input.message)),
    stockId: vehicle.stockId,
    packId: pack.packId,
  };
}