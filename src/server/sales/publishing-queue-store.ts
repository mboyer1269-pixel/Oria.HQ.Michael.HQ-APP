// Publishing queue store — in-memory bundles for Sales Desk Publication Agent.
// Prepare-only: tracks draft → approved → published_manual.

import type { PublishingBundle, PublishingBundleStatus } from "@/features/sales/publishing-bundle";

const bundlesByWorkspace = new Map<string, Map<string, PublishingBundle>>();

function workspaceMap(workspaceId: string): Map<string, PublishingBundle> {
  let map = bundlesByWorkspace.get(workspaceId);
  if (!map) {
    map = new Map();
    bundlesByWorkspace.set(workspaceId, map);
  }
  return map;
}

export function savePublishingBundle(bundle: PublishingBundle): PublishingBundle {
  const map = workspaceMap(bundle.workspaceId);
  map.set(bundle.bundleId, bundle);
  return bundle;
}

export function getPublishingBundle(
  workspaceId: string,
  bundleId: string,
): PublishingBundle | null {
  return workspaceMap(workspaceId).get(bundleId) ?? null;
}

export function listPublishingBundles(workspaceId: string): PublishingBundle[] {
  return [...workspaceMap(workspaceId).values()].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export function updateBundleStatus(
  workspaceId: string,
  bundleId: string,
  status: PublishingBundleStatus,
  nowIso: string,
): PublishingBundle | null {
  const map = workspaceMap(workspaceId);
  const existing = map.get(bundleId);
  if (!existing) return null;
  const updated: PublishingBundle = { ...existing, status, updatedAt: nowIso };
  map.set(bundleId, updated);
  return updated;
}

export function listPublishedStockIds(workspaceId: string): string[] {
  return listPublishingBundles(workspaceId)
    .filter((b) => b.status === "published_manual")
    .map((b) => b.stockId);
}

/** Dev/test only */
export function clearPublishingQueueStore(): void {
  bundlesByWorkspace.clear();
}
