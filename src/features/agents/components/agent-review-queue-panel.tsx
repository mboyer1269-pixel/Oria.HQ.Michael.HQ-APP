import { AlertTriangle, CheckCircle, Clock, Eye, ShieldOff } from "lucide-react";
import type { AgentReviewPriority, AgentReviewQueue, AgentReviewQueueItem } from "../agent-review-queue";

// ---------------------------------------------------------------------------
// Agent Review Queue panel — read-only cockpit surface.
// Displays locally computed review items. No approvals, autonomy changes,
// or runtime execution are performed from this view.
// ---------------------------------------------------------------------------

const PRIORITY_BADGE: Record<
  AgentReviewPriority,
  { label: string; className: string }
> = {
  critical: {
    label: "critical",
    className: "border-red-500/30 bg-red-500/10 text-red-300",
  },
  high: {
    label: "high",
    className: "border-orange-500/30 bg-orange-500/10 text-orange-300",
  },
  medium: {
    label: "medium",
    className: "border-amber-500/20 bg-amber-500/10 text-amber-300",
  },
  low: {
    label: "low",
    className: "border-neutral-700 bg-neutral-900 text-neutral-500",
  },
};

const PRIORITY_BORDER: Record<AgentReviewPriority, string> = {
  critical: "border-red-500/25",
  high: "border-orange-500/20",
  medium: "border-amber-500/15",
  low: "border-neutral-800",
};

const DECISION_LABEL: Record<string, string> = {
  reduce_autonomy_recommendation: "Reduce autonomy",
  block_autonomy_increase: "Block expansion",
  improve_knowledge_pack: "Improve knowledge pack",
  require_more_observations: "More observations needed",
  eligible_for_controlled_expansion: "Eligible — controlled expansion",
  continue_monitoring: "Continue monitoring",
};

function PriorityIcon({ priority }: { priority: AgentReviewPriority }) {
  if (priority === "critical" || priority === "high") {
    return <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
  }
  if (priority === "medium") {
    return <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
  }
  return <CheckCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
}

function QueueItem({ item }: { item: AgentReviewQueueItem }) {
  const badge = PRIORITY_BADGE[item.priority];
  const borderColor = PRIORITY_BORDER[item.priority];

  return (
    <article
      className={`rounded-xl border ${borderColor} bg-neutral-950/60 p-4`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-white">{item.agentId}</span>
            <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 font-mono text-[11px] text-neutral-500">
              {item.outcomeId}
            </span>
          </div>
          <p className="mt-1 text-sm text-neutral-300">
            {DECISION_LABEL[item.decision] ?? item.decision}
          </p>
        </div>

        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${badge.className}`}
        >
          <PriorityIcon priority={item.priority} />
          {badge.label}
        </span>
      </div>

      <p className="mt-3 text-xs leading-5 text-neutral-400">{item.executiveSummary}</p>

      {item.riskFlags.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Risk flags">
          {item.riskFlags.map((flag) => (
            <li
              key={flag}
              className="rounded-full border border-red-500/20 bg-red-500/8 px-2 py-0.5 font-mono text-[11px] text-red-400"
            >
              {flag}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-neutral-600">
        <span>
          next:{" "}
          <span className="text-neutral-400">{item.nextAction.replace(/_/g, " ")}</span>
        </span>
        <span>·</span>
        <span className="text-neutral-600">{item.status.replace(/_/g, " ")}</span>
        <span>·</span>
        <span className="text-neutral-600">approval required</span>
      </div>
    </article>
  );
}

export function AgentReviewQueuePanel({ queue }: { queue: AgentReviewQueue }) {
  return (
    <section className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-5">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-300">
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            Review Queue
          </div>
          <h2 className="mt-3 text-xl font-semibold text-white">
            Agent review queue
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
            Prioritized items derived from local quality evaluations and governance
            recommendations. Human review is required before any autonomy decision.
          </p>
        </div>

        {/* Summary counts */}
        <div className="grid shrink-0 grid-cols-4 gap-2 text-sm lg:w-72">
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Total</p>
            <p className="mt-1 tabular-nums text-2xl font-semibold text-white">
              {queue.totalItems}
            </p>
          </div>
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-red-500">Crit</p>
            <p className="mt-1 tabular-nums text-2xl font-semibold text-red-300">
              {queue.criticalItems}
            </p>
          </div>
          <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-orange-500">High</p>
            <p className="mt-1 tabular-nums text-2xl font-semibold text-orange-300">
              {queue.highItems}
            </p>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Med</p>
            <p className="mt-1 tabular-nums text-2xl font-semibold text-amber-300">
              {queue.mediumItems}
            </p>
          </div>
        </div>
      </div>

      {/* Safety banner */}
      <div className="mt-4 flex items-start gap-2 rounded-xl border border-neutral-800 bg-neutral-900/50 px-4 py-3">
        <ShieldOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-500" aria-hidden="true" />
        <p className="text-xs leading-5 text-neutral-500">
          <span className="font-medium text-neutral-400">Read-only review queue.</span>{" "}
          No approvals, autonomy changes, or runtime execution are performed from this view.
          All items are advisory only and require explicit human decision.
        </p>
      </div>

      {/* Items */}
      <div className="mt-5">
        {queue.items.length === 0 ? (
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 px-4 py-8 text-center">
            <p className="text-sm text-neutral-500">
              No agent review items are currently queued.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {queue.items.map((item) => (
              <QueueItem key={item.queueItemId} item={item} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
