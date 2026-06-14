// src/features/workflows/run-lifecycle-phase.ts
//
// Single shared "lifecycle phase" vocabulary above the many run/status enums
// (coherence audit P2). See docs/HQ_RUN_GLOSSARY.md.
//
// The HQ has several status enums across layers — mission, workflow run,
// workflow step, council run, council turn — and they drifted (`queued` vs
// `draft` for "not started"; `done` vs `completed` for "resolved"). Several of
// those tokens are PERSISTED (MissionStatus + the DB row status), so renaming
// them would be a breaking contract change. Instead this module maps every
// enum value onto ONE canonical phase, purely at the display/derivation layer.
// It changes no stored token and no contract.
//
// Exhaustiveness is enforced by the compiler: each map is typed
// Record<EnumUnion, RunLifecyclePhase>, so adding a value to any source enum
// without giving it a phase fails `npm run typecheck`. Pure data — no I/O.

import type { MissionStatus } from "@/core/types";
import type {
  AgentCouncilRunStatus,
  AgentCouncilTurnStatus,
} from "@/server/agents/agent-council-run-contract";
import type { WorkflowRunStatus, WorkflowStepStatus } from "./workflow-run";

/** The one canonical lifecycle phase every status enum resolves onto. */
export type RunLifecyclePhase =
  | "not_started"
  | "in_progress"
  | "waiting"
  | "blocked"
  | "done"
  | "failed"
  | "cancelled";

export const RUN_LIFECYCLE_PHASES: readonly RunLifecyclePhase[] = [
  "not_started",
  "in_progress",
  "waiting",
  "blocked",
  "done",
  "failed",
  "cancelled",
] as const;

/** Product labels (FR — aligned with existing step/mission labels). */
const PHASE_LABELS: Record<RunLifecyclePhase, string> = {
  not_started: "Pas démarré",
  in_progress: "En cours",
  waiting: "En attente",
  blocked: "Bloqué",
  done: "Terminé",
  failed: "Échec",
  cancelled: "Annulé",
};

/** Phases that represent a concluded run/step/turn (no further progress). */
const TERMINAL_PHASES: ReadonlySet<RunLifecyclePhase> = new Set([
  "done",
  "failed",
  "cancelled",
]);

/** Display label for a phase. */
export function phaseLabel(phase: RunLifecyclePhase): string {
  return PHASE_LABELS[phase];
}

/** Whether a phase is terminal (done / failed / cancelled). */
export function isPhaseTerminal(phase: RunLifecyclePhase): boolean {
  return TERMINAL_PHASES.has(phase);
}

// ---------------------------------------------------------------------------
// Per-enum mappings — the single source of truth for status → phase.
// Equivalences documented in docs/HQ_RUN_GLOSSARY.md are realised here:
//   - "not started":  mission `draft`/`queued` ≡ run `queued` ≡ council `draft`
//                      ≡ step/turn `pending`
//   - "resolved ok":  mission/run/council `completed` ≡ step `done`
//   - `skipped` (step/turn) → cancelled: terminal, work intentionally not done
//     — neither a success nor a failure.
// ---------------------------------------------------------------------------

export const MISSION_STATUS_PHASE: Record<MissionStatus, RunLifecyclePhase> = {
  draft: "not_started",
  queued: "not_started",
  running: "in_progress",
  needs_approval: "waiting",
  completed: "done",
  failed: "failed",
  cancelled: "cancelled",
};

export const WORKFLOW_RUN_STATUS_PHASE: Record<WorkflowRunStatus, RunLifecyclePhase> = {
  queued: "not_started",
  running: "in_progress",
  completed: "done",
  failed: "failed",
  blocked: "blocked",
};

export const WORKFLOW_STEP_STATUS_PHASE: Record<WorkflowStepStatus, RunLifecyclePhase> = {
  pending: "not_started",
  active: "in_progress",
  done: "done",
  failed: "failed",
  skipped: "cancelled",
};

export const COUNCIL_RUN_STATUS_PHASE: Record<AgentCouncilRunStatus, RunLifecyclePhase> = {
  draft: "not_started",
  running: "in_progress",
  waiting_for_agent: "waiting",
  ready_for_ceo: "waiting",
  blocked: "blocked",
  completed: "done",
  failed: "failed",
};

export const COUNCIL_TURN_STATUS_PHASE: Record<AgentCouncilTurnStatus, RunLifecyclePhase> = {
  pending: "not_started",
  completed: "done",
  failed: "failed",
  skipped: "cancelled",
};

/**
 * Safe lookup for a persisted/raw council run status string (e.g. a stored
 * value whose exact type was erased). Returns the canonical phase, or null when
 * the token is not a known council run status. Used by surfaces that read a
 * stored `runStatus` and want a P2 phase without importing the council enum.
 */
export function councilRunStatusPhase(status: string): RunLifecyclePhase | null {
  return (COUNCIL_RUN_STATUS_PHASE as Record<string, RunLifecyclePhase>)[status] ?? null;
}
