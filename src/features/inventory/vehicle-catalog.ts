// Relational vehicle catalog contracts — structured for market analysis.
 // UI must consume these via API; never hardcode option lists in components.

export type VehicleMarketRole = "oem_gm" | "competitor" | "inventory_extra";

export type VehicleSegment =
  | "subcompact_suv"
  | "compact_suv"
  | "midsize_suv"
  | "fullsize_suv"
  | "compact_car"
  | "midsize_car"
  | "pickup_midsize"
  | "pickup_fullsize"
  | "van"
  | "ev"
  | "other";

export type VehicleCatalogMake = {
  makeId: string;
  name: string;
  marketRole: VehicleMarketRole;
  sortOrder: number;
};

export type VehicleCatalogModel = {
  modelId: string;
  makeId: string;
  name: string;
  segment: VehicleSegment;
  /** Optional aliases for matching inventory / market search. */
  aliases?: string[];
};

export type VehicleCatalogSnapshot = {
  schemaVersion: 1;
  generatedAt: string;
  source: "catalog_file" | "catalog_file+inventory";
  years: number[];
  makes: VehicleCatalogMake[];
  models: VehicleCatalogModel[];
  /** Explicit relation hint for consumers / analytics. */
  relations: {
    modelsToMakes: "models.makeId -> makes.makeId";
  };
};

export type VehicleSelection = {
  year: number;
  makeId: string;
  modelId: string;
  makeName: string;
  modelName: string;
};

export function slugifyVehicleToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function buildMakeId(name: string): string {
  return slugifyVehicleToken(name);
}

export function buildModelId(makeName: string, modelName: string): string {
  return `${buildMakeId(makeName)}--${slugifyVehicleToken(modelName)}`;
}

export function modelsForMake(
  catalog: Pick<VehicleCatalogSnapshot, "models">,
  makeId: string | null | undefined,
): VehicleCatalogModel[] {
  if (!makeId) return [];
  return catalog.models
    .filter((m) => m.makeId === makeId)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export function resolveSelection(
  catalog: VehicleCatalogSnapshot,
  input: { year: number; makeId: string; modelId: string },
): VehicleSelection | null {
  const make = catalog.makes.find((m) => m.makeId === input.makeId);
  const model = catalog.models.find(
    (m) => m.modelId === input.modelId && m.makeId === input.makeId,
  );
  if (!make || !model) return null;
  if (!catalog.years.includes(input.year)) return null;
  return {
    year: input.year,
    makeId: make.makeId,
    modelId: model.modelId,
    makeName: make.name,
    modelName: model.name,
  };
}
