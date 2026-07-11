// src/features/inventory/vehicle-stock.ts
//
// Pure inventory contracts for public dealership stock snapshots.
// No network, no persistence — validation + normalize only.

export type VehicleCondition = "new" | "used" | "cpo";

export const VEHICLE_CONDITIONS: readonly VehicleCondition[] = ["new", "used", "cpo"];

export type VehicleStock = {
  stockId: string;
  vin?: string;
  year: number;
  make: string;
  model: string;
  trim?: string;
  condition: VehicleCondition;
  priceCad?: number;
  mileageKm?: number;
  exteriorColor?: string;
  stockNumber?: string;
  listingUrl?: string;
  photoUrls: string[];
  notes?: string;
};

export type InventorySnapshot = {
  snapshotId: string;
  workspaceId: string;
  source: "manual_json" | "manual_csv" | "public_fetch";
  capturedAt: string;
  vehicles: VehicleStock[];
};

export type InventoryValidation = {
  valid: boolean;
  errors: string[];
};

function requireText(value: unknown, field: string, errors: string[]): void {
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`${field} must be non-empty`);
  }
}

export function validateVehicleStock(input: unknown): InventoryValidation {
  const errors: string[] = [];
  if (!input || typeof input !== "object") {
    return { valid: false, errors: ["vehicle must be an object"] };
  }
  const v = input as Record<string, unknown>;
  requireText(v.stockId, "stockId", errors);
  requireText(v.make, "make", errors);
  requireText(v.model, "model", errors);
  if (typeof v.year !== "number" || !Number.isInteger(v.year) || v.year < 1980 || v.year > 2100) {
    errors.push("year must be an integer between 1980 and 2100");
  }
  if (typeof v.condition !== "string" || !VEHICLE_CONDITIONS.includes(v.condition as VehicleCondition)) {
    errors.push(`condition must be one of: ${VEHICLE_CONDITIONS.join(", ")}`);
  }
  if (v.priceCad !== undefined && (typeof v.priceCad !== "number" || v.priceCad < 0)) {
    errors.push("priceCad must be a non-negative number when present");
  }
  if (v.mileageKm !== undefined && (typeof v.mileageKm !== "number" || v.mileageKm < 0)) {
    errors.push("mileageKm must be a non-negative number when present");
  }
  if (v.photoUrls !== undefined) {
    if (!Array.isArray(v.photoUrls) || v.photoUrls.some((u) => typeof u !== "string")) {
      errors.push("photoUrls must be an array of strings when present");
    }
  }
  return { valid: errors.length === 0, errors };
}

export function normalizeVehicleStock(input: VehicleStock): VehicleStock {
  return {
    ...input,
    stockId: input.stockId.trim(),
    make: input.make.trim(),
    model: input.model.trim(),
    trim: input.trim?.trim() || undefined,
    vin: input.vin?.trim().toUpperCase() || undefined,
    photoUrls: (input.photoUrls ?? []).map((u) => u.trim()).filter(Boolean),
    notes: input.notes?.trim() || undefined,
  };
}

export function validateInventorySnapshot(input: unknown): InventoryValidation {
  const errors: string[] = [];
  if (!input || typeof input !== "object") {
    return { valid: false, errors: ["snapshot must be an object"] };
  }
  const s = input as Record<string, unknown>;
  requireText(s.snapshotId, "snapshotId", errors);
  requireText(s.workspaceId, "workspaceId", errors);
  requireText(s.capturedAt, "capturedAt", errors);
  if (s.source !== "manual_json" && s.source !== "manual_csv" && s.source !== "public_fetch") {
    errors.push("source must be manual_json | manual_csv | public_fetch");
  }
  if (!Array.isArray(s.vehicles)) {
    errors.push("vehicles must be an array");
  } else {
    s.vehicles.forEach((vehicle, index) => {
      const result = validateVehicleStock(vehicle);
      for (const err of result.errors) {
        errors.push(`vehicles[${index}].${err}`);
      }
    });
  }
  return { valid: errors.length === 0, errors };
}

/** Find vehicles matching make/model (case-insensitive). */
export function findVehiclesByModel(
  snapshot: InventorySnapshot,
  make: string,
  model: string,
): VehicleStock[] {
  const m = make.trim().toLowerCase();
  const mod = model.trim().toLowerCase();
  return snapshot.vehicles.filter(
    (v) => v.make.toLowerCase() === m && v.model.toLowerCase() === mod,
  );
}
