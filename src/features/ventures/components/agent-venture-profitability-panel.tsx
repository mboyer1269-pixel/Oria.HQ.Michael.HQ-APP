"use client";

// src/features/ventures/components/agent-venture-profitability-panel.tsx
//
// Read-only profitability decision-support panel. It displays computed local
// estimates only; it does not save, approve, execute, or call external systems.

import {
  AlertTriangle,
  BarChart3,
  CircleDollarSign,
  Clock,
  Gauge,
  Lock,
  ShieldAlert,
  Target,
  Zap,
} from "lucide-react";
import type {
  AgentVentureProfitabilityRecommendation,
  AgentVentureProfitabilityScore,
} from "../agent-venture-profitability";

type AgentVentureProfitabilityPanelProps = {
  score: AgentVentureProfitabilityScore;
  estimatedRevenuePotentialCents: number;
  estimatedValidationCostCents: number;
  speedToFirstDollarDays: number;
  confidenceScore: number;
  automationPotentialScore: number;
};

const RECOMMENDATION_LABELS: Record<AgentVentureProfitabilityRecommendation, string> = {
  prioritize_for_validation: "Prioritize for validation",
  refine_offer: "Refine offer",
  reduce_validation_cost: "Reduce validation cost",
  gather_more_evidence: "Gather more evidence",
  request_ceo_review: "Request CEO review",
  reject_for_now: "Reject for now",
};

const RECOMMENDATION_STYLES: Record<AgentVentureProfitabilityRecommendation, string> = {
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

function ScoreMetric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-3 py-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
        {label}
      </span>
      <p className="mt-1 tabular-nums text-sm font-semibold text-white">{value}/100</p>
    </div>
  );
}

export function AgentVentureProfitabilityPanel({
  score,
  estimatedRevenuePotentialCents,
  estimatedValidationCostCents,
  speedToFirstDollarDays,
  confidenceScore,
  automationPotentialScore,
}: AgentVentureProfitabilityPanelProps) {
  return (
    <section className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="text-neutral-500">
          <CircleDollarSign className="h-4 w-4" aria-hidden="true" />
        </span>
        <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
          Profitability Decision Support
        </h3>
      </div>

      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/8 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-semibold leading-6 text-amber-200">
                This profitability score is a decision-support estimate, not a financial guarantee.
                This view does not save, approve, execute, spend money, send messages, publish, or
                write to external systems.
              </p>
              <p className="text-xs leading-5 text-amber-300/80">
                Agents can prepare venture work, but runtime execution remains blocked until future
                approval, ledger, and bounded execution controls exist.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-2 text-sm text-neutral-300">
              <Gauge className="h-4 w-4 text-neutral-500" aria-hidden="true" />
              <span className="font-semibold uppercase tracking-[0.12em] text-neutral-500">
                Profitability
              </span>
              <span className="tabular-nums text-2xl font-bold text-white">
                {score.profitabilityScore}
                <span className="text-xs font-normal text-neutral-500">/100</span>
              </span>
            </span>
            <span
              className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
                RECOMMENDATION_STYLES[score.recommendation]
              }`}
            >
              {RECOMMENDATION_LABELS[score.recommendation]}
            </span>
          </div>
          <span className="text-xs text-neutral-500">
            {score.blockerCount} blocker{score.blockerCount === 1 ? "" : "s"}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-3 py-2">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
              <CircleDollarSign className="h-3.5 w-3.5" aria-hidden="true" />
              Revenue potential
            </span>
            <p className="mt-1 text-sm font-semibold text-white">
              {formatCents(estimatedRevenuePotentialCents)}/yr
            </p>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-3 py-2">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
              <Target className="h-3.5 w-3.5" aria-hidden="true" />
              Validation cost
            </span>
            <p className="mt-1 text-sm font-semibold text-white">
              {formatCents(estimatedValidationCostCents)}
            </p>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-3 py-2">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              Speed to first dollar
            </span>
            <p className="mt-1 text-sm font-semibold text-white">
              {speedToFirstDollarDays} days
            </p>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-3 py-2">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
              <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
              Confidence
            </span>
            <p className="mt-1 text-sm font-semibold text-white">{confidenceScore}/100</p>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-3 py-2">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
              <Zap className="h-3.5 w-3.5" aria-hidden="true" />
              Automation leverage
            </span>
            <p className="mt-1 text-sm font-semibold text-white">{automationPotentialScore}/100</p>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-3 py-2">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
              <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
              Risk penalty
            </span>
            <p className="mt-1 tabular-nums text-sm font-semibold text-red-300">
              -{score.riskPenalty}
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ScoreMetric label="Revenue" value={score.revenuePotentialScore} />
          <ScoreMetric label="Cost efficiency" value={score.costEfficiencyScore} />
          <ScoreMetric label="Speed" value={score.speedScore} />
          <ScoreMetric label="Evidence" value={score.evidenceStrengthScore} />
          <ScoreMetric label="Confidence" value={score.confidenceScore} />
          <ScoreMetric label="Automation" value={score.automationLeverageScore} />
          <ScoreMetric label="Readiness" value={score.readinessContributionScore} />
          <ScoreMetric label="KPI quality" value={score.kpiQualityScore} />
        </div>

        {score.blockers.length > 0 && (
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
              Blockers
            </span>
            <ul className="mt-2 space-y-2">
              {score.blockers.map((blocker) => (
                <li
                  key={blocker.blockerId}
                  className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-3 py-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-white">{blocker.label}</span>
                    <span className="rounded-full border border-neutral-700 bg-neutral-950 px-2 py-0.5 text-[11px] uppercase tracking-[0.12em] text-neutral-400">
                      {blocker.severity}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-neutral-400">{blocker.reason}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
            Rationale
          </span>
          <p className="mt-1 text-sm leading-6 text-neutral-300">{score.rationale}</p>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
            Next CEO decision
          </span>
          <p className="mt-1 text-sm font-semibold leading-6 text-white">{score.nextCeoDecision}</p>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/8 px-3 py-2 text-xs text-red-400">
          <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Runtime execution remains blocked.
        </div>
      </div>
    </section>
  );
}
