// src/server/missions/mission-persistence-flag.ts
//
// Feature flag for the FUTURE durable (Supabase) mission-draft write path.
// OFF by default.
//
// While this returns false (the default), mission drafts are persisted exactly
// as today — the in-memory local repository — so production behavior is
// unchanged. Flipping it ON is a future, staging-first step that also requires
// a configured Supabase admin client; the `missions` table already exists.
//
// Reads only a NON-SECRET toggle. No secrets, no DB.

/** Env toggle name. Set to a truthy value below to enable durable drafts (future). */
export const MISSION_DURABLE_DRAFTS_ENV = "MISSION_DURABLE_DRAFTS";

const TRUTHY = new Set(["1", "true", "on", "yes"]);

/**
 * Whether durable mission-draft persistence is enabled. Defaults to FALSE for
 * any absent, empty, or unrecognized value — fail-safe OFF.
 */
export function isDurableMissionDraftEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const raw = env[MISSION_DURABLE_DRAFTS_ENV];
  if (typeof raw !== "string") return false;
  return TRUTHY.has(raw.trim().toLowerCase());
}
