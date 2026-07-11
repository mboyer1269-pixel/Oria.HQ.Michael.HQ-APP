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

const debriefMod = await jiti.import(
  path.join(projectRoot, "src/features/inventory/inventory-debrief.ts"),
);
const allowMod = await jiti.import(path.join(__dirname, "market-comps-allowlist.ts"));
const parseMod = await jiti.import(path.join(__dirname, "autotrader-comps-parser.ts"));
const briefMod = await jiti.import(path.join(__dirname, "market-advantage-brief.ts"));
const fetchMod = await jiti.import(path.join(__dirname, "fetch-market-comps.ts"));

const { buildInventoryDebrief, findComparableOnLot } = debriefMod;
const { buildAutoTraderGatineauUrl, checkMarketCompUrl } = allowMod;
const { parseAutoTraderCompsHtml } = parseMod;
const { buildMarketAdvantageBrief } = briefMod;
const { fetchMarketAdvantageBrief } = fetchMod;

const sampleVehicles = [
  {
    stockId: "U17396",
    year: 2024,
    make: "GMC",
    model: "Terrain",
    condition: "used",
    priceCad: 26495,
    photoUrls: ["https://imagescdn.d2cmedia.ca/x.jpg"],
  },
  {
    stockId: "U17386",
    year: 2024,
    make: "Chevrolet",
    model: "TrailBlazer",
    condition: "used",
    priceCad: 22495,
    photoUrls: ["https://imagescdn.d2cmedia.ca/y.jpg"],
  },
  {
    stockId: "26344-NEUF",
    year: 2026,
    make: "Chevrolet",
    model: "Trax",
    condition: "new",
    priceCad: 33466,
    photoUrls: ["https://imagescdn.d2cmedia.ca/z.jpg"],
  },
  {
    stockId: "26101-DEMO",
    year: 2026,
    make: "Chevrolet",
    model: "Suburban",
    condition: "used",
    priceCad: 119995,
    photoUrls: ["https://imagescdn.d2cmedia.ca/w.jpg"],
  },
];

