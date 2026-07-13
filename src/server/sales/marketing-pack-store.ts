// src/server/sales/marketing-pack-store.ts
//
// In-memory marketing content packs for Sales Desk. Prepare-only. Not durable.

import type { MarketingContentPack } from "@/features/sales/marketing-content-pack";

type MarketingPackStoreGlobals = typeof globalThis & {
  __oriaMarketingPackStore?: Map<string, Map<string, MarketingContentPack>>;
};

function getRoot(): Map<string, Map<string, MarketingContentPack>> {
  const globals = globalThis as MarketingPackStoreGlobals;
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
    b.updatedAt.localeCompare(a.updatedAt),
  );
}

export function getMarketingPack(
  workspaceId: string,
  packId: string,
): MarketingContentPack | null {
  return workspaceMap(workspaceId).get(packId) ?? null;
}

export function saveMarketingPack(pack: MarketingContentPack): MarketingContentPack {
  workspaceMap(pack.workspaceId).set(pack.packId, pack);
  return pack;
}

export function markMarketingPackPublishedManual(
  workspaceId: string,
  packId: string,
  nowIso: string,
): MarketingContentPack | null {
  const existing = getMarketingPack(workspaceId, packId);
  if (!existing) return null;
  const next: MarketingContentPack = {
    ...existing,
    status: "published_manual",
    updatedAt: nowIso,
  };
  return saveMarketingPack(next);
}

export function clearMarketingPackStore(): void {
  getRoot().clear();
}
