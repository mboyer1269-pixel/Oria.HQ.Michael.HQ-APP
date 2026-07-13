// src/server/marketplace-listings/prepare-listing.ts
//
// Prepare a Marketplace listing packet from the latest inventory snapshot.

import {
  prepareListingFromStock,
  validateMarketplaceListingPacket,
  type MarketplaceListingPacket,
} from "@/features/marketplace-listings/listing-packet";
import { findVehicleInSnapshot, getInventorySnapshot } from "@/server/inventory/inventory-store";
import { enrichPhotoUrlsFromVdp } from "@/server/inventory/vdp-photo-enrich";
import type { VehicleStock } from "@/features/inventory/vehicle-stock";
import { saveMarketplaceListing, supersedeListingsForStock } from "./listing-store";

export type PrepareListingInput = {
  workspaceId: string;
  stockId: string;
  packetId?: string;
  locationHint?: string;
  nowIso?: string;
  /** When true (default), try VDP page for more photos. */
  enrichPhotos?: boolean;
  fetchImpl?: typeof fetch;
  /**
   * Optional vehicle payload from the Sales Desk client.
   * Used when the in-memory snapshot is empty on another serverless instance.
   */
  vehicleOverride?: VehicleStock;
};

export type PrepareListingResult =
  | {
      ok: true;
      packet: MarketplaceListingPacket;
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

export async function prepareMarketplaceListing(
  input: PrepareListingInput,
): Promise<PrepareListingResult> {
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

  let working = vehicle;
  let photoEnrichment: { enriched: boolean; warning?: string } | undefined;
  if (input.enrichPhotos !== false) {
    const enriched = await enrichPhotoUrlsFromVdp({
      listingUrl: vehicle.listingUrl,
      existingPhotoUrls: vehicle.photoUrls,
      fetchImpl: input.fetchImpl,
    });
    photoEnrichment = { enriched: enriched.enriched, warning: enriched.warning };
    working = { ...vehicle, photoUrls: enriched.photoUrls };
  }

  const packet = prepareListingFromStock({
    packetId: input.packetId ?? `mkt_${vehicle.stockId}_${nowIso.replace(/[:.]/g, "")}`,
    workspaceId: input.workspaceId,
    vehicle: working,
    locationHint: input.locationHint,
    nowIso,
  });

  const validation = validateMarketplaceListingPacket(packet);
  if (!validation.valid) return { ok: false, errors: validation.errors };

  supersedeListingsForStock(input.workspaceId, vehicle.stockId, packet.packetId, nowIso);
  return { ok: true, packet: saveMarketplaceListing(packet), photoEnrichment };
}
