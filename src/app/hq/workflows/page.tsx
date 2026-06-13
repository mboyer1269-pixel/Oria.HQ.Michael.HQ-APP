import type { Route } from "next";
import { Target, Workflow } from "lucide-react";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { listActionLedgerForWorkspace } from "@/server/actions/action-ledger-read";
import type { ActionLedgerEntry } from "@/server/actions/action-ledger-repository";
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

  // Read the action ledger (the real run source). Any failure falls back to the
  // labelled demonstration board — read-only, never throws into the page.
  let entries: ActionLedgerEntry[] = [];
  try {
    const { activeWorkspace } = getActiveWorkspaceContext();
    const ledger = await listActionLedgerForWorkspace({
      workspaceId: activeWorkspace.id,
      limit: 100,
    });
    entries = ledger.entries;
  } catch {
    entries = [];
  }

  const model = selectWorkflowsModel(entries, new Map());
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
            <HqMetric label="Terminés" value={model.board.totals.completed} tone="emerald" />
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
