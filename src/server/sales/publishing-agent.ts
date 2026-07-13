// Server orchestration for Publication Agent bundles.

import {
  buildPublishingBundle,
  type PublishingBundle,
} from "@/features/sales/publishing-bundle";
import type { VehicleStock } from "@/features/inventory/vehicle-stock";
import { findVehicleInSnapshot } from "@/server/inventory/inventory-store";
import { savePublishingBundle } from "./publishing-queue-store";

export type BuildBundleInput = {
  workspaceId: string;
  stockId: string;
  bundleId?: string;
  locationHint?: string;
  vehicleOverride?: VehicleStock;
  nowIso?: string;
};

export type BuildBundleResult =
  | { ok: true; bundle: PublishingBundle }
  | { ok: false; errors: string[] };

function resolveVehicle(
  workspaceId: string,
  stockId: string,
  vehicleOverride?: VehicleStock,
): VehicleStock | null {
  if (vehicleOverride && vehicleOverride.stockId === stockId) return vehicleOverride;
  return findVehicleInSnapshot(workspaceId, stockId) ?? vehicleOverride ?? null;
}

export function createPublishingBundle(input: BuildBundleInput): BuildBundleResult {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const vehicle = resolveVehicle(input.workspaceId, input.stockId, input.vehicleOverride);
  if (!vehicle) {
    return {
      ok: false,
      errors: [`stockId not found: ${input.stockId}. Sync inventaire d'abord.`],
    };
  }

  const bundle = buildPublishingBundle({
    bundleId: input.bundleId ?? `pub_${vehicle.stockId}_${nowIso.replace(/[:.]/g, "")}`,
    workspaceId: input.workspaceId,
    vehicle,
    locationHint: input.locationHint,
    nowIso,
  });

  return { ok: true, bundle: savePublishingBundle(bundle) };
}