test("inventory debrief + market comps", async (t) => {
  await t.test("buildInventoryDebrief summarizes the lot", () => {
    const d = buildInventoryDebrief(sampleVehicles);
    assert.equal(d.vehicleCount, 4);
    assert.equal(d.withPhotoCount, 4);
    assert.equal(d.newCount, 1);
    assert.ok(d.demoCount >= 1);
    assert.ok(d.frenchSummary.includes("4 unités"));
    assert.ok(d.highlights.length >= 1);
  });

  await t.test("findComparableOnLot maps Tucson shoppers to GM CUVs", () => {
    const peers = findComparableOnLot(sampleVehicles, {
      year: 2023,
      make: "Hyundai",
      model: "Tucson",
    });
    assert.ok(peers.some((v) => /terrain|trailblazer|trax/i.test(v.model)));
  });

  await t.test("AutoTrader allowlist + URL builder", () => {
    const url = buildAutoTraderGatineauUrl({
      year: 2023,
      make: "Hyundai",
      model: "Tucson",
    });
    assert.match(url, /\/cars\/hyundai\/tucson\/my_2023\/reg_qc\/cit_gatineau/);
    assert.equal(checkMarketCompUrl(url).ok, true);
    assert.equal(checkMarketCompUrl("https://evil.example/cars/x").ok, false);
  });

  await t.test("parseAutoTraderCompsHtml reads __NEXT_DATA__ listings", () => {
    const fixture = {
      props: {
        pageProps: {
          numberOfResults: 1,
          listings: [
            {
              url: "https://www.autotrader.ca/offers/x",
              images: ["https://prod.pictures.autoscout24.net/a.jpg"],
              price: { priceRaw: 27999, priceEvaluation: 1 },
              vehicle: {
                make: "Hyundai",
                modelGroup: "Tucson",
                modelYear: 2023,
                modelVersionInput: "Preferred AWD",
                mileageInKm: "40,502 km",
              },
              location: { city: "Gatineau" },
              seller: { companyName: "Demo Dealer" },
              tracking: { priceLabel: "top-price", mileage: "40502", price: "27999" },
            },
          ],
        },
      },
    };
    const html = `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(fixture)}</script></html>`;
    const parsed = parseAutoTraderCompsHtml(html, "https://www.autotrader.ca/cars/hyundai/tucson/my_2023/reg_qc/cit_gatineau");
    assert.equal(parsed.listings.length, 1);
    assert.equal(parsed.listings[0].priceCad, 27999);
    assert.equal(parsed.listings[0].mileageKm, 40502);
    assert.equal(parsed.listings[0].priceBadge, "great");
  });

  await t.test("buildMarketAdvantageBrief produces talking points", () => {
    const brief = buildMarketAdvantageBrief({
      target: { year: 2023, make: "Hyundai", model: "Tucson" },
      comps: [
        {
          source: "autotrader",
          title: "2023 Hyundai Tucson",
          year: 2023,
          make: "Hyundai",
          model: "Tucson",
          priceCad: 27999,
          mileageKm: 40502,
          priceBadge: "great",
          dealerName: "Demo",
        },
        {
          source: "autotrader",
          title: "2023 Hyundai Tucson Preferred",
          year: 2023,
          make: "Hyundai",
          model: "Tucson",
          priceCad: 30880,
          mileageKm: 38997,
          priceBadge: "good",
          dealerName: "Demo 2",
        },
      ],
      sourceUrl: "https://www.autotrader.ca/cars/hyundai/tucson/my_2023/reg_qc/cit_gatineau",
      inventory: sampleVehicles,
    });
    assert.ok(brief.talkingPoints.length >= 3);
    assert.ok(brief.onLotComparables.length >= 1);
    assert.ok(brief.frenchSummary.includes("médiane"));
  });

  await t.test("fetchMarketAdvantageBrief uses injected fetch", async () => {
    const fixture = {
      props: {
        pageProps: {
          numberOfResults: 1,
          listings: [
            {
              url: "https://www.autotrader.ca/offers/x",
              images: ["https://prod.pictures.autoscout24.net/a.jpg"],
              price: { priceRaw: 29995, priceEvaluation: 2 },
              vehicle: {
                make: "Hyundai",
                modelGroup: "Tucson",
                modelYear: 2023,
                mileageInKm: "36,000 km",
              },
              location: { city: "Gatineau" },
              seller: { companyName: "Injected" },
              tracking: { priceLabel: "good", mileage: "36000", price: "29995" },
            },
          ],
        },
      },
    };
    const html = `<html><script id="__NEXT_DATA__">${JSON.stringify(fixture)}</script></html>`;
    const result = await fetchMarketAdvantageBrief({
      target: { year: 2023, make: "Hyundai", model: "Tucson" },
      inventory: sampleVehicles,
      fetchImpl: async () =>
        new Response(html, { status: 200, headers: { "content-type": "text/html" } }),
    });
    assert.equal(result.ok, true);
    assert.equal(result.brief.compCount, 1);
    assert.ok(result.brief.talkingPoints.length > 0);
  });
});

// Optional live probe — skipped unless ORIA_LIVE_MARKET=1
if (process.env.ORIA_LIVE_MARKET === "1") {
  test("LIVE: AutoTrader Gatineau Hyundai Tucson 2023", async () => {
    const result = await fetchMarketAdvantageBrief({
      target: { year: 2023, make: "Hyundai", model: "Tucson" },
      inventory: sampleVehicles,
    });
    assert.equal(result.ok, true);
    assert.ok(result.brief.compCount >= 1);
    fs.writeFileSync(
      "/tmp/market-brief-tucson.json",
      JSON.stringify(result.brief, null, 2),
    );
  });
}
