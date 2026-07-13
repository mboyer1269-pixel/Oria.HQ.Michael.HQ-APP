#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});

const ingestMod = await jiti.import(path.join(projectRoot, "src/server/inventory/inventory-ingest.ts"));
const invStoreMod = await jiti.import(path.join(projectRoot, "src/server/inventory/inventory-store.ts"));
const prepareMod = await jiti.import(path.join(projectRoot, "src/server/marketplace-listings/prepare-listing.ts"));
const listingStoreMod = await jiti.import(path.join(projectRoot, "src/server/marketplace-listings/listing-store.ts"));
const marketingMod = await jiti.import(path.join(projectRoot, "src/features/sales/marketing-content-pack.ts"));
const packStoreMod = await jiti.import(path.join(projectRoot, "src/server/sales/marketing-pack-store.ts"));
const captureMod = await jiti.import(path.join(projectRoot, "src/server/marketplace-listings/capture-lead.ts"));
const leadStoreMod = await jiti.import(path.join(projectRoot, "src/server/sales/lead-bank-store.ts"));
const touchMod = await jiti.import(path.join(projectRoot, "src/server/sales/touch-lead.ts"));
const laneMod = await jiti.import(path.join(projectRoot, "src/features/sales/follow-up-lane.ts"));
const draftMod = await jiti.import(path.join(projectRoot, "src/features/sales/follow-up-draft.ts"));
const loopMod = await jiti.import(path.join(projectRoot, "src/features/sales/sales-operator-loop.ts"));

const { ingestManualInventory } = ingestMod;
const { clearInventoryStore, findVehicleInSnapshot } = invStoreMod;
const { prepareMarketplaceListing } = prepareMod;
const { clearMarketplaceListingStore, markListingPublishedManual } = listingStoreMod;
const { buildMarketingContentPack } = marketingMod;
const { saveMarketingPack, clearMarketingPackStore } = packStoreMod;
const { captureMarketplaceLead } = captureMod;
const { clearLeadBankStore, listSalesLeads } = leadStoreMod;
const { touchSalesLead } = touchMod;
const { resolveFollowUpLane } = laneMod;
const { prepareFollowUpDraft } = draftMod;
const { buildOperatorLoopSnapshot } = loopMod;

const WS = "ws_smoke_sales";
const NOW = "2026-07-13T17:05:00.000Z";

function log(msg) {
  console.log(`[smoke:sales] ${msg}`);
}

async function main() {
  clearInventoryStore();
  clearMarketplaceListingStore();
  clearLeadBankStore();
  clearMarketingPackStore();

  ingestManualInventory({
    workspaceId: WS,
    nowIso: NOW,
    vehicles: [
      {
        stockId: "stk_trax",
        year: 2026,
        make: "Chevrolet",
        model: "Trax",
        condition: "new",
        priceCad: 31999,
        photoUrls: ["https://example.com/trax.jpg"],
      },
    ],
  });
  log("inventory ingested");

  const listing = await prepareMarketplaceListing({
    workspaceId: WS,
    stockId: "stk_trax",
    nowIso: NOW,
    enrichPhotos: false,
  });
  assert.equal(listing.ok, true);
  const published = markListingPublishedManual(WS, listing.packet.packetId, NOW);
  assert.ok(published);
  log("listing prepared + marked published");

  const vehicle = findVehicleInSnapshot(WS, "stk_trax");
  assert.ok(vehicle);
  const pack = buildMarketingContentPack({
    packId: "mcp_smoke",
    vehicle,
    nowIso: NOW,
  });
  saveMarketingPack(WS, pack);
  log("marketing pack saved");

  const captured = captureMarketplaceLead({
    workspaceId: WS,
    packetId: listing.packet.packetId,
    fullName: "Marie Test",
    phone: "819-555-0101",
    messageExcerpt: "Disponible pour essai?",
    createdByUserId: "smoke",
    nowIso: NOW,
  });
  assert.equal(captured.ok, true);
  log("lead captured");

  const lead = listSalesLeads(WS)[0];
  assert.equal(resolveFollowUpLane(lead.source), "reply_assist");
  const draft = prepareFollowUpDraft({
    lead,
    channel: "sms",
    lane: resolveFollowUpLane(lead.source),
    nowIso: NOW,
  });
  assert.equal(draft.ok, true);

  const touched = touchSalesLead({
    workspaceId: WS,
    leadId: lead.leadId,
    createdByUserId: "smoke",
    nowIso: NOW,
  });
  assert.equal(touched.ok, true);
  log("lead touched after contact");

  const loop = buildOperatorLoopSnapshot({
    vehicles: [vehicle],
    listings: [published],
    leads: listSalesLeads(WS),
    debrief: null,
    nowIso: NOW,
  });
  assert.ok(loop.publishedCount >= 1);
  log("operator loop snapshot ok");
  log("PASS");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
