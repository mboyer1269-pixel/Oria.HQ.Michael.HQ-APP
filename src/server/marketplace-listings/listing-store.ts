// src/server/marketplace-listings/listing-store.ts
//
// In-memory Marketplace listing packet queue. Prepare-only. Not durable.

import type { MarketplaceListingPacket } from "@/features/marketplace-listings/listing-packet";

type ListingStoreGlobals = typeof globalThis & {
  __oriaMarketplaceListingStore?: Map<string, Map<string, MarketplaceListingPacket>>;
};

function getRoot(): Map<string, Map<string, MarketplaceListingPacket>> {
  const globals = globalThis as ListingStoreGlobals;
  if (!globals.__oriaMarketplaceListingStore) {
    globals.__oriaMarketplaceListingStore = new Map();
  }
  return globals.__oriaMarketplaceListingStore;
}

function workspaceMap(workspaceId: string): Map<string, MarketplaceListingPacket> {
  const root = getRoot();
  let map = root.get(workspaceId);
  if (!map) {
    map = new Map();
    root.set(workspaceId, map);
  }
  return map;
}

export function listMarketplaceListings(workspaceId: string): MarketplaceListingPacket[] {
  return [...workspaceMap(workspaceId).values()].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}

export function getMarketplaceListing(
  workspaceId: string,
  packetId: string,
): MarketplaceListingPacket | null {
  return workspaceMap(workspaceId).get(packetId) ?? null;
}

export function saveMarketplaceListing(
  packet: MarketplaceListingPacket,
): MarketplaceListingPacket {
  workspaceMap(packet.workspaceId).set(packet.packetId, packet);
  return packet;
}

export function markListingPublishedManual(
  workspaceId: string,
  packetId: string,
  nowIso: string,
): MarketplaceListingPacket | null {
  const existing = getMarketplaceListing(workspaceId, packetId);
  if (!existing) return null;
  const next: MarketplaceListingPacket = {
    ...existing,
    status: "published_manual",
    updatedAt: nowIso,
  };
  return saveMarketplaceListing(next);
}

/** Mark prior packets for the same stock as superseded when re-preparing. */
export function supersedeListingsForStock(
  workspaceId: string,
  stockId: string,
  keepPacketId: string,
  nowIso: string,
): number {
  const map = workspaceMap(workspaceId);
  let count = 0;
  for (const [id, packet] of map.entries()) {
    if (packet.stockId !== stockId) continue;
    if (id === keepPacketId) continue;
    if (packet.status === "published_manual") continue;
    map.set(id, {
      ...packet,
      status: "superseded",
      updatedAt: nowIso,
    });
    count += 1;
  }
  return count;
}

export function listActiveListings(workspaceId: string): MarketplaceListingPacket[] {
  return listMarketplaceListings(workspaceId).filter((l) => l.status !== "superseded");
}

export function clearMarketplaceListingStore(): void {
  getRoot().clear();
}
