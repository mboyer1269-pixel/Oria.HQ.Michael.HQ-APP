import type { ObservedAgentOutcome } from "@/features/agents/observed-agent-outcome";
import type { WorkflowRun } from "./workflow-run";
import { isRunTerminal } from "./workflow-run";

// ---------------------------------------------------------------------------
// Runs → observations bridge (closes the loop).
//
// A concluded run is itself evidence of agent work, so it feeds the KPI report
// directly instead of needing a separate observation source. The mapping is
// deliberate and conservative:
//   - a completed run  → 1 reviewed output that was useful, 0 guardrail issues
//   - a failed run     → 1 reviewed output that was NOT useful, 1 guardrail issue
// Aggregated per agent this makes useful_output_rate ≈ completion rate and
// guardrail_clean_rate ≈ 1 − failure rate — real signal from real runs.
//
// Pure: timestamps come from the run's own endedAt/updatedAt, never Date.now().
// Recording these authorizes nothing; humans stay on the loop.
// ---------------------------------------------------------------------------

const COMPLETED_METRICS = {
  realizedProfitCents: 0,
  ceoMinutesSaved: 0,
  guardrailViolations: 0,
  usefulOutputs: 1,
  reviewedOutputs: 1,
} as const;

const FAILED_METRICS = {
  realizedProfitCents: 0,
  ceoMinutesSaved: 0,
  guardrailViolations: 1,
  usefulOutputs: 0,
  reviewedOutputs: 1,
} as const;

function isoFrom(primaryMs: number | null, fallbackMs: number): string {
  const ms = primaryMs ?? fallbackMs;
  return new Date(ms).toISOString();
}

/**
 * Turns concluded (completed/failed) runs into observations the KPI linker can
 * read. Non-terminal runs produce nothing — only finished work is evidence.
 */
export function deriveObservationsFromRuns(
  runs: readonly WorkflowRun[],
): ObservedAgentOutcome[] {
  const observations: ObservedAgentOutcome[] = [];

  for (const run of runs) {
    if (!isRunTerminal(run.status)) continue;
    const completed = run.status === "completed";

    observations.push({
      id: `run-obs-${run.id}`,
      agentId: run.agentId,
      source: "workflow-run",
      objective: run.title,
      expectedOutcome: run.trigger,
      actualOutcome: completed ? "Run complété" : "Run échoué",
      status: completed ? "completed" : "failed",
      riskLevel: "low",
      artifacts: [],
      evidence: [run.id],
      createdAt: isoFrom(run.endedAtMs, run.updatedAtMs),
      metrics: { ...(completed ? COMPLETED_METRICS : FAILED_METRICS) },
    });
  }

  return observations;
}
