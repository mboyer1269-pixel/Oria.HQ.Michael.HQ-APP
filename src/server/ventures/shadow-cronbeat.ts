// src/server/ventures/shadow-cronbeat.ts
//
// V7 Phase 1 step 4c-1 — the cronbeat.
//
// Read-only health probe over shadow mode's trigger. It watches the cron; the
// cron does the work.
//
// Built BEFORE the cron it measures, deliberately. A trigger deployed without
// its probe is a trigger whose failure nobody notices: shadow mode would simply
// stop producing proposals, silently, and the first symptom would be an empty
// divergence history discovered weeks later. The instrument precedes the machine.
//
// No index needed, and none is proposed. The lookback window is derived from the
// thresholds rather than guessed for performance: anything older than the dead
// threshold is dead regardless of its exact age, so there is nothing to learn by
// reading further back. That makes the query bounded by meaning, not by a number
// someone tuned.
//
// Pure classification is separated from the read so the thresholds can be tested
// without a database.

import "server-only";

import type { WorkspaceContext } from "@/core/workspace-context";
import { createOptionalSupabaseAdminClient } from "@/server/supabase/admin";
import { SHADOW_TICK_ACTION_TYPE } from "./venture-score-shadow-runner";

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

/**
 * A daily cron is healthy up to 26h — 24h plus two hours of slack, so a run that
 * merely drifts late does not raise an alarm.
 */
export const CRONBEAT_HEALTHY_MAX_HOURS = 26;

/**
 * Past 50h at least two scheduled runs have been missed. One missed run can be a
 * blip; two is a pattern, and the difference is what separates a warning from a
 * failure.
 */
export const CRONBEAT_DEAD_MIN_HOURS = 50;

/**
 * How far back to look. Beyond the dead threshold the exact age changes nothing,
 * so the window only has to comfortably exceed it — this is a semantic bound,
 * not a performance guess.
 */
export const CRONBEAT_LOOKBACK_DAYS = 7;

const HOUR_MS = 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Classification (pure)
// ---------------------------------------------------------------------------

export type CronbeatStatus =
  /** A tick landed inside the healthy window. */
  | "healthy"
  /** One scheduled run appears to have been missed. */
  | "stale"
  /** At least two scheduled runs missed. */
  | "dead"
  /** No tick has ever been recorded — not yet started, as opposed to stopped. */
  | "never_run"
  /** The probe itself could not read. Says nothing about the cron. */
  | "unknown";

export type CronbeatReading = {
  status: CronbeatStatus;
  lastTickAt: string | null;
  hoursSinceLastTick: number | null;
  reason: string;
};

/**
 * Classifies cron health from the last tick timestamp.
 *
 * `never_run` is kept apart from `dead`: a system that has not started yet and
 * one that has stopped call for different responses, and collapsing them would
 * fire an alarm on every fresh deployment.
 *
 * A future timestamp is treated as `unknown` rather than `healthy`. Clock skew
 * between a runner and the database is real, and reporting health on the basis
 * of an impossible reading is how a probe lies confidently.
 */
