import type { AgentCharter } from "@/features/agents/agent-charter";
import type { ObservedAgentOutcome } from "@/features/agents/observed-agent-outcome";
import { deriveWorkflowStepDefs } from "./workflow-run";
import type { WorkflowRunEvent } from "./workflow-run-events";

// ---------------------------------------------------------------------------
// Demonstration run log.
//
// The live board reads from a run store. Until live missions emit run events,
// this deterministic seed lets /hq/workflows render the REAL structure of the
// system — several agents in parallel, each workflow drawn as its own step
// line at a different stage. It is clearly demonstration data: grounded in the
// actual charter workflows, but no agent has executed anything. Replace the
// seed log with a live event source the day runs are wired to missions.
// ---------------------------------------------------------------------------

export const WORKFLOW_BOARD_DEMO_NOTE =
  "État de démonstration : structure réelle des workflows de chartes, aucune exécution live. " +
  "Les lignes d'étapes se peupleront automatiquement quand les missions émettront des événements de run.";

/** Fixed base instant so the board renders identically on every request. */
const BASE_MS = Date.parse("2026-06-12T13:00:00.000Z");
const SECOND = 1000;
const MINUTE = 60 * SECOND;

function workflowFor(charters: readonly AgentCharter[], agentId: string, workflowId?: string) {
  const charter = charters.find((c) => c.agentId === agentId);
  if (!charter || charter.workflows.length === 0) return null;
  const workflow = workflowId
    ? charter.workflows.find((w) => w.id === workflowId) ?? charter.workflows[0]
    : charter.workflows[0];
  return workflow;
}

type RunScript = {
  agentId: string;
  workflowId?: string;
  /** Steps to mark done before the cursor, in order. */
  doneSteps: number;
  /** What happens at the cursor step. */
  cursor: "active" | "failed" | "none";
  /** Terminal lifecycle to apply after the steps. */
  conclude: "running" | "completed" | "blocked" | "failed";
  startOffsetMin: number;
  observedOutcomeId?: string;
};

const RUN_SCRIPTS: RunScript[] = [
  // Joris: brief generation mid-flight — 3 steps done, validation active.
  { agentId: "joris", workflowId: "joris-ceo-brief", doneSteps: 3, cursor: "active", conclude: "running", startOffsetMin: 0 },
  // Relay: a SOP run fully completed with a recorded outcome.
  { agentId: "hermes", doneSteps: 5, cursor: "none", conclude: "completed", startOffsetMin: 8, observedOutcomeId: "obs-relay-demo" },
  // Sentinel: gate run blocked awaiting a CEO decision after producing output.
  { agentId: "sentinel", doneSteps: 2, cursor: "active", conclude: "blocked", startOffsetMin: 3 },
  // Radar (orion): a scan just started, first step in flight.
  { agentId: "orion", doneSteps: 0, cursor: "active", conclude: "running", startOffsetMin: 12 },
];

/**
 * Builds the deterministic demonstration event log. Pure: every timestamp is
 * derived from a fixed base, so the board is stable across renders and tests.
 */
export function buildWorkflowRunSeedEvents(
  charters: readonly AgentCharter[],
): WorkflowRunEvent[] {
  const events: WorkflowRunEvent[] = [];

  RUN_SCRIPTS.forEach((script, scriptIndex) => {
    const workflow = workflowFor(charters, script.agentId, script.workflowId);
    if (!workflow) return;

    const steps = deriveWorkflowStepDefs(workflow);
    const runId = `seed-${script.agentId}-${scriptIndex}`;
    let clock = BASE_MS + script.startOffsetMin * MINUTE;

    events.push({
      type: "run.started",
      runId,
      workflowId: workflow.id,
      agentId: script.agentId,
      title: workflow.title,
      trigger: workflow.trigger,
      steps,
      atMs: clock,
    });

    for (let i = 0; i < script.doneSteps && i < steps.length; i += 1) {
      events.push({ type: "step.started", runId, stepIndex: i, atMs: clock });
      clock += 45 * SECOND;
      events.push({ type: "step.completed", runId, stepIndex: i, atMs: clock });
      clock += 15 * SECOND;
    }

    const cursorIndex = Math.min(script.doneSteps, steps.length - 1);
    if (script.cursor === "active" && script.doneSteps < steps.length) {
      events.push({ type: "step.started", runId, stepIndex: cursorIndex, atMs: clock });
    } else if (script.cursor === "failed" && script.doneSteps < steps.length) {
      events.push({ type: "step.started", runId, stepIndex: cursorIndex, atMs: clock });
      clock += 30 * SECOND;
      events.push({ type: "step.failed", runId, stepIndex: cursorIndex, atMs: clock });
    }
    clock += 30 * SECOND;

    if (script.conclude === "completed") {
      events.push({
        type: "run.completed",
        runId,
        atMs: clock,
        observedOutcomeId: script.observedOutcomeId,
      });
    } else if (script.conclude === "blocked") {
      events.push({ type: "run.blocked", runId, atMs: clock, note: "Attente décision CEO" });
    } else if (script.conclude === "failed") {
      events.push({ type: "run.failed", runId, atMs: clock });
    }
  });

  return events;
}

/**
 * Demonstration observations so the KPI ↔ observations wiring shows a live
 * value instead of an empty "awaiting" everywhere. These are illustrative,
 * not real executions — same honesty caveat as the run seed.
 */
export function buildWorkflowDemoObservations(): ObservedAgentOutcome[] {
  const at = "2026-06-12T13:30:00.000Z";
  const base = {
    source: "demonstration",
    objective: "Démonstration du câblage KPI",
    expectedOutcome: "KPI calculé sur observations",
    actualOutcome: "Observation enregistrée",
    status: "completed" as const,
    riskLevel: "low" as const,
    artifacts: [],
    evidence: ["seed"],
    createdAt: at,
  };

  return [
    {
      ...base,
      id: "obs-joris-demo",
      agentId: "joris",
      metrics: {
        realizedProfitCents: 0,
        ceoMinutesSaved: 35,
        guardrailViolations: 0,
        usefulOutputs: 9,
        reviewedOutputs: 10,
      },
    },
    {
      ...base,
      id: "obs-sentinel-demo",
      agentId: "sentinel",
      metrics: {
        realizedProfitCents: 0,
        ceoMinutesSaved: 0,
        guardrailViolations: 0,
        usefulOutputs: 6,
        reviewedOutputs: 6,
      },
    },
  ];
}
