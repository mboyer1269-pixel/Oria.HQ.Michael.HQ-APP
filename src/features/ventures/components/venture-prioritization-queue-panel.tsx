"use client";

import { AlertTriangle, Clock, Eye, Gauge, ShieldAlert } from "lucide-react";
import type { AgentVenturePrioritizationItem } from "../agent-venture-prioritization";

type VenturePrioritizationQueuePanelProps = {
  items: AgentVenturePrioritizationItem[];
};

const RISK_STYLES: Record<string, string> = {
  low: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  medium: "border-amber-500/20 bg-amber-500/10 text-amber-300",
  high: "border-orange-500/20 bg-orange-500/10 text-orange-300",
  critical: "border-red-500/20 bg-red-500/10 text-red-300",
};

const SEVERITY_STYLES: Record<string, string> = {
  clear: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  watch: "border-amber-500/20 bg-amber-500/10 text-amber-300",
  severe: "border-red-500/20 bg-red-500/10 text-red-300",
};

function formatCents(cents: number): string {
  const dollars = Math.round(cents / 100);
  return `$${dollars.toLocaleString("en-US")}`;
}

export function VenturePrioritizationQueuePanel({
  items,
}: VenturePrioritizationQueuePanelProps) {
  return (
    <section className="rounded-3xl border border-neutral-800 bg-neutral-950/80 p-5">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-neutral-400">
          <Eye className="h-4 w-4" aria-hidden="true" />
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em]">
            Revenue Prioritization Queue
          </h2>
        </div>
        <p className="text-sm leading-6 text-neutral-400">
          Local ranking only. No save, no execution, no spending, and no external action.
        </p>
      </div>

      <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/8 p-4">
        <p className="text-sm font-semibold leading-6 text-amber-200">
          This queue ranks local workbench items by revenue potential, speed to first dollar,
          validation cost, evidence, offer clarity, acquisition ease, estimated margin, blockers,
          and risk. Critical-risk items are surfaced as CEO review work, not validation execution.
        </p>
      </div>

      <div className="mt-5 flex flex-col gap-3">
        {items.map((item) => (
          <div
            key={item.workbenchItemId}
            className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex rounded-full border border-neutral-700 bg-neutral-950 px-2.5 py-1 text-xs font-semibold text-neutral-300">
                    Rank #{item.rank}
                  </span>
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
                      RISK_STYLES[item.riskLevel]
                    }`}
                  >
                    {item.riskLevel} risk
                  </span>
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
                      SEVERITY_STYLES[item.blockerSeverity]
                    }`}
                  >
                    {item.blockerSeverity} blockers
                  </span>
                </div>
                <h3 className="mt-3 text-lg font-semibold leading-7 text-white">
                  {item.opportunityTitle}
                </h3>
                <p className="mt-1 text-sm text-neutral-400">Prepared by {item.agentId}</p>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:min-w-80 lg:grid-cols-3">
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/70 px-3 py-2">
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                    <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
                    Profitability
                  </span>
                  <p className="mt-1 tabular-nums text-sm font-semibold text-white">
                    {item.profitabilityScore}/100
                  </p>
                </div>
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/70 px-3 py-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                    Expected revenue
                  </span>
                  <p className="mt-1 text-sm font-semibold text-white">
                    {formatCents(item.expectedRevenuePotentialCents)}
                  </p>
                </div>
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/70 px-3 py-2">
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    First dollar
                  </span>
                  <p className="mt-1 text-sm font-semibold text-white">
                    {item.speedToFirstDollarDays} days
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                  Recommendation
                </span>
                <p className="mt-1 text-sm font-semibold text-white">
                  {item.recommendation}
                </p>
                <p className="mt-2 text-sm leading-6 text-neutral-300">
                  {item.nextCeoDecision}
                </p>
              </div>

              <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                  Why it ranks here
                </span>
                <p className="mt-1 text-sm leading-6 text-neutral-300">
                  {item.whyRankedThere}
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                  Offer clarity
                </span>
                <p className="mt-1 tabular-nums text-sm font-semibold text-white">
                  {item.offerClarityScore}/100
                </p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                  Acquisition ease
                </span>
                <p className="mt-1 tabular-nums text-sm font-semibold text-white">
                  {item.acquisitionEaseScore}/100
                </p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                  Estimated margin
                </span>
                <p className="mt-1 tabular-nums text-sm font-semibold text-white">
                  {item.estimatedMarginScore}/100
                </p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                  Validation cost
                </span>
                <p className="mt-1 text-sm font-semibold text-white">
                  {formatCents(item.validationCostCents)}
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                  Revenue ranking note
                </span>
                <p className="mt-1 text-sm leading-6 text-neutral-300">
                  Higher profitability with faster first dollar, clearer offer, easier acquisition,
                  and better estimated margin pushes an item up the queue. Severe blockers keep it
                  visible but flagged.
                </p>
              </div>

              <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                  <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                  Blockers
                </span>
                {item.blockers.length === 0 ? (
                  <p className="mt-1 text-sm text-neutral-300">No active blockers.</p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {item.blockers.map((blocker) => (
                      <li key={blocker.blockerId} className="text-sm leading-6 text-neutral-300">
                        {blocker.label}: {blocker.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/8 px-3 py-2 text-xs text-red-400">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Runtime execution remains blocked. This queue is ranking only.
      </div>
    </section>
  );
}