export function classifyCronbeat(lastTickAt: string | null, now: Date): CronbeatReading {
  if (lastTickAt === null) {
    return {
      status: "never_run",
      lastTickAt: null,
      hoursSinceLastTick: null,
      reason: "no shadow tick has ever been recorded",
    };
  }

  const tick = Date.parse(lastTickAt);
  if (Number.isNaN(tick)) {
    return {
      status: "unknown",
      lastTickAt,
      hoursSinceLastTick: null,
      reason: "the recorded tick timestamp is unparseable",
    };
  }

  const elapsedMs = now.getTime() - tick;
  if (elapsedMs < 0) {
    return {
      status: "unknown",
      lastTickAt,
      hoursSinceLastTick: null,
      reason: "the last tick is in the future — clock skew, so health cannot be judged",
    };
  }

  const hours = Math.round((elapsedMs / HOUR_MS) * 100) / 100;

  if (hours < CRONBEAT_HEALTHY_MAX_HOURS) {
    return {
      status: "healthy",
      lastTickAt,
      hoursSinceLastTick: hours,
      reason: `last tick ${hours}h ago, within the ${CRONBEAT_HEALTHY_MAX_HOURS}h window`,
    };
  }

  if (hours < CRONBEAT_DEAD_MIN_HOURS) {
    return {
      status: "stale",
      lastTickAt,
      hoursSinceLastTick: hours,
      reason: `last tick ${hours}h ago — one scheduled run appears to have been missed`,
    };
  }

  return {
    status: "dead",
    lastTickAt,
    hoursSinceLastTick: hours,
    reason: `last tick ${hours}h ago — at least two scheduled runs missed`,
  };
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export type CronbeatReadDeps = {
  createClient?: typeof createOptionalSupabaseAdminClient;
  now?: () => Date;
  lookbackDays?: number;
};

/**
 * Reads the most recent shadow tick.
 *
 * Returns `undefined` for "could not read" and `null` for "read fine, none
 * found". The distinction matters: the first must not be reported as a dead
 * cron, because a probe that cannot see is not evidence of a failure.
 */
async function findLastTickAt(
  ctx: WorkspaceContext,
  deps: CronbeatReadDeps,
): Promise<string | null | undefined> {
  const createClient = deps.createClient ?? createOptionalSupabaseAdminClient;
  const now = (deps.now ?? (() => new Date()))();
  const lookbackDays = deps.lookbackDays ?? CRONBEAT_LOOKBACK_DAYS;

  const since = new Date(now.getTime() - lookbackDays * 24 * HOUR_MS).toISOString();

  // Client construction is inside the try: it can throw on missing or malformed
  // configuration, and a probe that dies building its own client would report
  // nothing at all rather than "I could not see".
  try {
    const db = createClient();
    if (!db) return undefined;

    const { data, error } = await db
      .from("action_ledger")
      .select("created_at")
      .eq("workspace_id", ctx.workspace.id)
      .eq("action_type", SHADOW_TICK_ACTION_TYPE)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) return undefined;
    // No rows comes back as an empty array. A non-array payload without an error
    // is anomalous, so it reads as "could not see" rather than "nothing there" —
    // the difference between those two is the whole point of this return type.
    if (!Array.isArray(data)) return undefined;

    const createdAt = data[0]?.created_at;
    return typeof createdAt === "string" ? createdAt : null;
  } catch {
    return undefined;
  }
}

/**
 * Current cronbeat reading. Never throws — a probe that can fail loudly is one
 * more thing to monitor.
 */
export async function readCronbeat(
  ctx: WorkspaceContext,
  deps: CronbeatReadDeps = {},
): Promise<CronbeatReading> {
  const now = (deps.now ?? (() => new Date()))();
  const lastTickAt = await findLastTickAt(ctx, deps);

  if (lastTickAt === undefined) {
    return {
      status: "unknown",
      lastTickAt: null,
      hoursSinceLastTick: null,
      reason: "the ledger could not be read — this says nothing about the cron",
    };
  }

  // Nothing in the window. A bounded read genuinely cannot tell "never started"
  // from "stopped longer ago than the window", so this does not pretend to:
  // it reports `dead` because both cases need attention, and names the
  // ambiguity rather than inventing a distinction the query cannot support.
  //
  // Erring toward `dead` is deliberate. Reporting a stopped cron as "not started
  // yet" would understate a real outage, which costs more than a needless flag
  // on a fresh deployment — and the reason text prevents that flag being read as
  // a confirmed failure.
  if (lastTickAt === null) {
    const lookbackDays = deps.lookbackDays ?? CRONBEAT_LOOKBACK_DAYS;
    return {
      status: "dead",
      lastTickAt: null,
      hoursSinceLastTick: null,
      reason:
        `no shadow tick in the last ${lookbackDays} days — either it has never ` +
        "run, or it stopped longer ago than this probe looks back",
    };
  }

  return classifyCronbeat(lastTickAt, now);
}
