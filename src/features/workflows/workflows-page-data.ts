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
//     derives observations from those concluded runs, and lights up the KPIs.
//   - buildWorkflowsPageModel: the labelled demonstration fallback used when no
//     live activity exists yet.
// selectWorkflowsModel prefers the real board and falls back to the demo. The
// page does the ledger I/O and hands the entries in — assembly stays pure.
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
};

function agentNameLookup(): Record<string, string> {
  return Object.fromEntries(agentRegistry.map((agent) => [agent.id, agent.name]));
}

export function assembleRealWorkflowsModel(
  entries: readonly ActionLedgerEntry[],
  missionLookup: MissionLookup,
): WorkflowsPageModel {
  const runs = createWorkflowRunStore(projectRunsFromLedger(entries, missionLookup)).snapshot();
  const board = buildWorkflowLiveBoard(runs, agentNameLookup());
  const kpiReport = buildKpiObservationReport(
    charterRegistry,
    deriveObservationsFromRuns(runs),
    kpiObservationBindings,
  );
  return {
    board,
    kpiReport,
    note: WORKFLOW_BOARD_REAL_NOTE,
    source: "ledger",
    isDemonstration: false,
  };
}

export function buildWorkflowsPageModel(): WorkflowsPageModel {
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
  };
}

/** Prefer real ledger activity; fall back to the labelled demo when none. */
export function selectWorkflowsModel(
  entries: readonly ActionLedgerEntry[],
  missionLookup: MissionLookup,
): WorkflowsPageModel {
  const real = assembleRealWorkflowsModel(entries, missionLookup);
  return real.board.totals.runs > 0 ? real : buildWorkflowsPageModel();
}
