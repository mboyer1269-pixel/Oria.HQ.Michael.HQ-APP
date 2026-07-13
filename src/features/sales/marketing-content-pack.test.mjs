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

const mod = await jiti.import(path.join(__dirname, "marketing-content-pack.ts"));
const {
  buildMarketingContentPack,
  validateMarketingContentPack,
  formatMarketingPackClipboard,
  rankVehiclesForPublishQueue,
  MARKETING_CHANNELS,
} = mod;

const NOW = "2026-07-13T16:00:00.000Z";

const vehicle = {
  stockId: "stk_trax_1",
  year: 2025,
  make: "Chevrolet",
  model: "Trax",
  trim: "LT",
  condition: "new",
  priceCad: 28999,
  photoUrls: [
    "https://example.com/a.jpg",
    "https://example.com/b.jpg",
    "https://example.com/c.jpg",
    "https://example.com/d.jpg",
    "https://example.com/e.jpg",
  ],
  listingUrl: "https://www.buckinghamgm.com/neufs/trax",
};

test("marketing content pack — Directeur Marketing", async (t) => {
  await t.test("builds 5-channel pack locked to manual publish", () => {
    const pack = buildMarketingContentPack({
      packId: "mktg_1",
      workspaceId: "ws_1",
      vehicle,
      nowIso: NOW,
    });
    assert.equal(pack.requiresManualPublish, true);
    assert.equal(pack.noExecutionAuthorized, true);
    assert.equal(pack.status, "ready_to_publish");
    assert.equal(pack.assets.length, MARKETING_CHANNELS.length);
    assert.equal(validateMarketingContentPack(pack).valid, true);
    assert.match(pack.angle, /Neuf|immédiat/i);
    const channels = pack.assets.map((a) => a.channel).sort();
    assert.deepEqual(channels, [...MARKETING_CHANNELS].sort());
  });

  await t.test("clipboard includes CTA ESSAI and no auto-post claim", () => {
    const pack = buildMarketingContentPack({
      packId: "mktg_2",
      workspaceId: "ws_1",
      vehicle,
      nowIso: NOW,
    });
    const clip = formatMarketingPackClipboard(pack);
    assert.match(clip, /ESSAI/);
    assert.match(clip, /Prepare-only|publication manuelle/i);
    assert.match(clip, /Marketplace/);
    assert.match(clip, /Reel|Short/i);
  });

  await t.test("publish queue ranks photo-rich new vehicles first", () => {
    const ranked = rankVehiclesForPublishQueue(
      [
        {
          stockId: "used_no_photo",
          year: 2018,
          make: "Chevrolet",
          model: "Malibu",
          condition: "used",
          photoUrls: [],
        },
        vehicle,
        {
          stockId: "used_with_photos",
          year: 2022,
          make: "GMC",
          model: "Terrain",
          condition: "used",
          priceCad: 31900,
          photoUrls: ["https://example.com/1.jpg", "https://example.com/2.jpg"],
        },
      ],
      3,
    );
    assert.equal(ranked[0].stockId, "stk_trax_1");
    assert.equal(ranked.length, 3);
  });
});
