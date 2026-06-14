import { DEFAULT_STALE_AFTER_MS, isRunStale } from "./workflow-live-board";
import { type WorkflowRun } from "./workflow-run";

// ---------------------------------------------------------------------------
// Agent run health — the single, centralized derivation of operational health
// from the REAL run list.
//
// Every run-health metric the HQ surfaces (success, errors, pending, stuck,
// average duration, last run, failure rate) is computed here and nowhere else.
// The board (`workflow-live-board`) owns the swimlane shape; this module owns
// the health scorecard. Both read the SAME projected runs and the SAME stale
// predicate (`isRunStale` / `DEFAULT_STALE_AFTER_MS`), so there is one source of
// truth for "is this run stuck" — no competing thresholds, no drift.
//
// Pure and deterministic: the only clock is the caller-supplied `nowMs`. Omit it
// and staleness is disabled (stuck = 0, everything in flight counts as pending),
// which keeps server renders reproducible.
// ---------------------------------------------------------------------------

/** Per-agent (and global) operational health derived from runs. */
export type AgentRunHealth = {
  /** Agent id, or {@link GLOBAL_AGENT_ID} for the whole-board rollup. */
  agentId: string;
  /** Total observed runs for this agent. */
  total: number;
  /** Runs that concluded successfully (`completed`). */
  success: number;
  /** Runs that concluded in failure (`failed`). */
  failed: number;
  /** In-flight runs progressing normally (non-terminal, not stale). */
  pending: number;
  /** In-flight runs idle past the staleness threshold — "stuck". */
  stuck: number;
  /** Share of concluded runs that failed, 0..100. 0 when nothing concluded. */
  failureRatePct: number;
  /** Mean wall-clock duration of runs with a known span, or null. */
  avgDurationMs: number | null;
  /** Most recent run activity (max `updatedAtMs`), or null when no runs. */
  lastRunAtMs: number | null;
};

export type RunHealthReport = {
  /** Whole-board rollup across every agent. */
  global: AgentRunHealth;
  /** Per-agent health, problems first (stuck, then failed, then volume). */
  byAgent: AgentRunHealth[];
};

export type RunHealthOptions = {
  /** Reference clock for staleness. Omit to disable stuck detection. */
  nowMs?: number;
  /** A non-terminal run idle longer than this is "stuck". */
  staleAfterMs?: number;
};

/** Synthetic agent id for the whole-board rollup row. */
export const GLOBAL_AGENT_ID = "__all__";

/** Wall-clock span of a run when both ends are known and ordered, else null. */
function runDurationMs(run: WorkflowRun): number | null {
  if (run.startedAtMs === null || run.endedAtMs === null) return null;
  const span = run.endedAtMs - run.startedAtMs;
  return span >= 0 ? span : null;
}

function emptyHealth(agentId: string): AgentRunHealth {
  return {
    agentId,
    total: 0,
    success: 0,
    failed: 0,
    pending: 0,
    stuck: 0,
    failureRatePct: 0,
    avgDurationMs: null,
    lastRunAtMs: null,
  };
}

/** Folds one agent's runs into a health record. Pure. */
function summarizeRuns(
  agentId: string,
  runs: readonly WorkflowRun[],
  nowMs: number | undefined,
  staleAfterMs: number,
): AgentRunHealth {
  const health = emptyHealth(agentId);
  let durationSum = 0;
  let durationCount = 0;

  for (const run of runs) {
    health.total += 1;

    if (run.status === "completed") health.success += 1;
    else if (run.status === "failed") health.failed += 1;
    else if (isRunStale(run, nowMs, staleAfterMs)) health.stuck += 1;
    else health.pending += 1;

    const duration = runDurationMs(run);
    if (duration !== null) {
      durationSum += duration;
      durationCount += 1;
    }

    if (health.lastRunAtMs === null || run.updatedAtMs > health.lastRunAtMs) {
      health.lastRunAtMs = run.updatedAtMs;
    }
  }

  const concluded = health.success + health.failed;
  health.failureRatePct = concluded === 0 ? 0 : Math.round((health.failed / concluded) * 100);
  health.avgDurationMs = durationCount === 0 ? null : Math.round(durationSum / durationCount);

  return health;
}

/**
 * Builds the run-health report from the projected run list. Per-agent rows are
 * ordered problems-first (most stuck, then most failed, then most runs, then id)
 * so the operator's eye lands on what needs attention. Deterministic for a given
 * run list and `nowMs`.
 */
export function buildRunHealthReport(
  runs: readonly WorkflowRun[],
  options: RunHealthOptions = {},
): RunHealthReport {
  const nowMs = options.nowMs;
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;

  const byAgentId = new Map<string, WorkflowRun[]>();
  for (const run of runs) {
    const bucket = byAgentId.get(run.agentId);
    if (bucket) bucket.push(run);
    else byAgentId.set(run.agentId, [run]);
  }

  const byAgent = [...byAgentId.entries()]
    .map(([agentId, agentRuns]) => summarizeRuns(agentId, agentRuns, nowMs, staleAfterMs))
    .sort(
      (a, b) =>
        b.stuck - a.stuck ||
        b.failed - a.failed ||
        b.total - a.total ||
        (a.agentId < b.agentId ? -1 : a.agentId > b.agentId ? 1 : 0),
    );

  const global = summarizeRuns(GLOBAL_AGENT_ID, runs, nowMs, staleAfterMs);

  return { global, byAgent };
}
