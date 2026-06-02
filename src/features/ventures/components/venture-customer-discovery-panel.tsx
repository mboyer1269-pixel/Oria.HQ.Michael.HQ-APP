"use client";

import {
  AlertTriangle,
  Eye,
  Lock,
  Search,
  ShieldAlert,
  Users,
} from "lucide-react";
import type { AgentVentureDiscoveryTarget } from "../agent-customer-discovery-target-list";

type VentureCustomerDiscoveryPanelProps = {
  items: AgentVentureDiscoveryTarget[];
};

const RISK_STYLES: Record<string, string> = {
  low: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  medium: "border-amber-500/20 bg-amber-500/10 text-amber-300",
  high: "border-orange-500/20 bg-orange-500/10 text-orange-300",
  critical: "border-red-500/20 bg-red-500/10 text-red-300",
};

const BLOCKER_STYLES: Record<string, string> = {
  clear: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  watch: "border-amber-500/20 bg-amber-500/10 text-amber-300",
  severe: "border-red-500/20 bg-red-500/10 text-red-300",
};

function DiscoveryList({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
        {title}
      </span>
      <ul className="mt-2 space-y-1">
        {items.map((item) => (
          <li key={item} className="text-sm leading-6 text-neutral-300">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function VentureCustomerDiscoveryPanel({
  items,
}: VentureCustomerDiscoveryPanelProps) {
  return (
    <section className="rounded-3xl border border-neutral-800 bg-neutral-950/80 p-5">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-neutral-400">
          <Search className="h-4 w-4" aria-hidden="true" />
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em]">
            Customer Discovery Target List
          </h2>
        </div>
        <p className="text-sm leading-6 text-neutral-400">
          Local discovery targets only. No email, no scraping, no CRM writes, and no external
          contact is performed.
        </p>
      </div>

      <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/8 p-4">
        <p className="text-sm font-semibold leading-6 text-amber-200">
          This list helps the CEO see who to study, who to qualify, and what questions to ask next.
          It stays read-only and keeps runtime execution blocked.
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
                    Rank #{item.rank}
                  </span>
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
                      BLOCKER_STYLES[item.blockerSeverity]
                    }`}
                  >
                    {item.blockerSeverity} blockers
                  </span>
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${RISK_STYLES[item.riskLevel]}`}
                  >
                    {item.recommendation.replace(/_/g, " ")}
                  </span>
                </div>
                <h3 className="mt-3 text-lg font-semibold leading-7 text-white">
                  {item.opportunityTitle}
                </h3>
                <p className="mt-1 text-sm text-neutral-400">Target customer: {item.targetCustomer}</p>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:min-w-80 lg:grid-cols-2">
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/70 px-3 py-2">
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                    <Users className="h-3.5 w-3.5" aria-hidden="true" />
                    ICP
                  </span>
                  <p className="mt-1 text-sm font-semibold text-white">{item.icp}</p>
                </div>
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/70 px-3 py-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                    Persona
                  </span>
                  <p className="mt-1 text-sm font-semibold text-white">{item.persona}</p>
                </div>
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/70 px-3 py-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                    Discovery channel
                  </span>
                  <p className="mt-1 text-sm font-semibold text-white">{item.discoveryChannel}</p>
                </div>
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/70 px-3 py-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                    CEO decision
                  </span>
                  <p className="mt-1 text-sm font-semibold text-white">{item.nextCeoDecision}</p>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                  Why relevant
                </span>
                <p className="mt-1 text-sm leading-6 text-neutral-300">{item.whyRelevant}</p>
                <p className="mt-2 text-sm leading-6 text-neutral-400">
                  <span className="font-semibold text-neutral-200">Next discovery step:</span>{" "}
                  {item.nextDiscoveryStep}
                </p>
                <p className="mt-1 text-sm leading-6 text-neutral-400">
                  <span className="font-semibold text-neutral-200">Priority note:</span>{" "}
                  {item.priorityReason}
                </p>
              </div>

              <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                  What to ask
                </span>
                <p className="mt-1 text-sm leading-6 text-neutral-300">
                  Use the following questions to qualify interest and urgency.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <DiscoveryList title="Qualification criteria" items={item.qualificationCriteria} />
              <DiscoveryList title="Discovery questions" items={item.discoveryQuestions} />
              <DiscoveryList title="Buying signals" items={item.buyingSignals} />
            </div>

            <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/8 px-3 py-2 text-xs text-red-400">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Runtime execution remains blocked. This list is for study and qualification only.
            </div>
          </article>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900/60 px-3 py-2 text-xs text-neutral-400">
        <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Local discovery target list only. No CRM, no scrape, no contact automation.
        <Lock className="h-3.5 w-3.5 shrink-0 text-neutral-500" aria-hidden="true" />
        <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-neutral-500" aria-hidden="true" />
      </div>
    </section>
  );
}
