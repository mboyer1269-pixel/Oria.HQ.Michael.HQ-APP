import type {
  WorkflowRun,
  WorkflowRunStatus,
  WorkflowStepStatus,
} from "./workflow-run";
import { currentStepIndex, isRunTerminal, runProgressPct } from "./workflow-run";

// ---------------------------------------------------------------------------
// Workflow Live Board — the read model the /hq/workflows page renders.
//
// Folds the flat list of runs into agent swimlanes, each run drawn as a line
// of step points (the "line graph" of progression). Several agents can run in
// parallel; each keeps its own lane. Pure and deterministic: the only clock is
// the caller-supplied `nowMs` (never Date.now() inside), so staleness is
// reproducible. The board reflects observed runs — it authorizes nothing.
// ---------------------------------------------------------------------------

export type WorkflowStepPoint = {
  index: number;
  key: string;
  label: string;
  detail: string;
  status: WorkflowStepStatus;
  /** Wall-clock duration of the step once it has both endpoints, else null. */
  durationMs: number | null;
};

export type WorkflowRunLane = {
  runId: string;
  workflowId: string;
  agentId: string;
  title: string;
  trigger: string;
  status: WorkflowRunStatus;
  progressPct: number;
  /** Index of the step in flight (or first open step); -1 once terminal. */
  currentStepIndex: number;
  steps: WorkflowStepPoint[];
  startedAtMs: number | null;
  endedAtMs: number | null;
  durationMs: number | null;
  /** Time since last activity for a non-terminal run (needs nowMs), else null. */
  idleMs: number | null;
  /** A non-terminal run idle past the threshold — "stuck". */
  isStale: boolean;
  observedOutcomeId: string | null;
};

export type WorkflowAgentSwimlane = {
  agentId: string;
  agentName: string;
  lanes: WorkflowRunLane[];
  activeRunCount: number;
  completedRunCount: number;
  failedRunCount: number;
  staleRunCount: number;
};

export type WorkflowBoardTotals = {
  runs: number;
  /** Non-terminal runs: running, blocked or queued. */
  active: number;
  completed: number;
  failed: number;
  blocked: number;
  /** Non-terminal runs idle past the staleness threshold. */
  stale: number;
  agentsEngaged: number;
  /** Mean progress across non-terminal runs — the board's live momentum. */
  avgProgressPct: number;
};

export type WorkflowLiveBoard = {
  swimlanes: WorkflowAgentSwimlane[];
  totals: WorkflowBoardTotals;
};

export type WorkflowLiveBoardOptions = {
  /** Reference clock for idle/staleness. Omit to disable staleness entirely. */
  nowMs?: number;
  /** A non-terminal run idle longer than this is "stale". Default 15 min. */
  staleAfterMs?: number;
};

export const DEFAULT_STALE_AFTER_MS = 15 * 60 * 1000;

export type AgentNameLookup =
  | Readonly<Record<string, string>>
  | ReadonlyMap<string, string>;

function resolveAgentName(lookup: AgentNameLookup, agentId: string): string {
  if (lookup instanceof Map) return lookup.get(agentId) ?? agentId;
  return (lookup as Record<string, string>)[agentId] ?? agentId;
}

/** Ordering rank so live runs float to the top of a swimlane. */
const RUN_STATUS_RANK: Record<WorkflowRunStatus, number> = {
  running: 0,
  blocked: 1,
  queued: 2,
  completed: 3,
  failed: 4,
};

function spanMs(startMs: number | null, endMs: number | null): number | null {
  if (startMs === null || endMs === null) return null;
  const span = endMs - startMs;
  return span >= 0 ? span : null;
}

/** Idle time of a non-terminal run vs nowMs, or null (terminal / no clock). */
export function runIdleMs(run: WorkflowRun, nowMs: number | undefined): number | null {
  if (nowMs === undefined || isRunTerminal(run.status)) return null;
  return Math.max(0, nowMs - run.updatedAtMs);
}

/** A non-terminal run is stale when it has been idle past the threshold. */
export function isRunStale(
  run: WorkflowRun,
  nowMs: number | undefined,
  staleAfterMs: number = DEFAULT_STALE_AFTER_MS,
): boolean {
  const idle = runIdleMs(run, nowMs);
  return idle !== null && idle > staleAfterMs;
}

/**
 * Proportional segment widths (percent, summing to 100) for a run's step line —
 * each step's width tracks its real duration so the line reads like a small
 * Gantt. Steps with no/zero duration get a visible minimum; when nothing has a
 * duration yet, widths fall back to equal. Pure and deterministic.
 */
