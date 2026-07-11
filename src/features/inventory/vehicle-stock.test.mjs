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

const stockMod = await jiti.import(path.join(__dirname, "vehicle-stock.ts"));
const {
  validateVehicleStock,
  validateInventorySnapshot,
  findVehiclesByModel,
  normalizeVehicleStock,
} = stockMod;

const NOW = "2026-07-11T12:00:00.000Z";

function sampleVehicle(overrides = {}) {
  return {
    stockId: "stk_trax_1",
    year: 2025,
    make: "Chevrolet",
    model: "Trax",
    trim: "LT",
    condition: "new",
    priceCad: 28999,
    photoUrls: ["https://example.com/trax.jpg"],
    listingUrl: "https://www.buckinghamgm.com/neufs/example",
    ...overrides,
  };
}

test("vehicle stock contracts", async (t) => {
  await t.test("validates a complete vehicle", () => {
    const result = validateVehicleStock(sampleVehicle());
    assert.equal(result.valid, true);
  });

  await t.test("rejects bad year and condition", () => {
    const result = validateVehicleStock(sampleVehicle({ year: 1900, condition: "lease" }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("year")));
    assert.ok(result.errors.some((e) => e.includes("condition")));
  });

  await t.test("snapshot + find by model", () => {
    const vehicles = [
      normalizeVehicleStock(sampleVehicle()),
      normalizeVehicleStock(sampleVehicle({ stockId: "stk_sierra_1", model: "Sierra", trim: "1500" })),
    ];
    const snapshot = {
      snapshotId: "inv_1",
      workspaceId: "ws_1",
      source: "manual_json",
      capturedAt: NOW,
      vehicles,
    };
    assert.equal(validateInventorySnapshot(snapshot).valid, true);
    assert.equal(findVehiclesByModel(snapshot, "chevrolet", "trax").length, 1);
    assert.equal(findVehiclesByModel(snapshot, "Chevrolet", "Sierra").length, 1);
  });
});
