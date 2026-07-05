// src/features/hq/components/command-tower.tsx
//
// Command Tower v1 — the first section of /hq (design: docs/COMMAND_TOWER_V1.md).
// Server component: reads the already-merged engines (decision spine, execution
// intents, action ledger), builds the pure view-model, renders seven cards.
// Read-only everywhere except the Approval Rail, which reuses the existing
// governed approve/reject panel. A failed read renders "unavailable" — never
// a fake zero, never a fake "ready".

import type { Route } from "next";
import Link from "next/link";
import {
  CircleSlash,
  ClipboardCheck,
  ParkingSquare,
  Radar,
  Send,
  TowerControl,
} from "lucide-react";
import { ExecutionIntentReviewPanel } from "@/features/agents/components/execution-intent-review-panel";
import {
  buildCommandTowerModel,
  MAX_EVIDENCE_ITEMS,
  type CommandTowerInputs,
  type CommandTowerModel,
} from "@/features/hq/command-tower/command-tower-model";
import { loadRuntimeStatusBoard } from "@/features/hq/command-tower/runtime-status-source";
import { formatLedgerActivityTimestamp } from "@/features/hq/ledger-activity";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { listActionLedgerForWorkspace } from "@/server/actions/action-ledger-read";
import { listPendingAgentExecutionIntents } from "@/server/agents/execution-intent-repository";
import { collectDecisionSignalSnapshot } from "@/server/decision-spine/collect-decision-signals";
import { computeNextBestActions } from "@/server/decision-spine/next-best-action";

async function loadCommandTowerInputs(workspaceId: string): Promise<CommandTowerInputs> {
  const [pendingIntents, nextAction, evidence, runtimeBoard] = await Promise.all([
    listPendingAgentExecutionIntents(workspaceId)
      .then((intents) =>
        intents.map((intent) => ({
          intentId: intent.intentId,
          agentId: intent.agentId,
          skillId: intent.skillId,
          toolName: intent.toolName,
          autonomyLevel: intent.autonomyLevel,
          createdAt: intent.createdAt,
        })),
      )
      .catch(() => null),
    collectDecisionSignalSnapshot({ workspaceId })
      .then((snapshot) => {
        const result = computeNextBestActions(snapshot);
        return {
          highlighted: result.highlighted
            ? {
                id: result.highlighted.id,
                title: result.highlighted.title,
                summary: result.highlighted.summary,
                priority: result.highlighted.priority,
                safety: result.highlighted.safety,
                ctaLabel: result.highlighted.cta.label,
                ctaHref: result.highlighted.cta.href,
              }
            : null,
          isZeroState: result.isZeroState,
          totalActions: result.actions.length,
        };
      })
      .catch(() => null),
    listActionLedgerForWorkspace({ workspaceId, limit: MAX_EVIDENCE_ITEMS })
      .then((result) => ({
        items: result.entries.map((entry) => ({
          id: entry.id,
          summary: entry.summary,
          eventType: entry.eventType ?? null,
          agentId: entry.agentId ?? null,
          createdAt: entry.createdAt,
        })),
        source: result.source,
      }))
      .catch(() => null),
    loadRuntimeStatusBoard().catch(() => null),
  ]);

  return { pendingIntents, nextAction, evidence, runtimeBoard };
}

const STATE_BADGE_STYLES: Record<string, string> = {
  ready: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  empty: "border-neutral-700 bg-neutral-900 text-neutral-400",
  unavailable: "border-amber-500/20 bg-amber-500/10 text-amber-300",
  not_configured: "border-neutral-700 bg-neutral-900 text-neutral-400",
  pending: "border-amber-500/20 bg-amber-500/10 text-amber-300",
  blocked: "border-red-500/20 bg-red-500/10 text-red-300",
  installed_unverified: "border-amber-500/20 bg-amber-500/10 text-amber-300",
  future_candidate: "border-neutral-700 bg-neutral-900 text-neutral-500",
  future_tool_corridor: "border-neutral-700 bg-neutral-900 text-neutral-500",
  governed_live: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  blocked_until_dispatch_mandate: "border-red-500/20 bg-red-500/10 text-red-300",
  future_corridor: "border-neutral-700 bg-neutral-900 text-neutral-500",
  probe_v1: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  probe_unavailable: "border-amber-500/20 bg-amber-500/10 text-amber-300",
};

