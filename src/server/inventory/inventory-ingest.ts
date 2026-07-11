// src/server/inventory/inventory-ingest.ts
//
// Manual JSON ingest → InventorySnapshot. No network fetch.

import {
  normalizeVehicleStock,
  validateInventorySnapshot,
  validateVehicleStock,
  type InventorySnapshot,
  type VehicleStock,
} from "@/features/inventory/vehicle-stock";
import { setInventorySnapshot } from "./inventory-store";

export type ManualIngestInput = {
  workspaceId: string;
  vehicles: VehicleStock[];
  source?: "manual_json" | "manual_csv";
  snapshotId?: string;
  nowIso?: string;
};

export type ManualIngestResult =
  | { ok: true; snapshot: InventorySnapshot }
  | { ok: false; errors: string[] };

export function ingestManualInventory(input: ManualIngestInput): ManualIngestResult {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const errors: string[] = [];
  if (!input.workspaceId?.trim()) errors.push("workspaceId must be non-empty");
  if (!Array.isArray(input.vehicles) || input.vehicles.length === 0) {
    errors.push("vehicles must be a non-empty array");
  }

  const normalized: VehicleStock[] = [];
  for (let i = 0; i < (input.vehicles?.length ?? 0); i++) {
    const result = validateVehicleStock(input.vehicles[i]);
    if (!result.valid) {
      for (const err of result.errors) errors.push(`vehicles[${i}].${err}`);
      continue;
    }
    normalized.push(normalizeVehicleStock(input.vehicles[i]));
  }

  // Dedupe by stockId (last wins).
  const byId = new Map<string, VehicleStock>();
  for (const v of normalized) byId.set(v.stockId, v);

  if (errors.length > 0) return { ok: false, errors };

  const snapshot: InventorySnapshot = {
    snapshotId: input.snapshotId ?? `inv_${input.workspaceId}_${nowIso.replace(/[:.]/g, "")}`,
    workspaceId: input.workspaceId.trim(),
    source: input.source ?? "manual_json",
    capturedAt: nowIso,
    vehicles: [...byId.values()],
  };

  const snapValidation = validateInventorySnapshot(snapshot);
  if (!snapValidation.valid) {
    return { ok: false, errors: snapValidation.errors };
  }

  return { ok: true, snapshot: setInventorySnapshot(snapshot) };
}
