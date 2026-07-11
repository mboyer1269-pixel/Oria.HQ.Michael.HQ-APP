#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
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

const ingestMod = await jiti.import(
  path.join(projectRoot, "src/server/inventory/inventory-ingest.ts"),
);
const invStoreMod = await jiti.import(
  path.join(projectRoot, "src/server/inventory/inventory-store.ts"),
);
const leadStoreMod = await jiti.import(
  path.join(projectRoot, "src/server/sales/lead-bank-store.ts"),
);
const outcomeMod = await jiti.import(
  path.join(projectRoot, "src/server/sales/sale-outcome.ts"),
);
const prepareMod = await jiti.import(
  path.join(projectRoot, "src/server/marketplace-listings/prepare-listing.ts"),
);
const captureMod = await jiti.import(
  path.join(projectRoot, "src/server/marketplace-listings/capture-lead.ts"),
);
const listingStoreMod = await jiti.import(
  path.join(projectRoot, "src/server/marketplace-listings/listing-store.ts"),
);
const draftMod = await jiti.import(
  path.join(projectRoot, "src/features/sales/follow-up-draft.ts"),
);
const queueMod = await jiti.import(
  path.join(projectRoot, "src/features/sales/sales-lead.ts"),
);

const { ingestManualInventory } = ingestMod;
const { clearInventoryStore } = invStoreMod;
const { upsertSalesLead, listSalesLeads, clearLeadBankStore } = leadStoreMod;
const { captureSaleOutcome } = outcomeMod;
const { prepareMarketplaceListing } = prepareMod;
const { captureMarketplaceLead } = captureMod;
const { clearMarketplaceListingStore, markListingPublishedManual } = listingStoreMod;
const { prepareFollowUpDraft } = draftMod;
const { buildMorningQueue } = queueMod;

const WS = "ws_buckingham_test";
const NOW = "2026-07-11T15:00:00.000Z";

test("Buckingham loop: stock → marketplace → lead → follow-up → sold", async (t) => {
  clearInventoryStore();
  clearLeadBankStore();
  clearMarketplaceListingStore();

  await t.test("ingest inventory", () => {
    const result = ingestManualInventory({
      workspaceId: WS,
      nowIso: NOW,
      vehicles: [
        {
          stockId: "stk_trax_1",
          year: 2025,
          make: "Chevrolet",
          model: "Trax",
          trim: "LT",
          condition: "new",
          priceCad: 28999,
          photoUrls: ["https://example.com/trax.jpg"],
        },
        {
          stockId: "stk_sierra_1",
          year: 2024,
          make: "GMC",
          model: "Sierra",
          trim: "1500",
          condition: "used",
          priceCad: 52900,
          mileageKm: 32000,
          photoUrls: [],
        },
      ],
    });
    assert.equal(result.ok, true);
    assert.equal(result.snapshot.vehicles.length, 2);
  });

  let packetId = "";

  await t.test("prepare marketplace listing from stock", async () => {
    const result = await prepareMarketplaceListing({
      workspaceId: WS,
      stockId: "stk_trax_1",
      packetId: "mkt_trax_demo",
      nowIso: NOW,
      enrichPhotos: false,
    });
    assert.equal(result.ok, true);
    assert.equal(result.packet.requiresManualPublish, true);
    packetId = result.packet.packetId;
    markListingPublishedManual(WS, packetId, NOW);
  });

  let leadId = "";

  await t.test("capture inbound marketplace lead into bank", () => {
    const result = captureMarketplaceLead({
      workspaceId: WS,
      packetId,
      fullName: "Sam Gagnon",
      phone: "819-555-0199",
      messageExcerpt: "Toujours dispo le Trax LT ?",
      createdByUserId: "user_michael",
      nowIso: NOW,
    });
    assert.equal(result.ok, true);
    assert.equal(result.lead.source, "marketplace_message");
    assert.equal(result.lead.sourceRef, packetId);
    assert.deepEqual(result.lead.interestedStockIds, ["stk_trax_1"]);
    assert.equal(result.lead.nextFollowUpAt, NOW);
    leadId = result.lead.leadId;
  });

  await t.test("manual phone lead also upserts", () => {
    const result = upsertSalesLead({
      workspaceId: WS,
      nowIso: NOW,
      lead: {
        leadId: "lead_phone_1",
        fullName: "Jordan Roy",
        phone: "+1 819 555 0100",
        source: "phone_in",
        interestedStockIds: ["stk_sierra_1"],
        interestedModels: ["Sierra 1500"],
        stage: "qualified",
        consentBasis: "express",
        nextFollowUpAt: "2026-07-11T14:00:00.000Z",
        notes: "Appel ce matin",
        createdByUserId: "user_michael",
      },
    });
    assert.equal(result.ok, true);
    assert.equal(listSalesLeads(WS).length, 2);
  });

  await t.test("morning queue prioritizes due marketplace lead", () => {
    const queue = buildMorningQueue(listSalesLeads(WS), NOW);
    assert.equal(queue.length, 2);
    assert.equal(queue[0].due, true);
  });

  await t.test("prepare SMS follow-up without sending", () => {
    const lead = listSalesLeads(WS).find((l) => l.leadId === leadId);
    assert.ok(lead);
    const draft = prepareFollowUpDraft({
      lead,
      channel: "sms",
      lane: "reply_assist",
      vehicleHint: "2025 Chevrolet Trax LT",
      nowIso: NOW,
    });
    assert.equal(draft.ok, true);
    assert.equal(draft.draft.noExecutionAuthorized, true);
  });

  await t.test("capture sold with stock id", () => {
    const sold = captureSaleOutcome({
      workspaceId: WS,
      leadId,
      outcome: "sold",
      soldStockId: "stk_trax_1",
      notes: "Essai + dépôt",
      nowIso: "2026-07-12T18:00:00.000Z",
    });
    assert.equal(sold.ok, true);
    assert.equal(sold.lead.stage, "sold");
    assert.equal(sold.lead.soldStockId, "stk_trax_1");
  });

  await t.test("lost requires reason", () => {
    const bad = captureSaleOutcome({
      workspaceId: WS,
      leadId: "lead_phone_1",
      outcome: "lost",
    });
    assert.equal(bad.ok, false);
    const ok = captureSaleOutcome({
      workspaceId: WS,
      leadId: "lead_phone_1",
      outcome: "lost",
      lostReason: "budget trop bas",
      nowIso: "2026-07-12T19:00:00.000Z",
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.lead.stage, "lost");
  });
});
