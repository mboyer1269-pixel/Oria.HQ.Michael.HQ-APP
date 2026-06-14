import type { AgentWorkflowDef } from "@/features/agents/agent-charter";

// ---------------------------------------------------------------------------
// Workflow Run — the observable execution layer above the charter.
//
// A charter's `AgentWorkflowDef` says what a workflow IS (trigger → inputs →
// outputs → validation → next action). A *run* is one observable instance of
// that workflow moving through canonical steps over time. Runs are what the
// live /hq/workflows board shows: many agents, each agent's run drawn as a
// line of steps that light up as they progress.
//
// Design principles (consistent with the rest of this feature set):
//   - Pure data + pure functions. No I/O, no Date.now(), no randomness.
//     Every timestamp is supplied by the caller, so runs are deterministic
//     and testable.
//   - A run never executes anything. It is a *record* of progression that a
//     human (or an upstream governed mission) reports. Building a run here
//     authorizes no action — humans stay on the loop.
//   - Steps are derived from the real charter definition, never invented:
//     the five canonical steps map 1:1 onto the workflow's declared fields.
// ---------------------------------------------------------------------------

/** Lifecycle of a single step inside a run. */
export type WorkflowStepStatus = "pending" | "active" | "done" | "failed" | "skipped";

/** Lifecycle of a whole run. */
export type WorkflowRunStatus = "queued" | "running" | "completed" | "failed" | "blocked";

/** Canonical step keys — one per declared field of an AgentWorkflowDef. */
export type WorkflowStepKey = "trigger" | "inputs" | "output" | "validation" | "next";

export const WORKFLOW_STEP_ORDER: readonly WorkflowStepKey[] = [
  "trigger",
  "inputs",
  "output",
  "validation",
  "next",
] as const;

/** Static description of a step, derived from the workflow definition. */
export type WorkflowStepDef = {
  /** Step identity. Canonical charter steps use {@link WorkflowStepKey};
   *  other projections (e.g. the ledger) supply their own keys. */
  key: string;
  /** Short canonical label (stable across all workflows). */
  label: string;
  /** Concrete detail pulled from the charter workflow (the real text). */
  detail: string;
};

/** A step inside a live run: its definition plus its current lifecycle state. */
export type WorkflowRunStep = WorkflowStepDef & {
  index: number;
  status: WorkflowStepStatus;
  startedAtMs: number | null;
  endedAtMs: number | null;
  note: string | null;
};

/** One observable instance of a workflow executing. */
export type WorkflowRun = {
  id: string;
  workflowId: string;
  agentId: string;
  title: string;
  trigger: string;
  status: WorkflowRunStatus;
  steps: WorkflowRunStep[];
  createdAtMs: number;
  updatedAtMs: number;
  startedAtMs: number | null;
  endedAtMs: number | null;
  /** Set when the run concluded and produced a recorded ObservedAgentOutcome. */
  observedOutcomeId: string | null;
};

const STEP_LABELS: Record<WorkflowStepKey, string> = {
  trigger: "Déclencheur",
  inputs: "Collecte des intrants",
  output: "Production",
  validation: "Validation",
  next: "Action suivante",
};

function joinDetail(values: string[]): string {
  return values
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .join(" · ");
}

/**
 * Derives the five canonical step definitions from a charter workflow. The
 * detail of each step is the real text declared in the charter, so a run line
 * is always grounded in the workflow's own definition — nothing invented.
 */
export function deriveWorkflowStepDefs(workflow: AgentWorkflowDef): WorkflowStepDef[] {
  const detailByKey: Record<WorkflowStepKey, string> = {
    trigger: workflow.trigger.trim(),
    inputs: joinDetail(workflow.inputs),
    output: joinDetail(workflow.outputs),
    validation: workflow.validation.trim(),
    next: workflow.nextAction.trim(),
  };

  return WORKFLOW_STEP_ORDER.map((key) => ({
    key,
    label: STEP_LABELS[key],
    detail: detailByKey[key],
  }));
}

/**
 * Total number of steps a run of this workflow will have. Always the canonical
 * count, so progress denominators are stable across the whole board.
 */
export function workflowStepCount(): number {
  return WORKFLOW_STEP_ORDER.length;
}

/** Steps that count as "finished" (no longer expected to run). */
const TERMINAL_STEP_STATUSES: ReadonlySet<WorkflowStepStatus> = new Set([
  "done",
  "failed",
  "skipped",
]);

/** Run statuses that represent a concluded run. */
const TERMINAL_RUN_STATUSES: ReadonlySet<WorkflowRunStatus> = new Set([
  "completed",
  "failed",
]);

export function isStepTerminal(status: WorkflowStepStatus): boolean {
  return TERMINAL_STEP_STATUSES.has(status);
}

export function isRunTerminal(status: WorkflowRunStatus): boolean {
  return TERMINAL_RUN_STATUSES.has(status);
}

/**
 * Fraction of a run's steps that have reached a terminal state, 0..1.
 * Deterministic; a skipped step counts as resolved. An empty run is 0.
 */
export function runProgressRatio(run: WorkflowRun): number {
  if (run.steps.length === 0) return 0;
  const resolved = run.steps.filter((step) => isStepTerminal(step.status)).length;
  return resolved / run.steps.length;
}

/** Whole-percent progress (0..100), rounded. */
export function runProgressPct(run: WorkflowRun): number {
  return Math.round(runProgressRatio(run) * 100);
}

/**
 * Index of the step currently being worked, or the first unresolved step when
 * none is active. Returns -1 when every step is terminal (run is done).
 */
export function currentStepIndex(run: WorkflowRun): number {
  const active = run.steps.findIndex((step) => step.status === "active");
  if (active !== -1) return active;
  const firstOpen = run.steps.findIndex((step) => !isStepTerminal(step.status));
  return firstOpen;
}
