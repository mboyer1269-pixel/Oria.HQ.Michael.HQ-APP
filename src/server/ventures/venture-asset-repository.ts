// src/server/ventures/venture-asset-repository.ts
//
// Venture Asset Registry — in-memory, workspace-scoped, APPEND-ONLY store.
//
// v1 persistence model: in-memory (dev/local), mirroring the Send Desk store.
// A Supabase dual-mode upgrade (migration + RLS, same path as 0012/0013) is a
// later, mandate-gated step.
//
// Discipline:
//   * append + retire only — a retired asset is never deleted, it keeps its
//     history (close-out audit needs it);
//   * every read and write is scoped by workspaceId + ventureId;
//   * this module NEVER sends, charges or calls anything external.

import { randomUUID } from "node:crypto";
import type { VentureAssetKind, VentureAssetRecord } from "@/features/ventures/venture-asset";

type VentureAssetRepositoryGlobals = typeof globalThis & {
  __ventureAssetRecords?: VentureAssetRecord[];
};

function getRecords(): VentureAssetRecord[] {
  const globals = globalThis as VentureAssetRepositoryGlobals;
  if (!globals.__ventureAssetRecords) {
    globals.__ventureAssetRecords = [];
  }
  return globals.__ventureAssetRecords;
}

export type AddVentureAssetInput = {
  workspaceId: string;
  ventureId: string;
  kind: VentureAssetKind;
  label: string;
  value: string;
  sensitive?: boolean;
};

export type AddVentureAssetResult =
  | { ok: true; asset: VentureAssetRecord }
  | { ok: false; reason: string };

export function addVentureAsset(input: AddVentureAssetInput): AddVentureAssetResult {
  const label = input.label.trim();
  const value = input.value.trim();
  if (!label || !value) {
    return { ok: false, reason: "label and value are required" };
  }
  const asset: VentureAssetRecord = {
    id: `va_${randomUUID()}`,
    workspaceId: input.workspaceId,
    ventureId: input.ventureId,
    kind: input.kind,
    label,
    value,
    sensitive: input.sensitive ?? false,
    status: "active",
    createdAt: new Date().toISOString(),
  };
  getRecords().push(asset);
  return { ok: true, asset };
}

export type RetireVentureAssetResult =
  | { ok: true; asset: VentureAssetRecord }
  | { ok: false; reason: string };

export function retireVentureAsset(
  workspaceId: string,
  assetId: string,
  reason: string,
): RetireVentureAssetResult {
  const record = getRecords().find(
    (candidate) => candidate.id === assetId && candidate.workspaceId === workspaceId,
  );
  if (!record) {
    return { ok: false, reason: "asset not found" };
  }
  if (record.status === "retired") {
    return { ok: false, reason: "asset already retired" };
  }
  record.status = "retired";
  record.retireReason = reason.trim() || "retired";
  record.retiredAt = new Date().toISOString();
  return { ok: true, asset: record };
}

export function listVentureAssets(
  workspaceId: string,
  ventureId: string,
): VentureAssetRecord[] {
  return getRecords().filter(
    (record) => record.workspaceId === workspaceId && record.ventureId === ventureId,
  );
}

export function listVentureAssetsForWorkspace(workspaceId: string): VentureAssetRecord[] {
  return getRecords().filter((record) => record.workspaceId === workspaceId);
}

export function resetVentureAssetRepositoryForTests(): void {
  const globals = globalThis as VentureAssetRepositoryGlobals;
  globals.__ventureAssetRecords = undefined;
}
