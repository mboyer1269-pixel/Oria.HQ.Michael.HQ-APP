import type { ListActionLedgerResult } from "@/server/actions/action-ledger-read.types";
import type { ListMissionsResult } from "@/server/missions/types";
import { buildMissionLookup } from "@/features/hq/ledger-activity";
import { buildAgentObservationsFromRuns } from "./agent-quality-from-runs";
import { buildRunHealthReport } from "./agent-run-health";
import { reduceWorkflowRuns } from "./workflow-run-events";
import { projectRunsFromLedger } from "./workflow-run-projection";

export const AGENT_ACTIVITY_LIMIT = 100;

/** Keep independent read failures distinct from a confirmed empty source. */
export async function loadAgentRunObservation(
  readLedger: () => Promise<ListActionLedgerResult>,
  readMissions: () => Promise<ListMissionsResult>,
  nowMs: number,
) {
  const [ledger, missions] = await Promise.allSettled([
    Promise.resolve().then(readLedger),
    Promise.resolve().then(readMissions),
  ]);
  const entries = ledger.status === "fulfilled" ? ledger.value.entries : [];
  const source = ledger.status === "fulfilled" ? ledger.value.source : null;
  const missionSource = missions.status === "fulfilled" ? missions.value.source : null;
  const status = ledger.status === "rejected" ? "unavailable" as const
    : missions.status === "rejected" || missionSource !== "supabase" ? "partial" as const
    : "complete" as const;
  // Local mission reads currently mix seed missions with local drafts. Their
  // provenance cannot confirm a real conclusion, even when the read succeeds.
  // Mission state can change a projected run's conclusion. Never publish
  // definitive health/quality metrics with missing or illustrative enrichment.
  const runs = status === "complete" && missions.status === "fulfilled"
    ? reduceWorkflowRuns(projectRunsFromLedger(entries, buildMissionLookup(missions.value.missions)))
    : null;
  return {
    status, source, missionSource, entries,
    report: runs === null ? null : buildRunHealthReport(runs, { nowMs }),
    observations: runs === null ? [] : buildAgentObservationsFromRuns(runs),
  };
}

export type AgentRunObservation = Awaited<ReturnType<typeof loadAgentRunObservation>>;
