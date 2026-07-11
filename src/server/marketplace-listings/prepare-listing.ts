// src/server/marketplace-listings/prepare-listing.ts
//
// Prepare a Marketplace listing packet from the latest inventory snapshot.

import {
  prepareListingFromStock,
  validateMarketplaceListingPacket,
  type MarketplaceListingPacket,
} from "@/features/marketplace-listings/listing-packet";
import { findVehicleInSnapshot } from "@/server/inventory/inventory-store";
import { saveMarketplaceListing } from "./listing-store";

export type PrepareListingInput = {
  workspaceId: string;
  stockId: string;
  packetId?: string;
  locationHint?: string;
  nowIso?: string;
};

export type PrepareListingResult =
  | { ok: true; packet: MarketplaceListingPacket }
  | { ok: false; errors: string[] };

export function prepareMarketplaceListing(input: PrepareListingInput): PrepareListingResult {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const vehicle = findVehicleInSnapshot(input.workspaceId, input.stockId);
  if (!vehicle) {
    return {
      ok: false,
      errors: [
        `stockId not found in inventory snapshot: ${input.stockId}. Ingest inventory first.`,
      ],
    };
  }

  const packet = prepareListingFromStock({
    packetId: input.packetId ?? `mkt_${vehicle.stockId}_${nowIso.replace(/[:.]/g, "")}`,
    workspaceId: input.workspaceId,
    vehicle,
    locationHint: input.locationHint,
    nowIso,
  });

  const validation = validateMarketplaceListingPacket(packet);
  if (!validation.valid) return { ok: false, errors: validation.errors };

  return { ok: true, packet: saveMarketplaceListing(packet) };
}
