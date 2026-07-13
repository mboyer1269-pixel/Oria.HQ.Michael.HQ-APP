#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: { "@": path.join(projectRoot, "src") },
});

const loopMod = await jiti.import(path.join(projectRoot, "src/features/sales/sales-operator-loop.ts"));
const laneMod = await jiti.import(path.join(projectRoot, "src/features/sales/follow-up-lane.ts"));
const listingStoreMod = await jiti.import(
  path.join(projectRoot, "src/server/marketplace-listings/listing-store.ts"),
);
const prepareMod = await jiti.import(
  path.join(projectRoot, "src/server/marketplace-listings/prepare-listing.ts"),
);
const ingestMod = await jiti.import(path.join(projectRoot, "src/server/inventory/inventory-ingest.ts"));
const invStoreMod = await jiti.import(path.join(projectRoot, "src/server/inventory/inventory-store.ts"));

const { buildOperatorLoopSnapshot } = loopMod;
const { resolveFollowUpLane } = laneMod;
const { clearMarketplaceListingStore, listMarketplaceListings } = listingStoreMod;
const { prepareMarketplaceListing } = prepareMod;
const { ingestManualInventory } = ingestMod;
const { clearInventoryStore } = invStoreMod;

const WS = "ws_loop_test";
const NOW = "2026-07-13T17:00:00.000Z";

test("operator loop snapshot suggests publish when ready", () => {
  const snap = buildOperatorLoopSnapshot({
    vehicles: [{ stockId: "s1", year: 2026, make: "Chevrolet", model: "Trax", condition: "new", photoUrls: [] }],
    listings: [
      {
        packetId: "p1",
        workspaceId: WS,
        stockId: "s1",
        title: "Trax",
        description: "d",
        photoUrls: [],
        locationHint: "Gatineau",
        disclaimers: [],
        status: "ready_for_manual_publish",
        createdAt: NOW,
        updatedAt: NOW,
        requiresManualPublish: true,
        noExecutionAuthorized: true,
      },
    ],
    leads: [],
    debrief: null,
    nowIso: NOW,
  });
  assert.ok(snap.readyToPublishCount === 1);
  assert.ok(snap.nextActionsFr[0].includes("publie"));
});

test("resolveFollowUpLane — marketplace uses reply_assist", () => {
  assert.equal(resolveFollowUpLane("marketplace_message"), "reply_assist");
  assert.equal(resolveFollowUpLane("phone_in"), "follow_up");
});

test("re-prepare supersedes prior packet", async () => {
  clearInventoryStore();
  clearMarketplaceListingStore();
  ingestManualInventory({
    workspaceId: WS,
    nowIso: NOW,
    vehicles: [
      {
        stockId: "stk_a",
        year: 2026,
        make: "GMC",
        model: "Terrain",
        condition: "new",
        priceCad: 40000,
        photoUrls: ["https://example.com/a.jpg"],
      },
    ],
  });

  const first = await prepareMarketplaceListing({
    workspaceId: WS,
    stockId: "stk_a",
    packetId: "pkt_old",
    nowIso: NOW,
    enrichPhotos: false,
  });
  assert.equal(first.ok, true);

  const second = await prepareMarketplaceListing({
    workspaceId: WS,
    stockId: "stk_a",
    packetId: "pkt_new",
    nowIso: NOW,
    enrichPhotos: false,
  });
  assert.equal(second.ok, true);

  const all = listMarketplaceListings(WS);
  const superseded = all.filter((l) => l.status === "superseded");
  assert.equal(superseded.length, 1);
  assert.equal(superseded[0].packetId, "pkt_old");
});
