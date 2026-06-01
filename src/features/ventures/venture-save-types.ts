// src/features/ventures/venture-save-types.ts
//
// Shared, dependency-free types for the manual venture-save flow (PR149).
// Imported by both the server save service/action and the client component, so
// this module intentionally has NO "use server"/"use client" directive and no
// server-only imports.

import type { VentureCard } from "./types";

/**
 * Which persistence backend actually handled a write — surfaced so the UI can
 * tell the truth instead of guessing. `unavailable` is the loud-production case
 * (no Supabase, no local fallback): a write never succeeds in that mode.
 */
export type VenturePersistenceMode = "supabase" | "local" | "unavailable";

/** Outcome of attempting to persist a single manual draft. */
export type SaveVentureDraftOutcome =
  | { status: "saved"; card: VentureCard; storageMode: VenturePersistenceMode }
  // On failure the (unsaved) card is returned so the UI can keep it visible,
  // clearly labelled as NOT saved. It is never treated as persisted.
  | { status: "error"; card: VentureCard };

/** Action-level result: the save outcome, plus the owner-gate refusal case. */
export type SaveVentureDraftActionResult =
  | SaveVentureDraftOutcome
  | { status: "forbidden" };

export type SaveVentureSuggestionInput = {
  suggestionId: string;
};

export type SaveVentureSuggestionOutcome =
  | { status: "saved"; card: VentureCard; storageMode: VenturePersistenceMode }
  | { status: "error"; code: "repository_error"; card: VentureCard };

export type SaveVentureSuggestionActionResult =
  | SaveVentureSuggestionOutcome
  | { status: "error"; code: "suggestion_not_found" }
  | { status: "forbidden" };
