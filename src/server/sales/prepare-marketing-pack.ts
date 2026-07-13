// src/server/sales/prepare-marketing-pack.ts
//
// Prepare a multi-channel marketing kit + Marketplace listing packet from stock.

import {
  prepareMarketingContentPack,
  validateMarketingContentPack,
  type MarketingContentPack,
} from "@/features/sales/marketing-content-pack";
import type { MarketplaceListingPacket } from "@/features/marketplace-listings/listing-packet";
import { prepareMarketplaceListing } from "@/server/marketplace-listings/prepare-listing";
import { findVehicleInSnapshot, getInventorySnapshot } from "@/server/inventory/inventory-store";
import type { VehicleStock } from "@/features/inventory/vehicle-stock";
import { saveMarketingPack } from "./marketing-pack-store";

export type PrepareMarketingPackInput = {
  workspaceId: string;
  stockId: string;
  packId?: string;
  locationHint?: string;
  nowIso?: string;
  enrichPhotos?: boolean;
  fetchImpl?: typeof fetch;
  vehicleOverride?: VehicleStock;
};

export type PrepareMarketingPackResult =
  | {
      ok: true;
      pack: MarketingContentPack;
      listingPacket: MarketplaceListingPacket;
      photoEnrichment?: { enriched: boolean; warning?: string };
    }
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

export async function prepareMarketingPack(
  input: PrepareMarketingPackInput,
): Promise<PrepareMarketingPackResult> {
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

  const listingResult = await prepareMarketplaceListing({
    workspaceId: input.workspaceId,
    stockId: input.stockId,
    locationHint: input.locationHint,
    nowIso,
    enrichPhotos: input.enrichPhotos,
    fetchImpl: input.fetchImpl,
    vehicleOverride: input.vehicleOverride,
  });

  if (!listingResult.ok) {
    return { ok: false, errors: listingResult.errors };
  }

  // Prefer photo-enriched vehicle from the listing packet photo set when possible.
  const working: VehicleStock = {
    ...vehicle,
    photoUrls:
      listingResult.packet.photoUrls.length > 0
        ? listingResult.packet.photoUrls
        : vehicle.photoUrls,
  };

  const pack = prepareMarketingContentPack({
    packId: input.packId ?? `mktpack_${vehicle.stockId}_${nowIso.replace(/[:.]/g, "")}`,
    workspaceId: input.workspaceId,
    vehicle: working,
    locationHint: input.locationHint,
    nowIso,
  });

  // Align Marketplace channel copy with the saved listing packet (single source).
  pack.marketplace.title = listingResult.packet.title;
  pack.marketplace.description = listingResult.packet.description;
  pack.marketplace.priceCad = listingResult.packet.priceCad;
  pack.marketplace.locationHint = listingResult.packet.locationHint;
  pack.marketplace.photoUrls = [...listingResult.packet.photoUrls];

  const validation = validateMarketingContentPack(pack);
  if (!validation.valid) return { ok: false, errors: validation.errors };

  return {
    ok: true,
    pack: saveMarketingPack(pack),
    listingPacket: listingResult.packet,
    photoEnrichment: listingResult.photoEnrichment,
  };
}
