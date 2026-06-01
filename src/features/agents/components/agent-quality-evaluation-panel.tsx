import { Gauge, ShieldCheck, Target, Timer } from "lucide-react";
import type { AgentQualityEvaluationModel, AgentQualityScorecard } from "../agent-quality-evaluation";

const READINESS_LABEL: Record<AgentQualityScorecard["readiness"], string> = {
  ready_to_measure: "ready",
  needs_evidence: "needs evidence",
  needs_knowledge_cleanup: "knowledge cleanup",
  blocked_until_unlock: "locked",
};

const READINESS_STYLE: Record<AgentQualityScorecard["readiness"], string> = {
  ready_to_measure: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  needs_evidence: "border-amber-500/20 bg-amber-500/10 text-amber-300",
  needs_knowledge_cleanup: "border-red-500/20 bg-red-500/10 text-red-300",
  blocked_until_unlock: "border-neutral-700 bg-neutral-900 text-neutral-500",
};

function formatMoney(cents: number | null): string {
  if (cents === null) return "baseline";
  return `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function formatMinutes(minutes: number | null): string {
  if (minutes === null) return "baseline";
  return `${minutes} min`;
}

function Scorecard({ scorecard }: { scorecard: AgentQualityScorecard }) {
  return (
    <article className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-white">{scorecard.agentName}</h3>
            <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[11px] text-neutral-400">
              {scorecard.role}
            </span>
          </div>
          <p className="mt-1 text-xs text-neutral-600">
            {scorecard.evidenceMode === "observed" ? "observed" : "baseline only"} · no execution authorized
          </p>
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${READINESS_STYLE[scorecard.readiness]}`}>
          {READINESS_LABEL[scorecard.readiness]}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Quality</p>
          <p className="mt-1 tabular-nums text-xl font-semibold text-white">
            {scorecard.overallQualityScore}
          </p>
        </div>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Profit</p>
          <p className="mt-1 text-xl font-semibold text-emerald-300">
            {formatMoney(scorecard.realizedProfitCents)}
          </p>
        </div>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">CEO load</p>
          <p className="mt-1 text-xl font-semibold text-amber-300">
            {formatMinutes(scorecard.ceoMinutesSaved)}
          </p>
        </div>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Guardrails</p>
          <p className="mt-1 text-xl font-semibold text-violet-300">
            {scorecard.guardrailViolations === null ? "baseline" : scorecard.guardrailViolations}
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-2 text-xs text-neutral-500">
        <p>{scorecard.dimensions.profitSignal.reason}</p>
        <p>{scorecard.dimensions.ceoLoadReduction.reason}</p>
        <p>{scorecard.dimensions.guardrailCompliance.reason}</p>
      </div>

      {scorecard.evidenceGaps.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {scorecard.evidenceGaps.map((gap) => (
            <li
              key={gap}
              className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 font-mono text-[11px] text-amber-300"
            >
              {gap}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

export function AgentQualityEvaluationPanel({ model }: { model: AgentQualityEvaluationModel }) {
  return (
    <section className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300">
            <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
            Agent Quality
          </div>
          <h2 className="mt-3 text-xl font-semibold text-white">
            Profit, CEO load, and guardrail scorecards
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
            Les scorecards connectent les knowledge packs aux resultats a mesurer. Sans observation,
            elles restent en baseline et ne declarent aucun profit reel.
          </p>
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-2 text-sm sm:grid-cols-4 lg:w-[31rem]">
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Score avg</p>
            <p className="mt-1 tabular-nums text-2xl font-semibold text-white">
              {model.summary.averageQualityScore}
            </p>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Observed</p>
            <p className="mt-1 tabular-nums text-2xl font-semibold text-emerald-300">
              {model.summary.observedScorecards}
            </p>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Profit</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-300">
              {formatMoney(model.summary.totalObservedProfitCents)}
            </p>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Execution</p>
            <p className="mt-2 text-xs font-medium text-red-300">not authorized</p>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {model.scorecards.map((scorecard) => (
          <Scorecard key={scorecard.agentId} scorecard={scorecard} />
        ))}
      </div>

      <div className="mt-4 grid gap-2 text-xs text-neutral-500 md:grid-cols-3">
        <p className="flex items-center gap-2">
          <Target className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
          Profit is only counted from observations, never invented from a blueprint.
        </p>
        <p className="flex items-center gap-2">
          <Timer className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
          CEO load reduction is tracked as observed minutes saved.
        </p>
        <p className="flex items-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5 text-violet-400" aria-hidden="true" />
          Guardrail compliance remains visible before any runtime autonomy.
        </p>
      </div>
    </section>
  );
}
