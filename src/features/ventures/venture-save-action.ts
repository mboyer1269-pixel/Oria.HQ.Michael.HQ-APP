"use server";

// src/features/ventures/venture-save-action.ts
//
// Owner-gated server action that persists a manual venture draft through the
// repository (PR149). This is NOT a public endpoint — it is a Next.js server
// action, reachable only from the owner-gated /hq/ventures surface and guarded
// again here with requireOwnerAccess (defense in depth).
//
// It resolves the workspace from the authenticated owner using the existing
// workspace registry, then delegates the actual persistence to the testable
// save service.

import { getDefaultWorkspace } from "@/core/workspaces/registry";
import type { LocalDraftVentureInput } from "@/features/ventures/draft";
import type { SaveVentureDraftActionResult } from "@/features/ventures/venture-save-types";
import { requireOwnerAccess } from "@/server/auth/owner";
import { saveVentureDraft } from "@/server/ventures/venture-save-service";

export async function saveVentureDraftAction(
  input: LocalDraftVentureInput,
): Promise<SaveVentureDraftActionResult> {
  const access = await requireOwnerAccess("/hq/ventures");
  if (access.status === "forbidden") {
    return { status: "forbidden" };
  }

  const workspaceId = getDefaultWorkspace({ ownerUserId: access.user.id }).id;
  return saveVentureDraft({ workspaceId, input });
}
