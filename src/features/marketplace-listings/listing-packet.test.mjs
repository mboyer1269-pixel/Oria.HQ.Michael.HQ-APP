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

const packetMod = await jiti.import(path.join(__dirname, "listing-packet.ts"));
const { prepareListingFromStock, validateMarketplaceListingPacket } = packetMod;

const NOW = "2026-07-11T12:00:00.000Z";

test("marketplace listing packet from stock", async (t) => {
  await t.test("locks manual publish and builds FR copy", () => {
    const packet = prepareListingFromStock({
      packetId: "mkt_1",
      workspaceId: "ws_1",
      nowIso: NOW,
      vehicle: {
        stockId: "stk_trax_1",
        year: 2025,
        make: "Chevrolet",
        model: "Trax",
        trim: "LT",
        condition: "new",
        priceCad: 28999,
        photoUrls: ["https://example.com/a.jpg"],
        listingUrl: "https://www.buckinghamgm.com/neufs/trax",
      },
    });
    assert.equal(packet.requiresManualPublish, true);
    assert.equal(packet.noExecutionAuthorized, true);
    assert.equal(packet.status, "ready_for_manual_publish");
    assert.match(packet.title, /2025 Chevrolet Trax LT/);
    assert.match(packet.title, /Buckingham GM/);
    assert.match(packet.description, /Buckingham/);
    assert.match(packet.description, /ESSAI/);
    assert.equal(validateMarketplaceListingPacket(packet).valid, true);
  });
});
