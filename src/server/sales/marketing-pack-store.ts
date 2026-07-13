// In-memory marketing content packs — mirror listing-store pattern.

import type { MarketingContentPack } from "@/features/sales/marketing-content-pack";

type StoreGlobals = typeof globalThis & {
  __oriaMarketingPackStore?: Map<string, Map<string, MarketingContentPack>>;
};

function getRoot(): Map<string, Map<string, MarketingContentPack>> {
  const globals = globalThis as StoreGlobals;
  if (!globals.__oriaMarketingPackStore) {
    globals.__oriaMarketingPackStore = new Map();
  }
  return globals.__oriaMarketingPackStore;
}

function workspaceMap(workspaceId: string): Map<string, MarketingContentPack> {
  const root = getRoot();
  let map = root.get(workspaceId);
  if (!map) {
    map = new Map();
    root.set(workspaceId, map);
  }
  return map;
}

export function listMarketingPacks(workspaceId: string): MarketingContentPack[] {
  return [...workspaceMap(workspaceId).values()].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

export function getMarketingPack(
  workspaceId: string,
  packId: string,
): MarketingContentPack | null {
  return workspaceMap(workspaceId).get(packId) ?? null;
}

export function getLatestMarketingPackForStock(
  workspaceId: string,
  stockId: string,
): MarketingContentPack | null {
  const packs = listMarketingPacks(workspaceId).filter((p) => p.stockId === stockId);
  return packs[0] ?? null;
}

export function saveMarketingPack(
  workspaceId: string,
  pack: MarketingContentPack,
): MarketingContentPack {
  workspaceMap(workspaceId).set(pack.packId, pack);
  return pack;
}

export function clearMarketingPackStore(): void {
  getRoot().clear();
}
