// src/server/inventory/inventory-store.ts
//
// In-memory inventory snapshot store (dev/local). Not durable.
// Public-fetch sync is a later Yellow step — manual ingest only for now.

import type { InventorySnapshot, VehicleStock } from "@/features/inventory/vehicle-stock";

type InventoryStoreGlobals = typeof globalThis & {
  __oriaInventoryStore?: Map<string, InventorySnapshot>;
};

function getStore(): Map<string, InventorySnapshot> {
  const globals = globalThis as InventoryStoreGlobals;
  if (!globals.__oriaInventoryStore) {
    globals.__oriaInventoryStore = new Map();
  }
  return globals.__oriaInventoryStore;
}

export function getInventorySnapshot(workspaceId: string): InventorySnapshot | null {
  return getStore().get(workspaceId) ?? null;
}

export function setInventorySnapshot(snapshot: InventorySnapshot): InventorySnapshot {
  getStore().set(snapshot.workspaceId, snapshot);
  return snapshot;
}

export function findVehicleInSnapshot(
  workspaceId: string,
  stockId: string,
): VehicleStock | null {
  const snap = getInventorySnapshot(workspaceId);
  if (!snap) return null;
  return snap.vehicles.find((v) => v.stockId === stockId) ?? null;
}

export function clearInventoryStore(): void {
  getStore().clear();
}
