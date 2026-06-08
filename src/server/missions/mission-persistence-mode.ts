// src/server/missions/mission-persistence-mode.ts
//
// Read-only operator visibility: is mission-draft persistence local (in-memory)
// or durable (Supabase)? Pure decision + a thin env-reading describe(). No DB
// call is made — it only inspects the flag and whether Supabase is configured.

import { hasSupabaseAdminConfig } from "@/server/supabase/admin";
import { isDurableMissionDraftEnabled } from "./mission-persistence-flag";

export type MissionPersistenceMode = "local" | "durable";

export type MissionPersistenceStatus = {
  mode: MissionPersistenceMode;
  durableEnabled: boolean;
  supabaseConfigured: boolean;
  /** One-line operator summary. */
  summary: string;
};

/**
 * Pure decision: durable persistence is in effect only when BOTH the flag is on
 * AND Supabase is configured; otherwise drafts stay local in-memory.
 */
export function resolveMissionPersistenceMode(
  durableEnabled: boolean,
  supabaseConfigured: boolean,
): { mode: MissionPersistenceMode; summary: string } {
  if (durableEnabled && supabaseConfigured) {
    return { mode: "durable", summary: "Mission drafts: durable (Supabase missions table)" };
  }
  if (durableEnabled) {
    return {
      mode: "local",
      summary: "Mission drafts: local in-memory (durable flag ON but Supabase not configured)",
    };
  }
  return { mode: "local", summary: "Mission drafts: local in-memory (durable persistence OFF)" };
}

/** Describe the active mission-draft persistence mode (read-only; no DB call). */
export function describeMissionDraftPersistence(): MissionPersistenceStatus {
  const durableEnabled = isDurableMissionDraftEnabled();
  const supabaseConfigured = hasSupabaseAdminConfig();
  const { mode, summary } = resolveMissionPersistenceMode(durableEnabled, supabaseConfigured);
  return { mode, durableEnabled, supabaseConfigured, summary };
}
