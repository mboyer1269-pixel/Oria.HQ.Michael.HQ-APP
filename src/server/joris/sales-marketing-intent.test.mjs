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

const marketingIntentMod = await jiti.import(
  path.join(projectRoot, "src/server/joris/sales-marketing-intent.ts"),
);
const ingestMod = await jiti.import(
  path.join(projectRoot, "src/server/inventory/inventory-ingest.ts"),
);
const invStoreMod = await jiti.import(
  path.join(projectRoot, "src/server/inventory/inventory-store.ts"),
);
const policyMod = await jiti.import(
  path.join(projectRoot, "src/features/marketplace-listings/publish-policy.ts"),
);

const { handleSalesMarketingIntent } = marketingIntentMod;
const { ingestManualInventory } = ingestMod;
const { clearInventoryStore } = invStoreMod;
const { wantsAutoPublishOnMarketplace } = policyMod;

const WS = "ws_joris_marketing_test";
const NOW = "2026-07-13T16:45:00.000Z";

test("wantsAutoPublishOnMarketplace detects publish-for-me phrases", () => {
  assert.equal(wantsAutoPublishOnMarketplace("publie sur marketplace pour moi"), true);
  assert.equal(wantsAutoPublishOnMarketplace("prépare fiche marketplace"), false);
});

test("handleSalesMarketingIntent resolves model from message", async () => {
  clearInventoryStore();
  ingestManualInventory({
    workspaceId: WS,
    nowIso: NOW,
    vehicles: [
      {
        stockId: "stk_trax_1",
        year: 2026,
        make: "Chevrolet",
        model: "Trax",
        condition: "new",
        priceCad: 31999,
        photoUrls: ["https://example.com/trax.jpg"],
      },
    ],
  });

  const result = await handleSalesMarketingIntent({
    workspaceId: WS,
    message: "prépare pub pour le Trax 2026",
  });

  assert.ok(result.summary.includes("Pack marketing prêt"));
  assert.ok(result.summary.includes("stk_trax_1"));
  assert.equal(result.stockId, "stk_trax_1");
});
