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
  },
});

const marketingMod = await jiti.import(
  path.join(projectRoot, "src/features/sales/marketing-content-pack.ts"),
);
const publishMod = await jiti.import(
  path.join(projectRoot, "src/features/sales/publish-agent.ts"),
);
const inboundMod = await jiti.import(
  path.join(projectRoot, "src/features/sales/marketplace-inbound-draft.ts"),
);
const listingMod = await jiti.import(
  path.join(projectRoot, "src/features/marketplace-listings/listing-packet.ts"),
);

const { buildMarketingContentPack, MARKETING_CHANNELS } = marketingMod;
const { buildPublishCandidates, formatPublishBundle } = publishMod;
const { prepareMarketplaceInboundDraft } = inboundMod;
const { prepareListingFromStock } = listingMod;

const NOW = "2026-07-13T16:00:00.000Z";

const sampleVehicle = {
  stockId: "stk_trax_demo",
  year: 2026,
  make: "Chevrolet",
  model: "Trax",
  trim: "LT",
  condition: "new",
  priceCad: 31999,
  mileageKm: 12,
  exteriorColor: "Rouge",
  photoUrls: ["https://example.com/1.jpg", "https://example.com/2.jpg"],
  listingUrl: "https://buckinghamgm.com/trax",
};

test("marketing content pack — all channels + lead tips", () => {
  const pack = buildMarketingContentPack({
    packId: "mcp_test",
    vehicle: sampleVehicle,
    nowIso: NOW,
  });

  assert.equal(pack.stockId, "stk_trax_demo");
  assert.equal(pack.pieces.length, MARKETING_CHANNELS.length);
  assert.equal(pack.requiresManualPublish, true);
  assert.equal(pack.noExecutionAuthorized, true);
  assert.ok(pack.leadTips.length >= 3);

  const fbPost = pack.pieces.find((p) => p.channel === "facebook_post");
  assert.ok(fbPost);
  assert.ok(fbPost.body.includes("Buckingham"));
  assert.ok(fbPost.body.includes("#Gatineau"));

  const reel = pack.pieces.find((p) => p.channel === "instagram_reel");
  assert.ok(reel?.shotNotes && reel.shotNotes.length >= 3);
});

test("publish candidates — prioritizes highlights and excludes published", () => {
  const candidates = buildPublishCandidates({
    vehicles: [
      sampleVehicle,
      {
        ...sampleVehicle,
        stockId: "stk_old",
        year: 2019,
        model: "Equinox",
        condition: "used",
        photoUrls: ["https://example.com/x.jpg"],
      },
    ],
    highlights: [
      {
        stockId: "stk_trax_demo",
        year: 2026,
        make: "Chevrolet",
        model: "Trax",
        condition: "new",
        priceCad: 31999,
        photoCount: 2,
        reason: "Neuf populaire",
      },
    ],
    listings: [
      {
        packetId: "pkt_old",
        workspaceId: "ws",
        stockId: "stk_old",
        title: "old",
        description: "d",
        photoUrls: [],
        locationHint: "Gatineau",
        disclaimers: [],
        status: "published_manual",
        createdAt: NOW,
        updatedAt: NOW,
        requiresManualPublish: true,
        noExecutionAuthorized: true,
      },
    ],
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].stockId, "stk_trax_demo");
  assert.ok(candidates[0].priorityScore > 0);
  assert.ok(candidates[0].reasons.some((r) => r.includes("débrief")));
});

test("publish bundle + inbound draft", () => {
  const packet = prepareListingFromStock({
    packetId: "pkt_trax",
    workspaceId: "ws",
    vehicle: sampleVehicle,
    nowIso: NOW,
  });

  const bundle = formatPublishBundle(packet);
  assert.ok(bundle.includes("TITRE"));
  assert.ok(bundle.includes("facebook.com/marketplace"));

  const draft = prepareMarketplaceInboundDraft({
    packet,
    repFirstName: "Marc",
    nowIso: NOW,
  });
  assert.ok(draft.body.includes("Marc"));
  assert.ok(draft.body.includes("essai"));
  assert.equal(draft.requiresManualSend, true);
});
