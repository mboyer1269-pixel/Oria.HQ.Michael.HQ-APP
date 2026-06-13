import type { AgentQualityObservation } from "@/features/agents/agent-quality-evaluation";
import { aggregateObservationsByAgent } from "./kpi-observations";
import type { WorkflowRun } from "./workflow-run";
import { deriveObservationsFromRuns } from "./workflow-run-observations";

// ---------------------------------------------------------------------------
// Runs → agent quality observations.
//
// Bridges the workflow board into the EXISTING agent quality scorecard
// (`/hq/agents`). Concluded runs become per-agent observations in the exact
// shape `buildAgentQualityEvaluation` already consumes, so the HQ-wide health
// score reflects real run activity instead of staying on a blueprint baseline.
//
// Pure and read-only: it reuses the same conservative run→observation mapping
// and per-agent aggregation as the KPI report (single derivation, no drift).
// ---------------------------------------------------------------------------

export function buildAgentObservationsFromRuns(
  runs: readonly WorkflowRun[],
): AgentQualityObservation[] {
  const aggregates = aggregateObservationsByAgent(deriveObservationsFromRuns(runs));

  return [...aggregates.values()].map((agg) => ({
    agentId: agg.agentId,
    realizedProfitCents: agg.realizedProfitCents,
    ceoMinutesSaved: agg.ceoMinutesSaved,
    guardrailViolations: agg.guardrailViolations,
    usefulOutputs: agg.usefulOutputs,
    reviewedOutputs: agg.reviewedOutputs,
  }));
}
