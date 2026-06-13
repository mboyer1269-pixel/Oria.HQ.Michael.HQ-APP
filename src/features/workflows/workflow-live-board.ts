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
// parallel; each keeps its own lane. Pure and deterministic: ordering is fully
// specified, no Date.now(), no I/O. The board reflects observed runs — it
// authorizes nothing.
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
  observedOutcomeId: string | null;
};

export type WorkflowAgentSwimlane = {
  agentId: string;
  agentName: string;
  lanes: WorkflowRunLane[];
  activeRunCount: number;
  completedRunCount: number;
  failedRunCount: number;
};

export type WorkflowBoardTotals = {
  runs: number;
  /** Non-terminal runs: running, blocked or queued. */
  active: number;
  completed: number;
  failed: number;
  blocked: number;
  agentsEngaged: number;
  /** Mean progress across non-terminal runs — the board's live momentum. */
  avgProgressPct: number;
};

export type WorkflowLiveBoard = {
  swimlanes: WorkflowAgentSwimlane[];
  totals: WorkflowBoardTotals;
};

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

function toLane(run: WorkflowRun): WorkflowRunLane {
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
 * concluded ones, newest first. Fully deterministic for a given run list.
 */
export function buildWorkflowLiveBoard(
  runs: readonly WorkflowRun[],
  agentNames: AgentNameLookup,
): WorkflowLiveBoard {
  const lanesByAgent = new Map<string, WorkflowRunLane[]>();
  const agentOrder: string[] = [];

  for (const run of runs) {
    if (!lanesByAgent.has(run.agentId)) {
      lanesByAgent.set(run.agentId, []);
      agentOrder.push(run.agentId);
    }
    lanesByAgent.get(run.agentId)!.push(toLane(run));
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
    agentsEngaged: agentOrder.length,
    avgProgressPct,
  };

  return { swimlanes, totals };
}
