"use client";

import {
  AlertTriangle,
  CircleDollarSign,
  Clock,
  Eye,
  Lock,
  Package,
  ShieldAlert,
  Target,
} from "lucide-react";
import type { AgentVentureOfferDraft } from "../agent-venture-offer";

type VentureOfferBuilderPanelProps = {
  items: AgentVentureOfferDraft[];
};

const RISK_STYLES: Record<string, string> = {
  low: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  medium: "border-amber-500/20 bg-amber-500/10 text-amber-300",
  high: "border-orange-500/20 bg-orange-500/10 text-orange-300",
  critical: "border-red-500/20 bg-red-500/10 text-red-300",
};

const RECOMMENDATION_STYLES: Record<string, string> = {
  prioritize_for_validation: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  refine_offer: "border-sky-500/20 bg-sky-500/10 text-sky-300",
  reduce_validation_cost: "border-amber-500/20 bg-amber-500/10 text-amber-300",
  gather_more_evidence: "border-violet-500/20 bg-violet-500/10 text-violet-300",
  request_ceo_review: "border-orange-500/20 bg-orange-500/10 text-orange-300",
  reject_for_now: "border-red-500/20 bg-red-500/10 text-red-300",
};

function formatCents(cents: number): string {
  const dollars = Math.round(cents / 100);
  return `$${dollars.toLocaleString("en-US")}`;
}

export function VentureOfferBuilderPanel({
  items,
}: VentureOfferBuilderPanelProps) {
  return (
    <section className="rounded-3xl border border-neutral-800 bg-neutral-950/80 p-5">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-neutral-400">
          <Package className="h-4 w-4" aria-hidden="true" />
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em]">
            Venture Offer Builder
          </h2>
        </div>
        <p className="text-sm leading-6 text-neutral-400">
          Local offer drafts only. No save, no send, no publish, no spending, and no runtime
          execution.
        </p>
      </div>

      <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/8 p-4">
        <p className="text-sm font-semibold leading-6 text-amber-200">
          The builder turns a workbench item into a draft offer, price hypothesis, and buyer
          objection plan. It stays read-only and keeps runtime execution blocked.
        </p>
      </div>

      <div className="mt-5 flex flex-col gap-3">
        {items.map((item) => (
          <article
            key={item.workbenchItemId}
            className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex rounded-full border border-neutral-700 bg-neutral-950 px-2.5 py-1 text-xs font-semibold text-neutral-300">
                    {item.packageLabel}
                  </span>
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
                      RECOMMENDATION_STYLES[item.recommendation]
                    }`}
                  >
                    {item.recommendation.replace(/_/g, " ")}
                  </span>
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
                      RISK_STYLES[item.riskLevel]
                    }`}
                  >
                    {item.riskLevel} risk
                  </span>
                </div>
                <h3 className="mt-3 text-lg font-semibold leading-7 text-white">
                  {item.opportunityTitle}
                </h3>
                <p className="mt-1 text-sm text-neutral-400">Prepared by {item.agentId}</p>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:min-w-80 lg:grid-cols-2">
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/70 px-3 py-2">
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                    <CircleDollarSign className="h-3.5 w-3.5" aria-hidden="true" />
                    Price hypothesis
                  </span>
                  <p className="mt-1 text-sm font-semibold text-white">
                    {item.priceHypothesisLabel}
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
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/70 px-3 py-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                    Validation cost
                  </span>
                  <p className="mt-1 text-sm font-semibold text-white">
                    {formatCents(item.validationCostCents)}
                  </p>
                </div>
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/70 px-3 py-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                    Profitability
                  </span>
                  <p className="mt-1 tabular-nums text-sm font-semibold text-white">
                    {item.profitabilityScore}/100
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                  Offer promise
                </span>
                <p className="mt-1 text-sm leading-6 text-neutral-300">{item.offerPromise}</p>
                <p className="mt-2 text-sm leading-6 text-neutral-400">
                  <span className="font-semibold text-neutral-200">Target customer:</span>{" "}
                  {item.targetCustomer}
                </p>
                <p className="mt-1 text-sm leading-6 text-neutral-400">
                  <span className="font-semibold text-neutral-200">Pain:</span> {item.customerPain}
                </p>
              </div>

              <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                  Why buy now
                </span>
                <p className="mt-1 text-sm leading-6 text-neutral-300">{item.reasonToBuyNow}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                  Package
                </span>
                <p className="mt-1 text-sm font-semibold text-white">{item.packageLabel}</p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                  Main objection
                </span>
                <p className="mt-1 text-sm leading-6 text-neutral-300">{item.mainObjection}</p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                  Risk reduction
                </span>
                <p className="mt-1 text-sm leading-6 text-neutral-300">{item.riskReduction}</p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                  Next validation step
                </span>
                <p className="mt-1 text-sm leading-6 text-neutral-300">{item.nextValidationStep}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                  <Target className="h-3.5 w-3.5" aria-hidden="true" />
                  Package deliverables
                </span>
                <ul className="mt-2 space-y-1">
                  {item.packageDeliverables.map((deliverable) => (
                    <li key={deliverable} className="text-sm leading-6 text-neutral-300">
                      {deliverable}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                  <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                  Safety
                </span>
                <p className="mt-1 text-sm leading-6 text-neutral-300">
                  Read-only draft. No save, no send, no approval, no spend, and no execution.
                </p>
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/8 px-3 py-2 text-xs text-red-400">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Runtime execution remains blocked. This builder only drafts offers.
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900/60 px-3 py-2 text-xs text-neutral-400">
        <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Local workbench only. No persistence path is wired here.
        <Lock className="h-3.5 w-3.5 shrink-0 text-neutral-500" aria-hidden="true" />
      </div>
    </section>
  );
}
