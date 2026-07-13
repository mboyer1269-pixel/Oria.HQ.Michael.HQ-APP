// src/server/sales/prepare-marketing-pack.ts
//
// Prepare a multi-channel marketing content pack from inventory stock.

import {
  buildMarketingContentPack,
  validateMarketingContentPack,
  type MarketingContentPack,
} from "@/features/sales/marketing-content-pack";
import { findVehicleInSnapshot, getInventorySnapshot } from "@/server/inventory/inventory-store";
import type { VehicleStock } from "@/features/inventory/vehicle-stock";
import { saveMarketingPack } from "./marketing-pack-store";

export type PrepareMarketingPackInput = {
  workspaceId: string;
  stockId: string;
  packId?: string;
  nowIso?: string;
  vehicleOverride?: VehicleStock;
};

export type PrepareMarketingPackResult =
  | { ok: true; pack: MarketingContentPack }
  | { ok: false; errors: string[] };

function resolveVehicle(
  workspaceId: string,
  stockId: string,
  vehicleOverride?: VehicleStock,
): VehicleStock | null {
  if (vehicleOverride && vehicleOverride.stockId === stockId) {
    return vehicleOverride;
  }
  const direct = findVehicleInSnapshot(workspaceId, stockId);
  if (direct) return direct;
  const snap = getInventorySnapshot(workspaceId);
  if (!snap) return vehicleOverride ?? null;
  const needle = stockId.trim().toLowerCase();
  return (
    snap.vehicles.find(
      (v) =>
        v.stockId.toLowerCase() === needle ||
        v.stockNumber?.toLowerCase() === needle ||
        v.vin?.toLowerCase() === needle,
    ) ??
    vehicleOverride ??
    null
  );
}

export function prepareMarketingContentPack(
  input: PrepareMarketingPackInput,
): PrepareMarketingPackResult {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const vehicle = resolveVehicle(input.workspaceId, input.stockId, input.vehicleOverride);
  if (!vehicle) {
    return {
      ok: false,
      errors: [
        `stockId not found in inventory snapshot: ${input.stockId}. Sync or ingest inventory first.`,
      ],
    };
  }

  const pack = buildMarketingContentPack({
    packId: input.packId ?? `mktg_${vehicle.stockId}_${nowIso.replace(/[:.]/g, "")}`,
    workspaceId: input.workspaceId,
    vehicle,
    nowIso,
  });

  const validation = validateMarketingContentPack(pack);
  if (!validation.valid) return { ok: false, errors: validation.errors };

  return { ok: true, pack: saveMarketingPack(pack) };
}
