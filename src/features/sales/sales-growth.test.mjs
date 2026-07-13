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

const publishingMod = await jiti.import(
  path.join(projectRoot, "src/features/sales/publishing-bundle.ts"),
);
const marketingMod = await jiti.import(
  path.join(projectRoot, "src/features/sales/marketing-content.ts"),
);
const playbookMod = await jiti.import(
  path.join(projectRoot, "src/features/sales/lead-prospect-playbook.ts"),
);

const { buildPublishingBundle, formatPublishingBundleClipboard } = publishingMod;
const { buildMarketingContentBundle, buildFacebookPagePost } = marketingMod;
const { buildLeadProspectPlaybook } = playbookMod;

const SAMPLE_VEHICLE = {
  stockId: "26344-NEUF",
  year: 2026,
  make: "Chevrolet",
  model: "Trax",
  trim: "LT",
  condition: "new",
  priceCad: 28999,
  photoUrls: [
    "https://example.com/1.jpg",
    "https://example.com/2.jpg",
    "https://example.com/3.jpg",
    "https://example.com/4.jpg",
    "https://example.com/5.jpg",
    "https://example.com/6.jpg",
    "https://example.com/7.jpg",
    "https://example.com/8.jpg",
  ],
  listingUrl: "https://www.buckinghamgm.com/inventory/26344",
};

const NOW = "2026-07-13T16:00:00.000Z";

test("publishing bundle locks manual publish and includes marketing", () => {
  const bundle = buildPublishingBundle({
    bundleId: "pub_test_1",
    workspaceId: "ws_test",
    vehicle: SAMPLE_VEHICLE,
    nowIso: NOW,
  });

  assert.equal(bundle.requiresManualPublish, true);
  assert.equal(bundle.noExecutionAuthorized, true);
  assert.equal(bundle.stockId, "26344-NEUF");
  assert.ok(bundle.marketplace.title.includes("Trax"));
  assert.ok(bundle.marketing.facebookPost.body.includes("Gatineau") || bundle.marketing.facebookPost.body.includes("buckinghamgm"));
  assert.ok(bundle.priorityScore >= 70);
  assert.ok(bundle.publishChecklistFr.length >= 8);

  const clipboard = formatPublishingBundleClipboard(bundle);
  assert.match(clipboard, /MARKETPLACE/);
  assert.match(clipboard, /REEL/);
  assert.match(clipboard, /ne publie pas automatiquement/i);
});

test("marketing director generates FB post, reel, and ad copy", () => {
  const bundle = buildMarketingContentBundle(SAMPLE_VEHICLE);
  assert.ok(bundle.facebookPost.body.length > 50);
  assert.ok(bundle.facebookPost.hashtags.includes("#Gatineau"));
  assert.ok(bundle.reelScript.beatsFr.length >= 3);
  assert.ok(bundle.metaAd.headlineFr.includes("Trax"));
  assert.equal(bundle.reelScript.durationSec, 35);

  const post = buildFacebookPagePost(SAMPLE_VEHICLE);
  assert.match(post.body, /Essai/i);
});

test("lead prospect playbook prioritizes unpublished vehicles", () => {
  const playbook = buildLeadProspectPlaybook({
    vehicles: [SAMPLE_VEHICLE],
    leads: [],
    publishedStockIds: [],
    nowIso: NOW,
  });

  assert.equal(playbook.topVehicles.length, 1);
  assert.equal(playbook.topVehicles[0].stockId, "26344-NEUF");
  assert.ok(playbook.dailyActionsFr.length >= 1);
  assert.match(playbook.frenchSummary, /26344|Trax|véhicules/i);
});

test("published vehicles get boost_with_reel recommendation", () => {
  const playbook = buildLeadProspectPlaybook({
    vehicles: [SAMPLE_VEHICLE],
    leads: [],
    publishedStockIds: ["26344-NEUF"],
    nowIso: NOW,
  });

  assert.equal(playbook.topVehicles[0].primaryAction, "boost_with_reel");
});
