import type { Route } from "next";
import { Banknote, Eye, Cpu } from "lucide-react";
import { getDefaultWorkspace } from "@/core/workspaces/registry";
import { CashActionReviewClient } from "@/features/ventures/components/cash-action-review-client";
import { composeVentureCouncilCashRun } from "@/features/ventures/venture-council-cash-run-composer";
import type { CashActionPacket } from "@/features/ventures/cash-action-packet";
import type { PreparedAction, PreparedActionCouncilSummary } from "@/features/ventures/prepared-action";
import { councilRunStatusPhase } from "@/features/workflows/run-lifecycle-phase";
import type {
  CouncilAnalysis,
  HermesPlanDisplay,
} from "@/features/ventures/cash-action-review-projection";
import {
  selectReviewablePreparedActions,
  toHermesPlanDisplay,
} from "@/features/ventures/cash-action-review-projection";
import { saveCashSignalIntakeAction } from "@/features/ventures/cash-signal-intake-action";
import type { CashSignalIntake } from "@/features/ventures/cash-signal-intake";
import type { VenturePersistenceMode } from "@/features/ventures/venture-save-types";
import { requireOwnerAccess } from "@/server/auth/owner";
import {
  getCashSignalIntakePersistenceMode,
  listCashSignalIntakesForWorkspace,
} from "@/server/ventures/cash-signal-intake-repository";
import { listPreparedActionsForWorkspace } from "@/server/ventures/prepared-action-repository";
import { OwnerAccessDenied } from "@/features/hq/components/owner-access-denied";
import {
  HqMetric,
  HqPageHeader,
  HqPageShell,
  HqSummaryRail,
  HqWidget,
} from "@/features/hq/components/hq-widget-system";

export const dynamic = "force-dynamic";

// Build the display Council analysis for a packet. Recomposes the council run
// (pure TypeScript — no LLM, no DB) for the full agent turns, and lets a stored
// summary override the headline verdict so the queue stays authoritative.
function toCouncilAnalysis(
  packet: CashActionPacket,
  runIndex: number,
  createdAt: string,
  override?: PreparedActionCouncilSummary,
): CouncilAnalysis {
  const result = composeVentureCouncilCashRun({
    runId: `council:${packet.packetId}`,
    cashActionPacket: packet,
    createdAt,
  });
  // Durable run badge only when the run came from a persisted prepared action
  // (the override). Only persisted prepared work is displayed.
  const runPhase = override?.runStatus ? councilRunStatusPhase(override.runStatus) : null;
  const analysis: CouncilAnalysis = {
    packetId: packet.packetId,
    readiness: override?.readiness ?? result.readiness,
    verdictDecision: override?.verdictDecision ?? result.verdict.decision,
    recommendedManualAction: override?.recommendedManualAction ?? result.recommendedManualAction,
    turns: result.turns.map((turn) => ({
      roleId: turn.roleId,
      outputSummary: turn.outputSummary,
      recommendation: turn.recommendation,
      confidenceScore: turn.confidenceScore,
    })),
    runIndex,
  };
  if (override?.runId) analysis.runId = override.runId;
  if (runPhase) analysis.runPhase = runPhase;
  return analysis;
}

export default async function CashActionReviewPage() {
  const access = await requireOwnerAccess("/hq/ventures/cash-actions");

  if (access.status === "forbidden") {
    return <OwnerAccessDenied email={access.user.email} />;
  }

  const workspaceId = getDefaultWorkspace({ ownerUserId: access.user.id }).id;

  // Opening this page only reads prepared work; generation requires an explicit workflow.
  let packets: CashActionPacket[] = [];
  let councilAnalyses: CouncilAnalysis[] = [];
  let hermesPlans: HermesPlanDisplay[] = [];
  const sourceMode = "prepared_queue" as const;
  let preparedQueueUnavailable = false;
  let generatedAt = new Date().toISOString();

  let reviewable: PreparedAction[] = [];
  try {
    const prepared = await listPreparedActionsForWorkspace(workspaceId);
    reviewable = selectReviewablePreparedActions(prepared);
  } catch {
    // Queue unavailable (not configured / migration 0013 not applied / read
    // error). Keep the read unavailable instead of triggering a model.
    preparedQueueUnavailable = true;
  }

  if (reviewable.length > 0) {
    // Read the prepared work straight from the queue (repository returns
    // most-recent first). The packet, council summary, and outreach plan were
    // all prepared earlier by Relay; we only project them for display.
    generatedAt = reviewable[0].createdAt;
    packets = reviewable.map((action) => action.packet);
    councilAnalyses = reviewable.map((action, i) =>
      toCouncilAnalysis(action.packet, i + 1, action.createdAt, action.council),
    );
    hermesPlans = reviewable.map((action) =>
      toHermesPlanDisplay(action.cashActionPacketId, action.hermesPlan),
    );
  }

  // Load previously captured signals for this owner's workspace so the screen
  // can show durable, auditable proof across sessions. A repository failure
  // surfaces as an empty-but-flagged state rather than pretending success.
  let savedIntakes: CashSignalIntake[] = [];
  let storageMode: VenturePersistenceMode = "unavailable";
  let loadError = false;
  try {
    savedIntakes = await listCashSignalIntakesForWorkspace(workspaceId);
    storageMode = getCashSignalIntakePersistenceMode();
  } catch {
    loadError = true;
  }

  return (
    <HqPageShell size="narrow">
      <HqPageHeader
        backHref={"/hq/ventures" as Route}
        backLabel="Venture Engine"
        eyebrow="Cash Action Review"
        icon={Banknote}
        tone="emerald"
        title="Cash Action Review"
        description={
          <>
            L&apos;agent prépare le move cash. Vous agissez manuellement. Le système capture la preuve.
          </>
        }
      >
        <HqSummaryRail>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-[11px] font-medium text-neutral-300">
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            Humain dans la boucle
          </span>
          <p className="mt-3 text-xs leading-5 text-neutral-500">
            Approbation requise. Aucune exécution, aucun envoi, aucune dépense déclenchés ici.
          </p>
          <div className="mt-3 flex items-center gap-1.5 text-[10px] text-neutral-600">
            <Cpu className="h-3 w-3 shrink-0" aria-hidden="true" />
            Relay — file préparée
          </div>
          <div className="mt-3 grid gap-2">
            <HqMetric label="Packets" value={packets.length} tone="emerald" />
            <HqMetric label="Signaux sauvés" value={savedIntakes.length} />
          </div>
        </HqSummaryRail>
      </HqPageHeader>

      <HqWidget title="Review queue" eyebrow="Prepared cash moves" icon={Banknote}>        {packets.length === 0 && !preparedQueueUnavailable && (          <p className="text-sm text-neutral-400">            Aucune action préparée à examiner. La visite de cette page ne lance aucun modèle.          </p>        )}
        <CashActionReviewClient
          packets={packets}
          councilAnalyses={councilAnalyses}
          hermesPlans={hermesPlans}
          generatedAt={generatedAt}
          sourceMode={sourceMode}
          preparedQueueUnavailable={preparedQueueUnavailable}
          savedIntakes={savedIntakes}
          storageMode={storageMode}
          loadError={loadError}
          onSave={saveCashSignalIntakeAction}
        />
      </HqWidget>
    </HqPageShell>
  );
}
