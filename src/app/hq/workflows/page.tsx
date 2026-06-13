import type { Route } from "next";
import { Target, Workflow } from "lucide-react";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { listActionLedgerForWorkspace } from "@/server/actions/action-ledger-read";
import type { ActionLedgerEntry } from "@/server/actions/action-ledger-repository";
import { listMissionsForWorkspace } from "@/server/missions";
import { buildMissionLookup, type MissionLookup } from "@/features/hq/ledger-activity";
import { agentRegistry } from "@/features/agents/seed";
import { selectWorkflowsModel } from "@/features/workflows/workflows-page-data";
import { WorkflowBoardLive } from "@/features/workflows/components/workflow-board-live";
import { KpiObservationPanel } from "@/features/workflows/components/kpi-observation-panel";
import { requireOwnerAccess } from "@/server/auth/owner";
import { OwnerAccessDenied } from "@/features/hq/components/owner-access-denied";
import { CockpitShell } from "@/features/cockpit/components/cockpit-shell";
import {
  HqMetric,
  HqPageHeader,
  HqSummaryRail,
  HqWidget,
} from "@/features/hq/components/hq-widget-system";

export const dynamic = "force-dynamic";

export default async function WorkflowsPage() {
  const access = await requireOwnerAccess("/hq/workflows");

  if (access.status === "forbidden") {
    return <OwnerAccessDenied email={access.user.email} />;
  }

  // Read the action ledger (the real run source) and the missions (for run
  // titles + status-based conclusion). Any failure falls back to the labelled
  // demonstration board — read-only, never throws into the page.
  let entries: ActionLedgerEntry[] = [];
  let missionLookup: MissionLookup = new Map();
  try {
    const { activeWorkspace, activeMode } = getActiveWorkspaceContext();
    const [ledger, missions] = await Promise.all([
      listActionLedgerForWorkspace({ workspaceId: activeWorkspace.id, limit: 100 }),
      listMissionsForWorkspace({ workspaceId: activeWorkspace.id, modeId: activeMode.id }),
    ]);
    entries = ledger.entries;
    missionLookup = buildMissionLookup(missions.missions);
  } catch {
    entries = [];
    missionLookup = new Map();
  }

  const model = selectWorkflowsModel(entries, missionLookup, new Date().getTime());
  const agentNames = Object.fromEntries(agentRegistry.map((agent) => [agent.id, agent.name]));
  const isReal = model.source === "ledger";

  return (
    <CockpitShell active="workflows" crumb="Workflows">
      <HqPageHeader
        backHref={"/hq" as Route}
        eyebrow="Workflows live"
        icon={Workflow}
        tone="violet"
        title="Workflows en direct"
        description={
          <>
            Chaque mission gouvernée, vue comme un run : plusieurs agents en parallèle, chaque run
            dessiné en ligne d&apos;étapes qui s&apos;allument à mesure que le ledger enregistre les
            événements. Les KPIs se mesurent sur les runs réellement conclus, pas sur des cibles
            figées.
          </>
        }
      >
        <HqSummaryRail>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
            Résumé
          </p>
          <div className="mt-3 grid gap-2">
            <HqMetric label="Agents engagés" value={model.board.totals.agentsEngaged} tone="violet" />
            <HqMetric label="Runs actifs" value={model.board.totals.active} tone="sky" />
            <HqMetric
              label="Coincés"
              value={model.board.totals.stale}
              tone={model.board.totals.stale > 0 ? "rose" : "neutral"}
            />
            <HqMetric label="KPIs atteints" value={model.kpiReport.metCount} tone="emerald" />
          </div>
        </HqSummaryRail>
      </HqPageHeader>

      <HqWidget
        title="Board live multi-agents"
        eyebrow={isReal ? "Runs réels · ledger" : "Runs · démonstration"}
        icon={Workflow}
        tone="violet"
      >
        <WorkflowBoardLive
          initialBoard={model.board}
          initialNote={model.note}
          initialSource={model.source}
        />
      </HqWidget>

      <HqWidget title="KPIs sur observations réelles" eyebrow="Santé mesurée" icon={Target} tone="emerald">
        <KpiObservationPanel report={model.kpiReport} agentNames={agentNames} />
      </HqWidget>
    </CockpitShell>
  );
}