function StateBadge({ value }: { value: string }) {
  const style = STATE_BADGE_STYLES[value] ?? STATE_BADGE_STYLES.empty;
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${style}`}>
      {value}
    </span>
  );
}

function TowerCard({
  title,
  eyebrow,
  badge,
  children,
}: {
  title: string;
  eyebrow: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-neutral-800 bg-neutral-950/70 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-400">
            {eyebrow}
          </p>
          <h3 className="mt-1 text-lg font-semibold text-white">{title}</h3>
        </div>
        {badge ? <StateBadge value={badge} /> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function UnavailableNote({ what }: { what: string }) {
  return (
    <p className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-amber-200">
      {what} indisponible — la source de données n&apos;a pas répondu. Aucun chiffre inventé.
    </p>
  );
}

function MissionBriefCard({ model }: { model: CommandTowerModel }) {
  const brief = model.missionBrief;
  return (
    <TowerCard title="Mission Brief" eyebrow="1 · Voir" badge={brief.state}>
      <p className="text-sm font-medium text-neutral-200">{brief.headline}</p>
      {brief.nextAction ? (
        <div className="mt-3 rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold text-white">{brief.nextAction.title}</p>
            <StateBadge value={brief.nextAction.priority} />
          </div>
          <p className="mt-1 text-sm leading-6 text-neutral-400">{brief.nextAction.summary}</p>
          <Link
            href={brief.nextAction.ctaHref as Route}
            className="mt-3 inline-flex min-h-10 items-center justify-center rounded-lg bg-amber-500 px-4 text-sm font-bold text-neutral-950 transition hover:bg-amber-400"
          >
            {brief.nextAction.ctaLabel}
          </Link>
        </div>
      ) : brief.state === "unavailable" ? (
        <div className="mt-3">
          <UnavailableNote what="Le brief" />
        </div>
      ) : (
        <p className="mt-3 text-sm text-neutral-500">
          Rien d&apos;urgent selon le Decision Spine. Prochain regard utile : la file de décisions.
        </p>
      )}
    </TowerCard>
  );
}

function DecisionQueueCard({ model }: { model: CommandTowerModel }) {
  const queue = model.decisionQueue;
  return (
    <TowerCard title="Decision Queue" eyebrow="2 · Décider" badge={queue.state}>
      {queue.state === "unavailable" ? (
        <UnavailableNote what="La file d'intents" />
      ) : queue.state === "empty" ? (
        <p className="text-sm text-neutral-500">
          Aucune décision en attente. Les nouveaux intents apparaissent ici dès qu&apos;un agent en
          propose un.
        </p>
      ) : (
        <ul className="space-y-2">
          {queue.items.map((item) => (
            <li
              key={item.intentId}
              className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-white">
                  {item.agentId} · {item.skillId}
                </p>
                <span className="text-[11px] text-neutral-500">
                  {formatLedgerActivityTimestamp(item.createdAt)}
                </span>
              </div>
              <p className="mt-1 text-xs text-neutral-500">
                {item.toolName} · autonomie {item.autonomyLevel} · requires approval
              </p>
            </li>
          ))}
        </ul>
      )}
      {queue.overflowCount > 0 ? (
        <p className="mt-3 text-xs text-neutral-500">
          + {queue.overflowCount} autre{queue.overflowCount > 1 ? "s" : ""} dans le rail
          d&apos;approbation ci-dessous.
        </p>
      ) : null}
    </TowerCard>
  );
}

function RuntimeStatusCard({ model }: { model: CommandTowerModel }) {
  const runtime = model.runtimeStatus;
  return (
    <TowerCard title="Runtime Status" eyebrow="3 · Runtimes" badge={runtime.gate}>
      <p className="mb-3 rounded-2xl border border-neutral-800 bg-neutral-900/50 p-3 text-xs text-neutral-400">
        {runtime.gate === "probe_v1" ? (
          <>
            Probe v1 actif — statuts dérivés de commandes locales sûres (allowlist stricte, aucun
            prompt envoyé, aucun token lu). Détection ≠ permission : aucun dispatch sans
            approbation.
            {runtime.probedAtIso ? (
              <span className="text-neutral-600">
                {" "}
                Preuves relevées {formatLedgerActivityTimestamp(runtime.probedAtIso)}.
              </span>
            ) : null}
          </>
        ) : (
          <>
            Probe v1 indisponible dans ce rendu — statuts par défaut sans preuve. Aucun runtime ne
            peut honnêtement afficher « ready ».
          </>
        )}
      </p>
      <ul className="space-y-2">
        {runtime.entries.map((entry) => (
          <li
            key={entry.id}
            className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-3"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-white">
                {entry.label}
                {entry.probe?.version ? (
                  <span className="ml-2 text-[11px] font-normal text-neutral-500">
                    {entry.probe.version}
                  </span>
                ) : null}
              </p>
              <StateBadge value={entry.status} />
            </div>
            <p className="mt-1 text-xs leading-5 text-neutral-500">{entry.note}</p>
            <p className="mt-1 text-[11px] leading-4 text-neutral-600">preuve : {entry.evidence}</p>
          </li>
        ))}
      </ul>
    </TowerCard>
  );
}

function DispatchBoardCard({ model }: { model: CommandTowerModel }) {
  return (
    <TowerCard title="Runtime Dispatch Board" eyebrow="4 · Dispatcher" badge="governed">
      <ul className="space-y-2">
        {model.dispatchBoard.corridors.map((corridor) => (
          <li
            key={corridor.id}
            className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-3"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-white">{corridor.label}</p>
              <StateBadge value={corridor.mode} />
            </div>
            <p className="mt-1 text-xs leading-5 text-neutral-500">{corridor.note}</p>
            {corridor.action ? (
              <Link
                href={corridor.action.href as Route}
                className="mt-2 inline-flex min-h-9 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 text-xs font-bold text-emerald-300 transition hover:bg-emerald-500/20"
              >
                <Send className="mr-2 h-3.5 w-3.5" />
                {corridor.action.label}
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </TowerCard>
  );
}

function EvidenceFeedCard({ model }: { model: CommandTowerModel }) {
  const feed = model.evidenceFeed;
  return (
    <TowerCard title="Evidence Feed" eyebrow="5 · Preuve" badge={feed.state}>
      {feed.state === "unavailable" ? (
        <UnavailableNote what="Le ledger" />
      ) : feed.state === "empty" ? (
        <p className="text-sm text-neutral-500">
          Aucune preuve enregistrée pour l&apos;instant. Chaque action gouvernée écrira ici.
        </p>
      ) : (
        <ul className="space-y-2">
          {feed.items.map((item) => (
            <li
              key={item.id}
              className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-neutral-200">{item.summary}</p>
                <span className="shrink-0 text-[11px] text-neutral-500">
                  {formatLedgerActivityTimestamp(item.createdAt)}
                </span>
              </div>
              <p className="mt-1 text-xs text-neutral-500">
                {item.eventType ?? "non typé"}
                {item.agentId ? ` · ${item.agentId}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex items-center justify-between">
        <a href="#ledger-activity" className="text-xs font-semibold text-amber-300 hover:text-amber-200">
          Voir le ledger complet
        </a>
        {feed.source ? (
          <span className="text-[11px] text-neutral-600">
            source : {feed.source === "supabase" ? "Supabase" : "session locale"}
          </span>
        ) : null}
      </div>
    </TowerCard>
  );
}