export function computeStepWidths(durations: ReadonlyArray<number | null>): number[] {
  const n = durations.length;
  if (n === 0) return [];

  const equal = (): number[] => {
    const base = Math.floor((100 / n) * 100) / 100;
    const widths = Array.from({ length: n }, () => base);
    widths[n - 1] = Math.round((100 - base * (n - 1)) * 100) / 100;
    return widths;
  };

  const weights = durations.map((d) => (d !== null && d > 0 ? d : 0));
  const total = weights.reduce((sum, w) => sum + w, 0);
  const MIN = 6;
  const pool = 100 - MIN * n;
  if (total === 0 || pool <= 0) return equal();

  const raw = weights.map((w) => MIN + (w / total) * pool);
  const rounded = raw.map((v) => Math.round(v * 100) / 100);
  const drift = Math.round((100 - rounded.reduce((s, v) => s + v, 0)) * 100) / 100;
  rounded[n - 1] = Math.round((rounded[n - 1] + drift) * 100) / 100;
  return rounded;
}

function toLane(
  run: WorkflowRun,
  nowMs: number | undefined,
  staleAfterMs: number,
): WorkflowRunLane {
  const steps: WorkflowStepPoint[] = run.steps.map((step) => ({
    index: step.index,
    key: step.key,
    label: step.label,
    detail: step.detail,
    status: step.status,
    durationMs: spanMs(step.startedAtMs, step.endedAtMs),
  }));

  return {
    runId: run.id,
    workflowId: run.workflowId,
    agentId: run.agentId,
    title: run.title,
    trigger: run.trigger,
    status: run.status,
    progressPct: runProgressPct(run),
    currentStepIndex: currentStepIndex(run),
    steps,
    startedAtMs: run.startedAtMs,
    endedAtMs: run.endedAtMs,
    durationMs: spanMs(run.startedAtMs, run.endedAtMs),
    idleMs: runIdleMs(run, nowMs),
    isStale: isRunStale(run, nowMs, staleAfterMs),
    observedOutcomeId: run.observedOutcomeId,
  };
}

function compareLanes(left: WorkflowRunLane, right: WorkflowRunLane): number {
  const rank = RUN_STATUS_RANK[left.status] - RUN_STATUS_RANK[right.status];
  if (rank !== 0) return rank;
  // Newest activity first within the same status.
  const leftStart = left.startedAtMs ?? 0;
  const rightStart = right.startedAtMs ?? 0;
  if (leftStart !== rightStart) return rightStart - leftStart;
  return left.runId < right.runId ? -1 : left.runId > right.runId ? 1 : 0;
}

/**
 * Builds the live board. Swimlanes appear in the order their agent first shows
 * up in `runs` (stable, log-order). Within a swimlane, live runs sort above
 * concluded ones, newest first. Fully deterministic for a given run list and
 * `nowMs`.
 */
export function buildWorkflowLiveBoard(
  runs: readonly WorkflowRun[],
  agentNames: AgentNameLookup,
  options: WorkflowLiveBoardOptions = {},
): WorkflowLiveBoard {
  const nowMs = options.nowMs;
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;

  const lanesByAgent = new Map<string, WorkflowRunLane[]>();
  const agentOrder: string[] = [];

  for (const run of runs) {
    if (!lanesByAgent.has(run.agentId)) {
      lanesByAgent.set(run.agentId, []);
      agentOrder.push(run.agentId);
    }
    lanesByAgent.get(run.agentId)!.push(toLane(run, nowMs, staleAfterMs));
  }

  const swimlanes: WorkflowAgentSwimlane[] = agentOrder.map((agentId) => {
    const lanes = [...lanesByAgent.get(agentId)!].sort(compareLanes);
    return {
      agentId,
      agentName: resolveAgentName(agentNames, agentId),
      lanes,
      activeRunCount: lanes.filter((l) => !isRunTerminal(l.status)).length,
      completedRunCount: lanes.filter((l) => l.status === "completed").length,
      failedRunCount: lanes.filter((l) => l.status === "failed").length,
      staleRunCount: lanes.filter((l) => l.isStale).length,
    };
  });

  const nonTerminal = runs.filter((r) => !isRunTerminal(r.status));
  const avgProgressPct =
    nonTerminal.length === 0
      ? 0
      : Math.round(
          nonTerminal.reduce((sum, r) => sum + runProgressPct(r), 0) / nonTerminal.length,
        );

  const totals: WorkflowBoardTotals = {
    runs: runs.length,
    active: nonTerminal.length,
    completed: runs.filter((r) => r.status === "completed").length,
    failed: runs.filter((r) => r.status === "failed").length,
    blocked: runs.filter((r) => r.status === "blocked").length,
    stale: nonTerminal.filter((r) => isRunStale(r, nowMs, staleAfterMs)).length,
    agentsEngaged: agentOrder.length,
    avgProgressPct,
  };

  return { swimlanes, totals };
}
