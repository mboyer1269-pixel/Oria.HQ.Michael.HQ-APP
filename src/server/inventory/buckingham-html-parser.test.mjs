#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
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

const allowMod = await jiti.import(path.join(__dirname, "public-inventory-allowlist.ts"));
const parseMod = await jiti.import(path.join(__dirname, "buckingham-html-parser.ts"));
const syncMod = await jiti.import(path.join(__dirname, "public-inventory-sync.ts"));
const invStore = await jiti.import(path.join(__dirname, "inventory-store.ts"));

const { checkPublicInventoryUrl } = allowMod;
const { parseBuckinghamInventoryHtml } = parseMod;
const { syncPublicInventory } = syncMod;
const { clearInventoryStore, getInventorySnapshot } = invStore;

const fixture = fs.readFileSync(
  path.join(__dirname, "fixtures/buckingham-neufs-sample.html"),
  "utf8",
);

test("public inventory allowlist + Buckingham HTML parser", async (t) => {
  await t.test("allowlist accepts Buckingham inventory URLs only", () => {
    assert.equal(
      checkPublicInventoryUrl("https://www.buckinghamgm.com/neufs/inventaire/recherche.html").ok,
      true,
    );
    assert.equal(checkPublicInventoryUrl("https://evil.example/neufs/inventaire/x").ok, false);
    assert.equal(checkPublicInventoryUrl("http://www.buckinghamgm.com/neufs/inventaire/x").ok, false);
  });

  await t.test("parses stock, VIN, price, photo, VDP from fixture", () => {
    const parsed = parseBuckinghamInventoryHtml(
      fixture,
      "https://www.buckinghamgm.com/neufs/inventaire/recherche.html",
    );
    assert.ok(parsed.vehicles.length >= 1);
    const trax = parsed.vehicles.find((v) => v.stockId === "26344-NEUF");
    assert.ok(trax);
    assert.equal(trax.make, "Chevrolet");
    assert.equal(trax.model, "Trax");
    assert.equal(trax.year, 2026);
    assert.equal(trax.vin, "KL77LHE24TC161868");
    assert.equal(trax.priceCad, 33466);
    assert.ok(trax.photoUrls.length >= 1);
    assert.match(trax.listingUrl ?? "", /Chevrolet-Trax-2026-id13848156/);
  });

  await t.test("syncPublicInventory uses injected fetch + writes snapshot", async () => {
    clearInventoryStore();
    const result = await syncPublicInventory({
      workspaceId: "ws_parse_test",
      urls: ["https://www.buckinghamgm.com/neufs/inventaire/recherche.html"],
      nowIso: "2026-07-11T18:00:00.000Z",
      fetchImpl: async () =>
        new Response(fixture, { status: 200, headers: { "content-type": "text/html" } }),
    });
    assert.equal(result.ok, true);
    assert.ok(result.vehicleCount >= 1);
    assert.equal(getInventorySnapshot("ws_parse_test")?.source, "public_fetch");
  });
});
