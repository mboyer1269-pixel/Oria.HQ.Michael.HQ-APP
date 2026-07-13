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
  prepareMarketingContentPack,
  validateMarketingContentPack,
  formatMarketingPackClipboard,
  buildMarketplaceLeadDescription,
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
    "https://example.com/f.jpg",
  ],
  listingUrl: "https://www.buckinghamgm.com/neufs/trax",
};

test("marketing content pack — Directeur Marketing", async (t) => {
  await t.test("locks manual publish and builds multi-channel kit", () => {
    const pack = prepareMarketingContentPack({
      packId: "pack_1",
      workspaceId: "ws_1",
      nowIso: NOW,
      vehicle,
    });
    assert.equal(pack.requiresManualPublish, true);
    assert.equal(pack.noExecutionAuthorized, true);
    assert.equal(pack.publishPriority, "hot");
    assert.match(pack.marketplace.title, /Trax/);
    assert.match(pack.marketplace.description, /ESSAI/);
    assert.match(pack.facebookPost.caption, /ESSAI/);
    assert.ok(pack.reel.beats.length >= 4);
    assert.match(pack.reel.voiceover, /Buckingham/);
    assert.match(pack.youtubeShort.title, /Trax/);
    assert.equal(pack.metaAd.callToAction, "SEND_MESSAGE");
    assert.match(pack.leadCaptureScript, /essai/i);
    assert.ok(pack.publishChecklist.length >= 5);
    assert.equal(validateMarketingContentPack(pack).valid, true);
  });

  await t.test("clipboard kit includes all channels", () => {
    const pack = prepareMarketingContentPack({
      packId: "pack_2",
      workspaceId: "ws_1",
      nowIso: NOW,
      vehicle,
    });
    const text = formatMarketingPackClipboard(pack);
    assert.match(text, /MARKETPLACE/);
    assert.match(text, /FACEBOOK/);
    assert.match(text, /REEL/);
    assert.match(text, /YOUTUBE/);
    assert.match(text, /META AD/);
    assert.match(text, /Prepare-only/);
  });

  await t.test("marketplace lead description has conversion CTA", () => {
    const desc = buildMarketplaceLeadDescription(vehicle);
    assert.match(desc, /Buckingham/);
    assert.match(desc, /ESSAI/);
    assert.match(desc, /28/);
  });
});
