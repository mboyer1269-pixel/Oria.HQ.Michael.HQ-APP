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

const catalogTypes = await jiti.import(
  path.join(projectRoot, "src/features/inventory/vehicle-catalog.ts"),
);
const catalogService = await jiti.import(
  path.join(projectRoot, "src/server/inventory/vehicle-catalog-service.ts"),
);
const invStore = await jiti.import(
  path.join(projectRoot, "src/server/inventory/inventory-store.ts"),
);

const { modelsForMake, resolveSelection, buildMakeId, buildModelId } = catalogTypes;
const { getVehicleCatalogSnapshot } = catalogService;
const { clearInventoryStore, setInventorySnapshot } = invStore;

test("vehicle make/model catalog", async (t) => {
  await t.test("loads relational catalog with makes and models", () => {
    clearInventoryStore();
    const snap = getVehicleCatalogSnapshot("ws_catalog_test");
    assert.equal(snap.schemaVersion, 1);
    assert.ok(snap.makes.length >= 20);
    assert.ok(snap.models.length >= 100);
    assert.equal(snap.relations.modelsToMakes, "models.makeId -> makes.makeId");
    const hyundai = snap.makes.find((m) => m.makeId === "hyundai");
    assert.ok(hyundai);
    const tucson = modelsForMake(snap, "hyundai").find((m) => m.name === "Tucson");
    assert.ok(tucson);
    assert.equal(tucson.makeId, "hyundai");
  });

  await t.test("make change filters models (relation)", () => {
    clearInventoryStore();
    const snap = getVehicleCatalogSnapshot("ws_catalog_test");
    const chevy = modelsForMake(snap, "chevrolet");
    const hyundai = modelsForMake(snap, "hyundai");
    assert.ok(chevy.every((m) => m.makeId === "chevrolet"));
    assert.ok(hyundai.every((m) => m.makeId === "hyundai"));
    assert.ok(chevy.some((m) => m.name === "Trax"));
    assert.equal(
      chevy.some((m) => m.name === "Tucson"),
      false,
    );
  });

  await t.test("resolveSelection rejects mismatched make/model", () => {
    clearInventoryStore();
    const snap = getVehicleCatalogSnapshot("ws_catalog_test");
    const year = snap.years[2];
    const ok = resolveSelection(snap, {
      year,
      makeId: "hyundai",
      modelId: "hyundai--tucson",
    });
    assert.ok(ok);
    assert.equal(ok.makeName, "Hyundai");
    assert.equal(ok.modelName, "Tucson");

    const bad = resolveSelection(snap, {
      year,
      makeId: "chevrolet",
      modelId: "hyundai--tucson",
    });
    assert.equal(bad, null);
  });

  await t.test("merges inventory-only make/model into catalog", () => {
    clearInventoryStore();
    setInventorySnapshot({
      snapshotId: "inv_test",
      workspaceId: "ws_catalog_merge",
      source: "manual_json",
      capturedAt: "2026-07-12T00:00:00.000Z",
      vehicles: [
        {
          stockId: "X-1",
          year: 2024,
          make: "Polestar",
          model: "2",
          condition: "used",
          photoUrls: [],
        },
      ],
    });
    const snap = getVehicleCatalogSnapshot("ws_catalog_merge");
    assert.equal(snap.source, "catalog_file+inventory");
    const makeId = buildMakeId("Polestar");
    const modelId = buildModelId("Polestar", "2");
    assert.ok(snap.makes.some((m) => m.makeId === makeId));
    assert.ok(snap.models.some((m) => m.modelId === modelId && m.makeId === makeId));
  });
});
