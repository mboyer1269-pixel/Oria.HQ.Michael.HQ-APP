// src/server/ventures/shadow-proposal-dedup.ts
//
// V7 Phase 1 step 4c-2 — daily deduplication.
//
// One proposal per venture per day. A retry or a double trigger must not spend
// a second LLM call on a venture already scored today, and must not pollute the
// divergence metric with near-identical proposals.
//
// ONE query for the whole batch, not one per venture: twenty reads to guard
// twenty ventures would cost more than the duplicates it prevents.
//
// FAILURE MEANS DO NOT DEDUPLICATE. If the ledger cannot be read, every venture
// is treated as un-proposed. A duplicate proposal costs one LLM call; wrongly
// skipping a whole day loses a day of measurement that cannot be recovered,
// because the owner's decisions that day would have nothing to pair against.
//
// Pure except for the injected reader.

import "server-only";

import type { WorkspaceContext } from "@/core/workspace-context";
import { createOptionalSupabaseAdminClient } from "@/server/supabase/admin";
import { SHADOW_PROPOSAL_ACTION_TYPE } from "./venture-score-shadow-runner";

/**
 * Start of the UTC calendar day containing `now`.
 *
 * Calendar day rather than a rolling 24h window: a tick report carrying a date
 * reads unambiguously, and "was this venture proposed today" is a question with
 * one answer rather than one that shifts with the hour the cron happens to run.
 */
export function startOfUtcDay(now: Date): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();
}

export type DedupOutcome = {
  /** Venture ids already proposed today. Empty when the read failed. */
  alreadyProposed: ReadonlySet<string>;
  /** True when the ledger could not be read and dedup was skipped. */
  degraded: boolean;
};

export type DedupDeps = {
  createClient?: typeof createOptionalSupabaseAdminClient;
  now?: () => Date;
};

/**
 * Reads which ventures already carry a proposal in the current UTC day.
 *
 * Returns `degraded: true` with an empty set when the read fails, so the caller
 * proposes for everything rather than skipping silently. The flag exists so the
 * tick report can say the guard was off — an unexplained burst of duplicates is
 * worse than a duplicate.
 */
export async function findVenturesProposedToday(
  ctx: WorkspaceContext,
  deps: DedupDeps = {},
): Promise<DedupOutcome> {
  const now = (deps.now ?? (() => new Date()))();
  const createClient = deps.createClient ?? createOptionalSupabaseAdminClient;
  const since = startOfUtcDay(now);

  try {
    const db = createClient();
    if (!db) return { alreadyProposed: new Set(), degraded: true };

    const { data, error } = await db
      .from("action_ledger")
      .select("metadata")
      .eq("workspace_id", ctx.workspace.id)
      .eq("action_type", SHADOW_PROPOSAL_ACTION_TYPE)
      .gte("created_at", since);

    if (error || !Array.isArray(data)) {
      return { alreadyProposed: new Set(), degraded: true };
    }

    const ids = new Set<string>();
    for (const row of data) {
      const metadata = (row as { metadata?: unknown }).metadata;
      if (typeof metadata !== "object" || metadata === null) continue;
      const ventureId = (metadata as Record<string, unknown>).ventureId;
      if (typeof ventureId === "string" && ventureId.length > 0) ids.add(ventureId);
    }

    return { alreadyProposed: ids, degraded: false };
  } catch {
    return { alreadyProposed: new Set(), degraded: true };
  }
}
