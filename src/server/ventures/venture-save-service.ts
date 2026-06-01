// src/server/ventures/venture-save-service.ts
//
// Persistence wrapper for the manual venture intake (PR149). This is the
// testable core of the save flow: it builds a venture card from CEO intake and
// persists it through the PR148 VentureRepository, then reports the storage mode
// so the UI can label status honestly.
//
// It deliberately contains NO auth/session logic — the owner gate lives in the
// "use server" action that wraps this (venture-save-action.ts). That keeps this
// module pure enough to unit-test against the repository's local fallback and
// injected Supabase client.
//
// Scope (PR149): create-through-repository only. No edit/kill/archive/delete/
// promote — those are intentionally absent.

import { createLocalDraftVentureCard, type LocalDraftVentureInput } from "@/features/ventures/draft";
import type { SaveVentureDraftOutcome } from "@/features/ventures/venture-save-types";
import { createVenture, getVenturePersistenceMode } from "./venture-repository";

export type { SaveVentureDraftOutcome } from "@/features/ventures/venture-save-types";

/**
 * Builds a candidate venture from intake input and persists it through the
 * repository, scoped to `workspaceId`.
 *
 * On success: `{ status: "saved", card, storageMode }` — the stored card and the
 * backend that actually handled it.
 *
 * On any repository failure (including the loud-production guard when no
 * persistence is configured): `{ status: "error", card }` — the unsaved card is
 * returned so the UI can keep it visible, clearly labelled as NOT saved. The
 * card is never reported as persisted when the write did not succeed.
 */
export async function saveVentureDraft(args: {
  workspaceId: string;
  input: LocalDraftVentureInput;
}): Promise<SaveVentureDraftOutcome> {
  const card = createLocalDraftVentureCard(args.input);

  try {
    const saved = await createVenture(args.workspaceId, card);
    return { status: "saved", card: saved, storageMode: getVenturePersistenceMode() };
  } catch {
    // Sanitized: never surface repository/driver internals to the caller.
    return { status: "error", card };
  }
}
