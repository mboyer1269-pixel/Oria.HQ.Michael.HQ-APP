// Joris intents for the Buckingham operator tail: queue, batch prepare, capture, mark published.

import { buildMorningQueue } from "@/features/sales/sales-lead";
import { buildOperatorLoopSnapshot } from "@/features/sales/sales-operator-loop";
import { buildPublishCandidates } from "@/features/sales/publish-agent";
import { buildInventoryDebrief } from "@/features/inventory/inventory-debrief";
import { getInventorySnapshot } from "@/server/inventory/inventory-store";
import { syncPublicInventory } from "@/server/inventory/public-inventory-sync";
import { listMarketplaceListings, markListingPublishedManual } from "@/server/marketplace-listings/listing-store";
import { prepareMarketplaceListing } from "@/server/marketplace-listings/prepare-listing";
import { captureMarketplaceLead } from "@/server/marketplace-listings/capture-lead";
import { listSalesLeads } from "@/server/sales/lead-bank-store";
import {
  extractStockRefFromMessage,
  wantsInventorySync,
} from "./marketplace-listing-intent";

export type SalesOperatorIntentResult = {
  summary: string;
  packetIds?: string[];
  leadId?: string;
};

function extractPhone(message: string): string | null {
  const m = message.match(/(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/);
  return m?.[0] ?? null;
}

function extractName(message: string): string | null {
  const patterns = [
    /(?:lead|prospect|client)\s+([A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ'-]+(?:\s+[A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ'-]+)?)/i,
    /(?:nom|name)\s*[:=]\s*([A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ'-]+(?:\s+[A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ'-]+)?)/i,
  ];
  for (const re of patterns) {
    const hit = message.match(re);
    if (hit?.[1]) return hit[1].trim();
  }
  return null;
}

export async function handleSalesMorningQueueIntent(input: {
  workspaceId: string;
}): Promise<SalesOperatorIntentResult> {
  const nowIso = new Date().toISOString();
  const leads = listSalesLeads(input.workspaceId);
  const queue = buildMorningQueue(leads, nowIso);
  if (queue.length === 0) {
    return { summary: "File du matin vide — capture un walk-in ou un message Marketplace." };
  }
  const lines = queue.slice(0, 8).map((row) => {
    const due = row.due ? " [DÛ]" : "";
    return `• ${row.lead.fullName}${due} — ${row.lead.source} — score ${row.score} — ${row.lead.interestedModels[0] ?? "—"}`;
  });
  return {
    summary: `File du matin (${queue.filter((q) => q.due).length} dû(s)) :\n${lines.join("\n")}`,
  };
}

export async function handleMarketplaceBatchPrepareIntent(input: {
  workspaceId: string;
  message: string;
}): Promise<SalesOperatorIntentResult> {
  if (wantsInventorySync(input.message)) {
    await syncPublicInventory({ workspaceId: input.workspaceId });
  }
  const snap = getInventorySnapshot(input.workspaceId);
  const vehicles = snap?.vehicles ?? [];
  const listings = listMarketplaceListings(input.workspaceId);
  const debrief = vehicles.length > 0 ? buildInventoryDebrief(vehicles) : null;
  const candidates = buildPublishCandidates({
    vehicles,
    highlights: debrief?.highlights,
    listings,
    limit: 3,
  }).filter((c) => !c.alreadyPrepared);

  if (candidates.length === 0) {
    return {
      summary:
        "Aucune priorité à préparer — sync inventaire ou publie les fiches déjà prêtes dans Sales Desk.",
    };
  }

  const nowIso = new Date().toISOString();
  const packetIds: string[] = [];
  const titles: string[] = [];

  for (const c of candidates) {
    const result = await prepareMarketplaceListing({
      workspaceId: input.workspaceId,
      stockId: c.stockId,
      nowIso,
      enrichPhotos: false,
    });
    if (result.ok) {
      packetIds.push(result.packet.packetId);
      titles.push(result.packet.title);
    }
  }

  return {
    summary:
      `Préparé ${packetIds.length} fiche(s) Marketplace (publication manuelle) :\n` +
      titles.map((t, i) => `${i + 1}. ${t}`).join("\n") +
      "\n\nOuvre Sales Desk → Agent Publication → Bundle complet → Marketplace.",
    packetIds,
  };
}

