"use server";

// src/features/ventures/venture-asset-action.ts
//
// Owner-gated server actions for the Venture Asset Registry. Same defense in
// depth as venture-lifecycle-action.ts: reachable only from the owner-gated
// /hq/ventures surface AND re-guarded here. workspaceId is always derived
// server-side from the authenticated owner — never accepted from the client.

import { getDefaultWorkspace } from "@/core/workspaces/registry";
import { requireOwnerAccess } from "@/server/auth/owner";
import {
  addVentureAsset,
  listVentureAssets,
  retireVentureAsset,
} from "@/server/ventures/venture-asset-repository";
import type { VentureAssetKind, VentureAssetRecord } from "./venture-asset";

export type VentureAssetActionResult =
  | { status: "saved"; asset: VentureAssetRecord }
  | { status: "error"; message: string }
  | { status: "forbidden" };

async function resolveOwnerWorkspaceId(): Promise<string | null> {
  const access = await requireOwnerAccess("/hq/ventures");
  if (access.status === "forbidden") return null;
  return getDefaultWorkspace({ ownerUserId: access.user.id }).id;
}

export async function addVentureAssetAction(input: {
  ventureId: string;
  kind: VentureAssetKind;
  label: string;
  value: string;
  sensitive?: boolean;
}): Promise<VentureAssetActionResult> {
  const workspaceId = await resolveOwnerWorkspaceId();
  if (!workspaceId) return { status: "forbidden" };

  const result = addVentureAsset({ ...input, workspaceId });
  if (!result.ok) return { status: "error", message: result.reason };
  return { status: "saved", asset: result.asset };
}

export async function retireVentureAssetAction(input: {
  assetId: string;
  reason: string;
}): Promise<VentureAssetActionResult> {
  const workspaceId = await resolveOwnerWorkspaceId();
  if (!workspaceId) return { status: "forbidden" };

  const result = retireVentureAsset(workspaceId, input.assetId, input.reason);
  if (!result.ok) return { status: "error", message: result.reason };
  return { status: "saved", asset: result.asset };
}

export async function listVentureAssetsAction(input: {
  ventureId: string;
}): Promise<{ status: "ok"; assets: VentureAssetRecord[] } | { status: "forbidden" }> {
  const workspaceId = await resolveOwnerWorkspaceId();
  if (!workspaceId) return { status: "forbidden" };
  return { status: "ok", assets: listVentureAssets(workspaceId, input.ventureId) };
}