function ApprovalRailCard({ model }: { model: CommandTowerModel }) {
  const rail = model.approvalRail;
  return (
    <TowerCard
      title="Approval Rail"
      eyebrow="6 · Approuver / Rejeter"
      badge={rail.state}
    >
      <p className="mb-3 text-xs text-neutral-500">
        Le seul endroit de la tour où un clic déclenche quelque chose : approuver ou rejeter un
        intent (transitions atomiques, preuve au ledger).
      </p>
      <ExecutionIntentReviewPanel agentId="hermes" />
    </TowerCard>
  );
}

function ParkingLotCard({ model }: { model: CommandTowerModel }) {
  return (
    <TowerCard title="Parking Lot" eyebrow="7 · Parké volontairement" badge="parked">
      <ul className="grid gap-2 md:grid-cols-2">
        {model.parkingLot.map((item) => (
          <li
            key={item.id}
            className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-900/40 p-3"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-neutral-300">{item.label}</p>
              <span className="text-[11px] text-neutral-600">{item.evidence}</span>
            </div>
            <p className="mt-1 text-xs leading-5 text-neutral-500">{item.reason}</p>
          </li>
        ))}
      </ul>
    </TowerCard>
  );
}

export async function CommandTower() {
  const context = getActiveWorkspaceContext();
  const inputs = await loadCommandTowerInputs(context.workspace.id);
  const model = buildCommandTowerModel(inputs);

  return (
    <section id="command-tower" className="scroll-mt-6 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-amber-400">
            <TowerControl className="h-4 w-4" />
            Oria · GOVERN
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-white">Command Tower v1</h2>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-neutral-500">
          <span className="inline-flex items-center gap-1 rounded-full border border-neutral-700 px-2 py-1">
            <Radar className="h-3 w-3" /> lecture seule
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-neutral-700 px-2 py-1">
            <ClipboardCheck className="h-3 w-3" /> approbation = seul déclencheur
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-neutral-700 px-2 py-1">
            <CircleSlash className="h-3 w-3" /> zéro runtime live
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-neutral-700 px-2 py-1">
            <ParkingSquare className="h-3 w-3" /> park assumé
          </span>
        </div>
      </div>

      <MissionBriefCard model={model} />

      <div className="grid gap-4 lg:grid-cols-2">
        <DecisionQueueCard model={model} />
        <RuntimeStatusCard model={model} />
        <DispatchBoardCard model={model} />
        <EvidenceFeedCard model={model} />
      </div>

      <ApprovalRailCard model={model} />
      <ParkingLotCard model={model} />
    </section>
  );
}
