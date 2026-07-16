// Joris intent: marketing + prospecting pack (prepare-only).

import { buildSalesMarketingPack } from "@/features/sales/marketing-content-pack";
import { buildSalesContentCalendar } from "@/features/sales/sales-content-calendar";
import {
  findVehicleInSnapshot,
  getInventorySnapshot,
} from "@/server/inventory/inventory-store";
import { syncPublicInventory } from "@/server/inventory/public-inventory-sync";
import { extractStockRefFromMessage, wantsInventorySync } from "./marketplace-listing-intent";

export async function handleSalesMarketingPrepareIntent(input: {
  workspaceId: string;
  message: string;
}): Promise<{ summary: string }> {
  const nowIso = new Date().toISOString();
  let snapshot = getInventorySnapshot(input.workspaceId);
  const lower = input.message.toLowerCase();
  const wantsCalendar =
    lower.includes("calendrier") || lower.includes("plan marketing") || lower.includes("7 jours");

  if (wantsInventorySync(input.message) || !snapshot || snapshot.vehicles.length === 0) {
    const sync = await syncPublicInventory({
      workspaceId: input.workspaceId,
      nowIso,
    });
    if (!sync.ok && wantsCalendar === false && !snapshot) {
      return {
        summary:
          `Pack marketing bloqué : inventaire indisponible (${sync.errors.join("; ")}). ` +
          `Sync le site depuis le Sales Desk, puis redemande le pack.`,
      };
    }
    snapshot = getInventorySnapshot(input.workspaceId) ?? snapshot;
  }

  if (wantsCalendar) {
    const calendar = buildSalesContentCalendar({
      workspaceId: input.workspaceId,
      vehicles: snapshot?.vehicles ?? [],
      nowIso,
    });
    const lines = [
      "## Calendrier marketing 7 jours (prepare-only)",
      "",
      ...calendar.slots.map(
        (s) =>
          `**${s.dayLabelFr}** — ${s.titleFr}\n${s.briefFr}` +
          (s.vehicleLabel ? `\nVéhicule : ${s.vehicleLabel}` : ""),
      ),
      "",
      ...calendar.operatorNotesFr.map((n) => `• ${n}`),
    ];
    return { summary: lines.join("\n\n") };
  }

  const stockRef = extractStockRefFromMessage(input.message);
  const vehicle = stockRef
    ? findVehicleInSnapshot(input.workspaceId, stockRef) ??
      snapshot?.vehicles.find(
        (v) =>
          v.stockId === stockRef ||
          v.stockNumber === stockRef ||
          v.stockId.toLowerCase().includes(stockRef.toLowerCase()),
      )
    : snapshot?.vehicles[0];

  if (!vehicle) {
    return {
      summary:
        "Aucun véhicule en mémoire pour un pack marketing. " +
        "Dis « sync inventaire » puis « pack marketing STOCK# ». Prepare-only — pas d'auto-publish.",
    };
  }

  const pack = buildSalesMarketingPack({
    vehicle,
    workspaceId: input.workspaceId,
    nowIso,
  });

  const lines = [
    `## Pack marketing — ${pack.vehicleLabel}`,
    "",
    "**Hook Marketplace**",
    pack.marketplaceHookFr,
    "",
    "**Post Facebook (copier)**",
    pack.facebookPostFr,
    "",
    "**SMS prospection / livre (copier)**",
    pack.prospectingSmsFr,
    "",
    "**Pub — titre**",
    pack.adCopy.headlineFr,
    "",
    "**Reel — hook**",
    pack.videoScript.hookFr,
    "",
    pack.sellingAnglesFr.length > 0
      ? `Angles vendeur : ${pack.sellingAnglesFr.slice(0, 3).join(" · ")}`
      : null,
    "",
    "Prepare-only : tu publies / tu envoies. Oria ne poste pas et n'envoie pas. " +
      "Sales Desk → Marketing / Calendrier pour tout copier.",
  ];

  return { summary: lines.filter((l) => l !== null).join("\n") };
}
