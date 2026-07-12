// Load relational make/model catalog and merge live inventory extras.
 // Data comes from catalog file + inventory store — not from UI hardcoding.

import catalogFile from "@/server/inventory/data/vehicle-make-model-catalog.json";
import { getInventorySnapshot } from "@/server/inventory/inventory-store";
import {
  buildMakeId,
  buildModelId,
  type VehicleCatalogMake,
  type VehicleCatalogModel,
  type VehicleCatalogSnapshot,
  type VehicleSegment,
} from "@/features/inventory/vehicle-catalog";

type CatalogFileShape = {
  schemaVersion: number;
  makes: VehicleCatalogMake[];
  models: Array<VehicleCatalogModel & { segment: string }>;
};

function buildYearRange(now = new Date()): number[] {
  const current = now.getFullYear();
  const years: number[] = [];
  for (let y = current + 1; y >= current - 15; y -= 1) years.push(y);
  return years;
}

function guessSegmentFromModel(modelName: string): VehicleSegment {
  const m = modelName.toLowerCase();
  if (/suv|terrain|equinox|trax|trail|encore|envista|tucson|rav|cr-v|rogue/.test(m)) {
    return "compact_suv";
  }
  if (/silverado|sierra|f-150|ram/.test(m)) return "pickup_fullsize";
  if (/colorado|canyon|tacoma|ranger/.test(m)) return "pickup_midsize";
  if (/bolt|ev|ioniq|leaf/.test(m)) return "ev";
  return "other";
}

/**
 * Build a catalog snapshot for the workspace.
 * Base = relational catalog file; inventory-only makes/models are appended.
 */
export function getVehicleCatalogSnapshot(workspaceId: string): VehicleCatalogSnapshot {
  const file = catalogFile as CatalogFileShape;
  const makeMap = new Map<string, VehicleCatalogMake>();
  const modelMap = new Map<string, VehicleCatalogModel>();

  for (const make of file.makes) {
    makeMap.set(make.makeId, make);
  }
  for (const model of file.models) {
    modelMap.set(model.modelId, {
      modelId: model.modelId,
      makeId: model.makeId,
      name: model.name,
      segment: model.segment as VehicleSegment,
      aliases: model.aliases,
    });
  }

  let mergedFromInventory = false;
  const snap = getInventorySnapshot(workspaceId);
  if (snap?.vehicles?.length) {
    for (const vehicle of snap.vehicles) {
      const makeId = buildMakeId(vehicle.make);
      if (!makeMap.has(makeId)) {
        makeMap.set(makeId, {
          makeId,
          name: vehicle.make,
          marketRole: "inventory_extra",
          sortOrder: 10_000 + makeMap.size,
        });
        mergedFromInventory = true;
      }
      const modelId = buildModelId(vehicle.make, vehicle.model);
      if (!modelMap.has(modelId)) {
        modelMap.set(modelId, {
          modelId,
          makeId,
          name: vehicle.model,
          segment: guessSegmentFromModel(vehicle.model),
        });
        mergedFromInventory = true;
      }
    }
  }

  const makes = [...makeMap.values()].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "fr"),
  );
  const models = [...modelMap.values()].sort(
    (a, b) => a.makeId.localeCompare(b.makeId) || a.name.localeCompare(b.name, "fr"),
  );

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: mergedFromInventory ? "catalog_file+inventory" : "catalog_file",
    years: buildYearRange(),
    makes,
    models,
    relations: {
      modelsToMakes: "models.makeId -> makes.makeId",
    },
  };
}
