import { isDemoMode, EMPTY_DATA_LABEL } from "@/lib/demo-mode";
import { charterRegistry } from "@/features/agents/charter-seed";
import { agentRegistry } from "@/features/agents/seed";
import type { MissionLookup } from "@/features/hq/ledger-activity";
import type { ActionLedgerEntry } from "@/server/actions/action-ledger-repository";
import { buildKpiObservationReport, type KpiObservationReport } from "./kpi-observations";
import { kpiObservationBindings } from "./kpi-observation-bindings";
import { buildWorkflowLiveBoard, type WorkflowLiveBoard } from "./workflow-live-board";
import { createWorkflowRunStore } from "./workflow-run-events";
import { deriveObservationsFromRuns } from "./workflow-run-observations";
import { projectRunsFromLedger } from "./workflow-run-projection";
import {
  WORKFLOW_BOARD_DEMO_NOTE,
  buildWorkflowDemoObservations,
  buildWorkflowRunSeedEvents,
} from "./workflow-run-seed";

// ---------------------------------------------------------------------------
// /hq/workflows page model.
//
// Two pure assemblers from the same building blocks:
//   - assembleRealWorkflowsModel: projects REAL runs from the action ledger,
//     derives observations from those concluded runs, lights up the KPIs, and
//     flags stuck runs against `nowMs`.
//   - buildWorkflowsPageModel: the labelled demonstration fallback (no clock —
//     demo timestamps are fixed, staleness is not meaningful there).
// selectWorkflowsModel prefers real data; demo requires explicit opt-in. The
// page does the ledger/mission I/O and hands the data in — assembly stays pure.
// ---------------------------------------------------------------------------

export const WORKFLOW_BOARD_REAL_NOTE =
  "Runs réels projetés depuis l'action ledger — chaque étape reflète un événement réellement enregistré.";

export type WorkflowsModelSource = "ledger" | "demo";

export type WorkflowsPageModel = {
  board: WorkflowLiveBoard;
  kpiReport: KpiObservationReport;
  note: string;
  source: WorkflowsModelSource;
  isDemonstration: boolean;
  provenance: "ledger" | "simulated";
};

function agentNameLookup(): Record<string, string> {
  return Object.fromEntries(agentRegistry.map((agent) => [agent.id, agent.name]));
}

export function assembleRealWorkflowsModel(
  entries: readonly ActionLedgerEntry[],
  missionLookup: MissionLookup,
  nowMs?: number,
): WorkflowsPageModel {
  const runs = createWorkflowRunStore(projectRunsFromLedger(entries, missionLookup)).snapshot();
  const board = buildWorkflowLiveBoard(runs, agentNameLookup(), { nowMs });
  const kpiReport = buildKpiObservationReport(
    charterRegistry,
    deriveObservationsFromRuns(runs),
    kpiObservationBindings,
  );
  return {
    board,
    kpiReport,
    note: runs.length > 0 ? WORKFLOW_BOARD_REAL_NOTE : EMPTY_DATA_LABEL,
    source: "ledger",
    isDemonstration: false,
    provenance: "ledger",
  };
}

export function buildWorkflowsPageModel(): WorkflowsPageModel {
  if (!isDemoMode()) return assembleRealWorkflowsModel([], new Map());
  const store = createWorkflowRunStore(buildWorkflowRunSeedEvents(charterRegistry));
  const board = buildWorkflowLiveBoard(store.snapshot(), agentNameLookup());
  const kpiReport = buildKpiObservationReport(
    charterRegistry,
    buildWorkflowDemoObservations(),
    kpiObservationBindings,
  );
  return {
    board,
    kpiReport,
    note: WORKFLOW_BOARD_DEMO_NOTE,
    source: "demo",
    isDemonstration: true,
    provenance: "simulated",
  };
}

/** Empty stays empty unless the demonstration mode is explicitly enabled. */
export function selectWorkflowsModel(
  entries: readonly ActionLedgerEntry[],
  missionLookup: MissionLookup,
  nowMs?: number,
): WorkflowsPageModel {
  const real = assembleRealWorkflowsModel(entries, missionLookup, nowMs);
  return real.board.totals.runs === 0 && isDemoMode() ? buildWorkflowsPageModel() : real;
}
