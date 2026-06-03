import type { Route } from "next";
import Link from "next/link";
import { ArrowLeft, Banknote, Eye, Cpu } from "lucide-react";
import { getDefaultWorkspace } from "@/core/workspaces/registry";
import { CashActionReviewClient } from "@/features/ventures/components/cash-action-review-client";
import { AGENT_VENTURE_WORKBENCH_ITEMS } from "@/features/ventures/agent-venture-workbench-data";
import {
  generateLlmCashActionPacketsFromVentures,
  ORYA_VENTURES,
} from "@/features/ventures/llm-cash-action-packet-generator";
import type { LlmPacketSource } from "@/features/ventures/llm-cash-action-packet-generator";
import { composeVentureCouncilCashRun } from "@/features/ventures/venture-council-cash-run-composer";
import { buildHermesOutreachPlanFromCashActionPacket } from "@/features/ventures/hermes-outreach-plan";
import type { CashActionPacket } from "@/features/ventures/cash-action-packet";
import type { PreparedAction } from "@/features/ventures/prepared-action";
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

export const dynamic = "force-dynamic";

// Build the display Council analysis for a packet. Recomposes the council run
// (pure TypeScript — no LLM, no DB) for the full agent turns, and lets a stored
// summary override the headline verdict so the queue stays authoritative.
function toCouncilAnalysis(
  packet: CashActionPacket,
  runIndex: number,
  createdAt: string,
  override?: Pick<CouncilAnalysis, "readiness" | "verdictDecision" | "recommendedManualAction">,
): CouncilAnalysis {
  const result = composeVentureCouncilCashRun({
    runId: `council:${packet.packetId}`,
    cashActionPacket: packet,
    createdAt,
  });
  return {
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
}

export default async function CashActionReviewPage() {
  const access = await requireOwnerAccess("/hq/ventures/cash-actions");

  if (access.status === "forbidden") {
    return <OwnerAccessDenied email={access.user.email} />;
  }

  const workspaceId = getDefaultWorkspace({ ownerUserId: access.user.id }).id;

  // PREFERRED SOURCE — the durable prepared-action queue written by the Hermès
  // iterative prep agent. When it holds reviewable work, the page is a pure
  // READER: no LLM call on open. If the queue is empty we fall back to live
  // generation; if the repository errors (e.g. migration 0013 not yet applied
  // in prod), we never crash — we flag it and fall back to live generation.
  let packets: CashActionPacket[] = [];
  let councilAnalyses: CouncilAnalysis[] = [];
  let hermesPlans: HermesPlanDisplay[] = [];
  let sourceMode: "prepared_queue" | "live" = "live";
  let packetSource: LlmPacketSource = "fallback_seed";
  let preparedQueueUnavailable = false;
  let generatedAt = new Date().toISOString();

  let reviewable: PreparedAction[] = [];
  try {
    const prepared = await listPreparedActionsForWorkspace(workspaceId);
    reviewable = selectReviewablePreparedActions(prepared);
  } catch {
    // Queue unavailable (not configured / migration 0013 not applied / read
    // error). Do not block the page — fall back to live generation below.
    preparedQueueUnavailable = true;
  }

  if (reviewable.length > 0) {
    // Read the prepared work straight from the queue (repository returns
    // most-recent first). The packet, council summary, and outreach plan were
    // all prepared earlier by Hermès; we only project them for display.
    sourceMode = "prepared_queue";
    generatedAt = reviewable[0].createdAt;
    packets = reviewable.map((action) => action.packet);
    councilAnalyses = reviewable.map((action, i) =>
      toCouncilAnalysis(action.packet, i + 1, action.createdAt, action.council),
    );
    hermesPlans = reviewable.map((action) =>
      toHermesPlanDisplay(action.cashActionPacketId, action.hermesPlan),
    );
  } else {
    // LIVE FALLBACK — no prepared work yet. Agents prepare concrete cash moves
    // server-side: if ANTHROPIC_API_KEY is configured, packets are generated by
    // Claude from the real venture contexts; otherwise the deterministic seed
    // path is used. The page never blocks on an LLM failure.
    const llmResult = await generateLlmCashActionPacketsFromVentures({
      ventures: ORYA_VENTURES,
      fallbackItems: AGENT_VENTURE_WORKBENCH_ITEMS,
      createdAt: generatedAt,
    });
    packets = llmResult.packets;
    packetSource = llmResult.source;
    councilAnalyses = packets.map((packet, i) => toCouncilAnalysis(packet, i + 1, generatedAt));
    hermesPlans = packets.map((packet) =>
      toHermesPlanDisplay(packet.packetId, buildHermesOutreachPlanFromCashActionPacket(packet)),
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
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-4 py-5 md:px-8 md:py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link
            href={"/hq/ventures" as Route}
            className="inline-flex items-center gap-1.5 text-xs text-neutral-500 transition hover:text-neutral-300"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Venture Engine
          </Link>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
            <Banknote className="h-3.5 w-3.5" />
            Cash Action Review
          </div>
          <h1 className="mt-4 text-3xl font-bold leading-tight text-white sm:text-4xl">
            Cash Action Review
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-400">
            L&apos;agent prépare le move cash. Vous agissez manuellement. Le système capture la preuve.
          </p>
        </div>

        <aside className="shrink-0 self-start rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4 sm:w-56">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-[11px] font-medium text-neutral-300">
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            Humain dans la boucle
          </span>
          <p className="mt-3 text-xs leading-5 text-neutral-500">
            Approbation requise. Aucune exécution, aucun envoi, aucune dépense déclenchés ici.
          </p>
          <div className="mt-3 flex items-center gap-1.5 text-[10px] text-neutral-600">
            <Cpu className="h-3 w-3 shrink-0" aria-hidden="true" />
            {sourceMode === "prepared_queue"
              ? "Hermès — file préparée"
              : packetSource === "anthropic"
                ? "Anthropic — propositions IA"
                : "Seed — données de référence"}
          </div>
        </aside>
      </header>

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
    </main>
  );
}
