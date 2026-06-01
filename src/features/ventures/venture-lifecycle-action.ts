"use server";

// src/features/ventures/venture-lifecycle-action.ts
//
// Owner-gated server actions for controlled venture lifecycle management
// (PR150): edit details, archive, kill. These are NOT public endpoints — they
// are Next.js server actions reachable only from the owner-gated /hq/ventures
// surface, and guarded again here with requireOwnerAccess (defense in depth).
//
// workspaceId is always derived server-side from the authenticated owner via the
// workspace registry — never accepted from the client.

import { getDefaultWorkspace } from "@/core/workspaces/registry";
import type {
  VentureLifecycleActionInput,
  VentureLifecycleActionResult,
  VenturePromotionInput,
  VentureUpdateInput,
} from "@/features/ventures/venture-lifecycle-types";
import { requireOwnerAccess } from "@/server/auth/owner";
import {
  archiveVenture,
  killVenture,
  promoteVenture,
  updateVentureDetails,
} from "@/server/ventures/venture-lifecycle-service";

async function resolveOwnerWorkspaceId(): Promise<string | null> {
  const access = await requireOwnerAccess("/hq/ventures");
  if (access.status === "forbidden") return null;
  return getDefaultWorkspace({ ownerUserId: access.user.id }).id;
}

export async function updateVentureDetailsAction(
  input: VentureUpdateInput,
): Promise<VentureLifecycleActionResult> {
  const workspaceId = await resolveOwnerWorkspaceId();
  if (!workspaceId) return { status: "forbidden" };
  return updateVentureDetails(workspaceId, input);
}

export async function archiveVentureAction(
  input: VentureLifecycleActionInput,
): Promise<VentureLifecycleActionResult> {
  const workspaceId = await resolveOwnerWorkspaceId();
  if (!workspaceId) return { status: "forbidden" };
  return archiveVenture(workspaceId, input);
}

export async function killVentureAction(
  input: VentureLifecycleActionInput,
): Promise<VentureLifecycleActionResult> {
  const workspaceId = await resolveOwnerWorkspaceId();
  if (!workspaceId) return { status: "forbidden" };
  return killVenture(workspaceId, input);
}

export async function promoteVentureAction(
  input: VenturePromotionInput,
): Promise<VentureLifecycleActionResult> {
  const workspaceId = await resolveOwnerWorkspaceId();
  if (!workspaceId) return { status: "forbidden" };
  return promoteVenture(workspaceId, input);
}
