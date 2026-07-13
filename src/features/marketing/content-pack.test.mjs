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

const packMod = await jiti.import(path.join(__dirname, "content-pack.ts"));
const calendarMod = await jiti.import(path.join(__dirname, "content-calendar.ts"));
const { buildVehicleContentPack } = packMod;
const { buildContentCalendar } = calendarMod;

const NOW = "2026-07-13T12:00:00.000Z";

function vehicle(overrides = {}) {
  return {
    stockId: "26001-NEUF",
    year: 2026,
    make: "Chevrolet",
    model: "Trax",
    trim: "LT",
    condition: "new",
    priceCad: 28999,
    exteriorColor: "Noir mosaïque",
    photoUrls: [
      "https://cdn.example.com/1.jpg",
      "https://cdn.example.com/2.jpg",
      "https://cdn.example.com/3.jpg",
    ],
    listingUrl: "https://www.buckinghamgm.com/neufs/trax-26001",
    ...overrides,
  };
}

test("vehicle content pack", async (t) => {
  await t.test("builds FB post, marketplace copy, ad and 2 video scripts", () => {
    const pack = buildVehicleContentPack({
      packId: "pack_1",
      workspaceId: "ws_1",
      vehicle: vehicle(),
      nowIso: NOW,
    });

    assert.equal(pack.vehicleLabel, "2026 Chevrolet Trax LT");
    assert.match(pack.facebookPostFr, /Trax/);
    assert.match(pack.facebookPostFr, /Buckingham/);
    assert.match(pack.facebookPostFr, /utm_source=facebook/);
    assert.match(pack.facebookPostFr, /#BuckinghamGM/);

    // Marketplace copy: hook first line, CTA, compliance line.
    const firstLine = pack.marketplaceDescriptionFr.split("\n")[0];
    assert.match(firstLine, /Trax/);
    assert.match(firstLine, /28\s?999/);
    assert.match(pack.marketplaceDescriptionFr, /essai routier/i);
    assert.match(pack.marketplaceDescriptionFr, /taxes et frais/);

    assert.match(pack.adCopy.headlineFr, /Trax/);
    assert.equal(pack.adCopy.ctaLabelFr, "Réserver un essai");

    assert.equal(pack.videoScripts.length, 2);
    const reel = pack.videoScripts.find((s) => s.platform === "reel_short");
    const youtube = pack.videoScripts.find((s) => s.platform === "youtube");
    assert.ok(reel && reel.durationSeconds <= 30);
    assert.ok(reel.scenes.length >= 3);
    assert.ok(youtube && youtube.durationSeconds <= 60);
    assert.match(reel.ctaFr, /ESSAI/);

    // Model-knowledge grounding for a known GM model.
    assert.ok(pack.sellingAnglesFr.length > 0);
  });

  await t.test("handles unknown models and missing price gracefully", () => {
    const pack = buildVehicleContentPack({
      packId: "pack_2",
      workspaceId: "ws_1",
      vehicle: vehicle({
        make: "Hyundai",
        model: "Tucson",
        condition: "used",
        priceCad: undefined,
        mileageKm: 64000,
        listingUrl: undefined,
      }),
      nowIso: NOW,
    });
    assert.match(pack.facebookPostFr, /prix sur demande/);
    assert.equal(pack.utmUrl, undefined);
    assert.equal(pack.sellingAnglesFr.length, 0);
    assert.equal(pack.videoScripts.length, 2);
  });
});

test("content calendar", async (t) => {
  await t.test("builds 7 slots mixing spotlights, videos and lead magnets", () => {
    const calendar = buildContentCalendar({
      calendarId: "cal_1",
      workspaceId: "ws_1",
      vehicles: [
        vehicle(),
        vehicle({ stockId: "26002-NEUF", model: "Terrain", make: "GMC" }),
        vehicle({ stockId: "U-100", model: "Equinox", condition: "used" }),
      ],
      nowIso: NOW,
    });

    assert.equal(calendar.slots.length, 7);
    const kinds = new Set(calendar.slots.map((s) => s.kind));
    assert.ok(kinds.has("vehicle_spotlight"));
    assert.ok(kinds.has("reel_video"));
    assert.ok(kinds.has("lead_magnet"));
    assert.ok(kinds.has("trust_story"));

    // Day 0 spotlights the top-scored vehicle and explains why.
    assert.equal(calendar.slots[0].kind, "vehicle_spotlight");
    assert.ok(calendar.slots[0].stockId);
    assert.match(calendar.slots[0].briefFr, /Raisons/);

    // No stock is spotlighted twice.
    const stockIds = calendar.slots.map((s) => s.stockId).filter(Boolean);
    assert.equal(new Set(stockIds).size, stockIds.length);
  });

  await t.test("empty inventory still yields a full week of generic slots", () => {
    const calendar = buildContentCalendar({
      calendarId: "cal_2",
      workspaceId: "ws_1",
      vehicles: [],
      nowIso: NOW,
    });
    assert.equal(calendar.slots.length, 7);
    assert.ok(calendar.operatorNotesFr.some((n) => n.includes("Sync")));
  });
});
