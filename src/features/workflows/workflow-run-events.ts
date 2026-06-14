import type { WorkflowStepDef, WorkflowRun, WorkflowRunStep } from "./workflow-run";

// ---------------------------------------------------------------------------
// Workflow Run Events — the event-sourced source of truth for runs.
//
// Runs are never mutated in place. Every change is an append-only event with a
// caller-supplied timestamp; the run state is a pure left-fold over the event
// log. This makes the live board deterministic and replayable, and keeps the
// store free of I/O — events live in memory only (no DB, no network).
//
// An event records that something WAS observed to happen; appending one never
// triggers an action. The human / governed mission stays the source of truth.
// ---------------------------------------------------------------------------

export type WorkflowRunEvent =
  | {
      type: "run.started";
      runId: string;
      workflowId: string;
      agentId: string;
      title: string;
      trigger: string;
      steps: WorkflowStepDef[];
      atMs: number;
    }
  | { type: "step.started"; runId: string; stepIndex: number; atMs: number; note?: string }
  | { type: "step.completed"; runId: string; stepIndex: number; atMs: number; note?: string }
  | { type: "step.failed"; runId: string; stepIndex: number; atMs: number; note?: string }
  | { type: "step.skipped"; runId: string; stepIndex: number; atMs: number; note?: string }
  | { type: "run.completed"; runId: string; atMs: number; observedOutcomeId?: string }
  | { type: "run.failed"; runId: string; atMs: number; note?: string }
  | { type: "run.blocked"; runId: string; atMs: number; note?: string }
  | { type: "run.unblocked"; runId: string; atMs: number };

/** Immutable run-set state: runs keyed by id, plus deterministic insert order. */
export type WorkflowRunsState = {
  runs: Readonly<Record<string, WorkflowRun>>;
  order: readonly string[];
};

export const EMPTY_WORKFLOW_RUNS_STATE: WorkflowRunsState = {
  runs: {},
  order: [],
};

function buildPendingSteps(defs: WorkflowStepDef[]): WorkflowRunStep[] {
  return defs.map((def, index) => ({
    ...def,
    index,
    status: "pending",
    startedAtMs: null,
    endedAtMs: null,
    note: null,
  }));
}

function withRun(state: WorkflowRunsState, run: WorkflowRun): WorkflowRunsState {
  const exists = run.id in state.runs;
  return {
    runs: { ...state.runs, [run.id]: run },
    order: exists ? state.order : [...state.order, run.id],
  };
}

function patchStep(
  run: WorkflowRun,
  stepIndex: number,
  patch: Partial<WorkflowRunStep>,
): WorkflowRun {
  if (stepIndex < 0 || stepIndex >= run.steps.length) return run;
  const steps = run.steps.map((step, index) =>
    index === stepIndex ? { ...step, ...patch } : step,
  );
  return { ...run, steps };
}

/**
 * Pure reducer: applies a single event to the run-set state and returns a new
 * state. Step/lifecycle events for an unknown run are ignored (return the
 * state unchanged) so a malformed log can never throw.
 */
export function applyWorkflowRunEvent(
  state: WorkflowRunsState,
  event: WorkflowRunEvent,
): WorkflowRunsState {
  if (event.type === "run.started") {
    if (event.runId in state.runs) return state; // idempotent on duplicate start
    const run: WorkflowRun = {
      id: event.runId,
      workflowId: event.workflowId,
      agentId: event.agentId,
      title: event.title,
      trigger: event.trigger,
      status: "running",
      steps: buildPendingSteps(event.steps),
      createdAtMs: event.atMs,
      updatedAtMs: event.atMs,
      startedAtMs: event.atMs,
      endedAtMs: null,
      observedOutcomeId: null,
    };
    return withRun(state, run);
  }

  const existing = state.runs[event.runId];
  if (!existing) return state;

  let run: WorkflowRun = { ...existing, updatedAtMs: event.atMs };

  switch (event.type) {
    case "step.started":
      run = patchStep(run, event.stepIndex, {
        status: "active",
        startedAtMs: event.atMs,
        note: event.note ?? null,
      });
      run = run.status === "blocked" ? run : { ...run, status: "running" };
      break;
    case "step.completed":
      run = patchStep(run, event.stepIndex, {
        status: "done",
        endedAtMs: event.atMs,
        note: event.note ?? null,
      });
      break;
    case "step.failed":
      run = patchStep(run, event.stepIndex, {
        status: "failed",
        endedAtMs: event.atMs,
        note: event.note ?? null,
      });
      break;
    case "step.skipped":
      run = patchStep(run, event.stepIndex, {
        status: "skipped",
        endedAtMs: event.atMs,
        note: event.note ?? null,
      });
      break;
    case "run.completed":
      run = {
        ...run,
        status: "completed",
        endedAtMs: event.atMs,
        observedOutcomeId: event.observedOutcomeId ?? run.observedOutcomeId,
      };
      break;
    case "run.failed":
      run = { ...run, status: "failed", endedAtMs: event.atMs };
      break;
    case "run.blocked":
      run = { ...run, status: "blocked" };
      break;
    case "run.unblocked":
      run = run.status === "blocked" ? { ...run, status: "running" } : run;
      break;
  }

  return withRun(state, run);
}

/** Folds an event log into the ordered list of runs. Pure and replayable. */
export function reduceWorkflowRuns(events: readonly WorkflowRunEvent[]): WorkflowRun[] {
  const state = events.reduce(applyWorkflowRunEvent, EMPTY_WORKFLOW_RUNS_STATE);
  return state.order.map((id) => state.runs[id]);
}

/** Public store surface — append-only event log over an in-memory snapshot. */
export interface WorkflowRunStore {
  append(event: WorkflowRunEvent): void;
  appendMany(events: readonly WorkflowRunEvent[]): void;
  getEvents(): WorkflowRunEvent[];
  /** Ordered runs derived from the full log. */
  snapshot(): WorkflowRun[];
}

/**
 * In-memory event store. Holds the append-only log and derives run state on
 * demand. No persistence, no I/O — a process-local cache only. Seed it with a
 * starting log for deterministic rendering or tests.
 */
export function createWorkflowRunStore(
  initialEvents: readonly WorkflowRunEvent[] = [],
): WorkflowRunStore {
  const log: WorkflowRunEvent[] = [...initialEvents];

  return {
    append(event) {
      log.push(event);
    },
    appendMany(events) {
      for (const event of events) log.push(event);
    },
    getEvents() {
      return [...log];
    },
    snapshot() {
      return reduceWorkflowRuns(log);
    },
  };
}
