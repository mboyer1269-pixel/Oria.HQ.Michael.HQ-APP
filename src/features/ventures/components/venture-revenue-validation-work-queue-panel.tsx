"use client";

import {
  AlertTriangle,
  ClipboardList,
  Eye,
  Lock,
  ShieldAlert,
  Target,
  Users,
} from "lucide-react";
import type { AgentRevenueValidationWorkQueueItem } from "../agent-revenue-validation-work-queue";

type VentureRevenueValidationWorkQueuePanelProps = {
  items: AgentRevenueValidationWorkQueueItem[];
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

function TaskCard({
  role,
  task,
  expectedOutput,
}: {
  role: string;
  task: string;
  expectedOutput: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-[11px] font-semibold text-neutral-300">
          {role}
        </span>
      </div>
      <p className="mt-2 text-sm leading-6 text-neutral-300">{task}</p>
      <p className="mt-2 text-xs leading-5 text-neutral-500">
        <span className="font-semibold text-neutral-400">Expected output:</span> {expectedOutput}
      </p>
    </div>
  );
}

export function VentureRevenueValidationWorkQueuePanel({
  items,
}: VentureRevenueValidationWorkQueuePanelProps) {
  return (
    <section className="rounded-3xl border border-neutral-800 bg-neutral-950/80 p-5">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-neutral-400">
          <ClipboardList className="h-4 w-4" aria-hidden="true" />
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em]">
            Revenue Validation Agent Work Queue
          </h2>
        </div>
        <p className="text-sm leading-6 text-neutral-400">
          Local work assignments only. No send, no publish, no CRM writes, and no runtime
          execution.
        </p>
      </div>

      <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/8 p-4">
        <p className="text-sm font-semibold leading-6 text-amber-200">
          The queue turns validation planning into draft agent work: Research Agent, Offer Agent,
          Sales Agent, Ops Agent, and Finance Agent each get a clear local task without any
          external side effect.
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
                      RECOMMENDATION_STYLES[item.recommendation]
                    }`}
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
                    Channel
                  </span>
                  <p className="mt-1 text-sm font-semibold text-white">{item.validationChannel}</p>
                </div>
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/70 px-3 py-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                    Duration
                  </span>
                  <p className="mt-1 text-sm font-semibold text-white">{item.durationDays} days</p>
                </div>
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/70 px-3 py-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                    Budget cap
                  </span>
                  <p className="mt-1 text-sm font-semibold text-white">
                    {formatCents(item.budgetCapCents)}
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
                  Why this queue item
                </span>
                <p className="mt-1 text-sm leading-6 text-neutral-300">{item.priorityReason}</p>
                <p className="mt-2 text-sm leading-6 text-neutral-400">
                  <span className="font-semibold text-neutral-200">Next CEO decision:</span>{" "}
                  {item.nextCeoDecision}
                </p>
              </div>

              <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                  Handoff order
                </span>
                <p className="mt-1 text-sm leading-6 text-neutral-300">
                  {item.handoffSequence.join(" → ")}
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {item.workTasks.map((task) => (
                <TaskCard
                  key={`${item.workbenchItemId}-${task.role}`}
                  role={task.role}
                  task={task.task}
                  expectedOutput={task.expectedOutput}
                />
              ))}
            </div>

            <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/8 px-3 py-2 text-xs text-red-400">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Runtime execution remains blocked. This queue is draft-only.
            </div>
          </article>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900/60 px-3 py-2 text-xs text-neutral-400">
        <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Local work assignments only. No send, no publish, no CRM writes.
        <Lock className="h-3.5 w-3.5 shrink-0 text-neutral-500" aria-hidden="true" />
        <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-neutral-500" aria-hidden="true" />
        <Target className="h-3.5 w-3.5 shrink-0 text-neutral-500" aria-hidden="true" />
      </div>
    </section>
  );
}