export function handleMarketplaceMarkPublishedIntent(input: {
  workspaceId: string;
  message: string;
}): SalesOperatorIntentResult {
  const stockRef = extractStockRefFromMessage(input.message);
  const listings = listMarketplaceListings(input.workspaceId);
  const nowIso = new Date().toISOString();

  const packet = stockRef
    ? listings.find(
        (l) =>
          l.stockId.toUpperCase() === stockRef ||
          l.packetId.toUpperCase().includes(stockRef),
      )
    : listings.find(
        (l) => l.status === "ready_for_manual_publish" || l.status === "prepared",
      );

  if (!packet) {
    return {
      summary:
        "Aucune fiche à marquer — donne un # stock ou prépare une fiche d'abord.",
    };
  }

  const updated = markListingPublishedManual(input.workspaceId, packet.packetId, nowIso);
  if (!updated) {
    return { summary: `Impossible de marquer publié : ${packet.packetId}` };
  }

  return {
    summary:
      `Marqué publié : ${updated.title} (${updated.packetId}).\n` +
      "Capture chaque message inbound comme lead avec le même packetId.",
    packetIds: [updated.packetId],
  };
}

export function handleSalesLeadCaptureIntent(input: {
  workspaceId: string;
  message: string;
  createdByUserId: string;
}): SalesOperatorIntentResult {
  const stockRef = extractStockRefFromMessage(input.message);
  const listings = listMarketplaceListings(input.workspaceId);
  const published = listings.filter((l) => l.status === "published_manual");
  let packet =
    stockRef
      ? published.find(
          (l) =>
            l.stockId.toUpperCase() === stockRef ||
            l.packetId.toUpperCase().includes(stockRef),
        )
      : null;
  packet ??= published[0];

  if (!packet) {
    return {
      summary:
        "Aucune annonce publiée en mémoire — marque une fiche publiée avant de capturer un lead Marketplace.",
    };
  }

  const phone = extractPhone(input.message);
  const fullName = extractName(input.message);
  if (!phone || !fullName) {
    return {
      summary:
        `Annonce cible : ${packet.title} (${packet.packetId}).\n` +
        "Donne-moi nom + téléphone. Ex. : « capture lead Marketplace Sam Gagnon 819-555-0199 »",
    };
  }

  const result = captureMarketplaceLead({
    workspaceId: input.workspaceId,
    packetId: packet.packetId,
    fullName,
    phone,
    createdByUserId: input.createdByUserId,
    nowIso: new Date().toISOString(),
  });

  if (!result.ok) {
    return { summary: `Capture échouée : ${result.errors.join("; ")}` };
  }

  return {
    summary:
      `Lead capturé : ${result.lead.fullName} (${result.lead.phone}) → ${packet.title}.\n` +
      `Stage : ${result.lead.stage}. Relance due : ${result.lead.nextFollowUpAt ?? "—"}.`,
    leadId: result.lead.leadId,
    packetIds: [packet.packetId],
  };
}

export async function handleSalesOperatorBriefIntent(input: {
  workspaceId: string;
}): Promise<SalesOperatorIntentResult> {
  const snap = getInventorySnapshot(input.workspaceId);
  const vehicles = snap?.vehicles ?? [];
  const listings = listMarketplaceListings(input.workspaceId);
  const leads = listSalesLeads(input.workspaceId);
  const nowIso = new Date().toISOString();
  const loop = buildOperatorLoopSnapshot({
    vehicles,
    listings,
    leads,
    debrief: vehicles.length > 0 ? buildInventoryDebrief(vehicles) : null,
    nowIso,
  });

  return {
    summary: [
      "Brief opérateur Buckingham GM :",
      `• ${loop.vehicleCount} véhicules · ${loop.readyToPublishCount} à publier · ${loop.publishedCount} live`,
      `• ${loop.activeLeadCount} leads actifs · ${loop.dueFollowUpCount} relance(s) due(s)`,
      "",
      "Prochaines actions :",
      ...loop.nextActionsFr.map((a) => `• ${a}`),
    ].join("\n"),
  };
}
