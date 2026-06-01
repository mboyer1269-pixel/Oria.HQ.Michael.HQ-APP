import Link from "next/link";
import type { Route } from "next";
import { AlertTriangle, CheckCircle2, Clock, Eye, ShieldOff } from "lucide-react";
import type {
  AgentReviewPriority,
  AgentReviewQueue,
  AgentReviewQueueItem,
} from "@/features/agents/agent-review-queue";
import { Card, Eyebrow, Tag, Tooltip } from "./ui";

// ---------------------------------------------------------------------------
// Cockpit review queue — read-only surface over the REAL review signal.
// No approvals, autonomy changes, or runtime execution happen here. Every item
// is advisory and requires an explicit human decision.
// ---------------------------------------------------------------------------

const PRIORITY_TONE: Record<AgentReviewPriority, "critical" | "high" | "medium" | "low"> = {
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "low",
};

const DECISION_LABEL: Record<string, string> = {
  reduce_autonomy_recommendation: "Réduire l'autonomie",
  block_autonomy_increase: "Bloquer l'expansion",
  improve_knowledge_pack: "Améliorer le knowledge pack",
  require_more_observations: "Plus d'observations requises",
  eligible_for_controlled_expansion: "Éligible — expansion contrôlée",
  continue_monitoring: "Continuer la surveillance",
};

function PriorityIcon({ priority }: { priority: AgentReviewPriority }) {
  if (priority === "critical" || priority === "high") {
    return <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
  }
  if (priority === "medium") return <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
  return <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
}

function QueueItem({ item }: { item: AgentReviewQueueItem }) {
  return (
    <article className="rounded-xl border border-white/[0.07] bg-[#1c223a]/55 p-4 transition hover:border-violet-500/40">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-[#eff1fb]">{item.agentId}</span>
            <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 font-mono text-[11px] text-[#646c8e]">
              {item.outcomeId}
            </span>
          </div>
          <p className="mt-1 text-sm text-[#98a1c4]">
            {DECISION_LABEL[item.decision] ?? item.decision}
          </p>
        </div>
        <Tag tone={PRIORITY_TONE[item.priority]}>
          <PriorityIcon priority={item.priority} />
          {item.priority}
        </Tag>
      </div>

      <p className="mt-3 text-xs leading-5 text-[#98a1c4]">{item.executiveSummary}</p>

      {item.riskFlags.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Risk flags">
          {item.riskFlags.map((flag) => (
            <li
              key={flag}
              className="rounded-full border border-rose-500/20 bg-rose-500/[0.08] px-2 py-0.5 font-mono text-[11px] text-rose-300"
            >
              {flag}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-[#646c8e]">
        <span>
          next: <span className="text-[#98a1c4]">{item.nextAction.replace(/_/g, " ")}</span>
        </span>
        <span>·</span>
        <span>{item.status.replace(/_/g, " ")}</span>
        <span>·</span>
        <Tooltip
          title="Approbation requise"
          detail="Aucune action ne procède sans décision humaine explicite, puis une entrée ledger avant toute exécution."
          align="left"
        >
          <span className="cursor-help text-violet-300 underline-offset-2 hover:underline">
            approbation requise
          </span>
        </Tooltip>
      </div>
    </article>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-[#646c8e]">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

export function CockpitReviewQueue({ queue }: { queue: AgentReviewQueue }) {
  const empty = queue.items.length === 0;

  return (
    <Card>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <Eyebrow>Décisions humaines · signal réel</Eyebrow>
          <h2 className="mt-1.5 flex items-center gap-2 text-[17px] font-bold text-[#eff1fb]">
            <Eye className="h-4 w-4 text-violet-300" aria-hidden="true" />
            File de revue des agents
          </h2>
          <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[#98a1c4]">
            Items priorisés, dérivés des évaluations de qualité et des recommandations de
            gouvernance. Revue humaine requise avant toute décision d&apos;autonomie.
          </p>
        </div>
        <div className="grid shrink-0 grid-cols-4 gap-2 lg:w-72">
          <Stat label="Total" value={queue.totalItems} tone="text-[#eff1fb]" />
          <Stat label="Crit" value={queue.criticalItems} tone="text-rose-300" />
          <Stat label="Élevé" value={queue.highItems} tone="text-orange-300" />
          <Stat label="Moyen" value={queue.mediumItems} tone="text-amber-300" />
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
        <ShieldOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#646c8e]" aria-hidden="true" />
        <p className="text-xs leading-5 text-[#646c8e]">
          <span className="font-semibold text-[#98a1c4]">File en lecture seule.</span> Aucune
          approbation, changement d&apos;autonomie ou exécution n&apos;est effectué depuis cette vue.
          Tout item est consultatif et requiert une décision humaine explicite.
        </p>
      </div>

      <div className="mt-5">
        {empty ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-black/10 px-4 py-10 text-center">
            <p className="text-sm font-semibold text-[#eff1fb]">Aucun item à revoir pour l&apos;instant.</p>
            <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-6 text-[#646c8e]">
              Quand tes agents produiront des outcomes observés, les recommandations apparaîtront ici,
              priorisées. En attendant, tu peux demander à Joris d&apos;évaluer un agent.
            </p>
            <Link
              href={"/hq/agents" as Route}
              className="mt-4 inline-flex min-h-10 items-center justify-center rounded-lg border border-violet-500/40 bg-violet-500/10 px-4 text-sm font-semibold text-violet-200 transition hover:bg-violet-500/20"
            >
              Ouvrir la gouvernance des agents
            </Link>
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {queue.items.map((item) => (
              <QueueItem key={item.queueItemId} item={item} />
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
