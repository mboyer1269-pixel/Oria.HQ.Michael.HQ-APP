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
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import type { VentureCard } from "@/core/types";
import { recordShadowOutcomeForVenture } from "@/server/ventures/shadow-outcome-hook";
import type {
  VentureLifecycleActionInput,
  VentureLifecycleActionResult,
  VenturePromotionInput,
  VentureScoringInput,
  VentureUpdateInput,
} from "@/features/ventures/venture-lifecycle-types";
import { requireOwnerAccess } from "@/server/auth/owner";
import {
  archiveVenture,
  killVenture,
  promoteVenture,
  scoreVenture,
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

/**
 * Records the shadow-mode measurement for a venture the owner just scored.
 *
 * Awaited rather than fire-and-forget: this runs in a serverless function, and
 * a detached promise can be cut off when the response returns — silently losing
 * exactly the measurement shadow mode exists to collect. The cost is one bounded
 * ledger read and one append, on an action that already writes to the database.
 *
 * Every failure is swallowed. The score is the product; the measurement is a
 * byproduct, and a byproduct must never be able to fail the product. The hook
 * already absorbs its own errors — this catch covers the unexpected path where
 * something upstream of it throws.
 */
async function recordShadowMeasurement(card: VentureCard): Promise<void> {
  try {
    if (!card.score) return;
    const ctx = getActiveWorkspaceContext();
    await recordShadowOutcomeForVenture(ctx, card.id, card.score);
  } catch {
    // Deliberately silent. A failed measurement must not surface as an error on
    // a decision the owner just made.
  }
}

export async function scoreVentureAction(
  input: VentureScoringInput,
): Promise<VentureLifecycleActionResult> {
  const workspaceId = await resolveOwnerWorkspaceId();
  if (!workspaceId) return { status: "forbidden" };

  const outcome = await scoreVenture(workspaceId, input);

  // Shadow mode closes its loop here: the owner's real score is paired against
  // the agent's earlier proposal, and the divergence between them is what later
  // decides whether the agent has earned any autonomy. Only on a saved score —
  // there is nothing to measure against a refused one.
  if (outcome.status === "saved") {
    await recordShadowMeasurement(outcome.card);
  }

  return outcome;
}
