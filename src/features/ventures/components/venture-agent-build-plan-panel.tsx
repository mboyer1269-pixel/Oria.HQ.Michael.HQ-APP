import { Bot, BrainCircuit, Lock, ShieldCheck } from "lucide-react";
import type { VentureAgentBuildPlanSummary } from "../venture-agent-build-plans";

export function VentureAgentBuildPlanPanel({
  summary,
}: {
  summary: VentureAgentBuildPlanSummary;
}) {
  const plans = summary.plans.slice(0, 4);

  return (
    <section
      aria-label="Plans agents pour ventures"
      className="rounded-3xl border border-emerald-500/20 bg-neutral-950/60 p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">
            Plans agents
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            Blueprints d&apos;agents pour augmenter les chances de profit
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
            Un modèle de raisonnement approuvé peut recommander le rôle, les skills et les
            connaissances à préparer pour une venture. Cette section ne crée aucun agent et ne
            lance aucune exécution.
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1 text-[11px] font-medium text-neutral-300">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Blueprint only
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Ventures analysées
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-white">
            {summary.totalCount}
          </p>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Blueprints recommandés
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-white">
            {summary.recommendedCount}
          </p>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Lift élevé
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-white">
            {summary.highLiftCount}
          </p>
        </div>
      </div>

      {plans.length > 0 ? (
        <ol className="mt-5 grid gap-3">
          {plans.map((plan, index) => (
            <li
              key={plan.id}
              className={`rounded-2xl border p-4 ${
                plan.recommended
                  ? "border-emerald-500/30 bg-emerald-500/10"
                  : "border-neutral-800 bg-neutral-900/60"
              }`}
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-950 px-2.5 py-1 text-[11px] font-medium text-neutral-300">
                      <Bot className="h-3.5 w-3.5" aria-hidden="true" />
                      #{index + 1}
                    </span>
                    <span className="rounded-full border border-neutral-700 bg-neutral-950 px-2.5 py-1 text-[11px] font-medium text-neutral-200">
                      {plan.ventureName}
                    </span>
                    <span className="rounded-full border border-neutral-700 bg-neutral-950 px-2.5 py-1 text-[11px] font-medium text-neutral-300">
                      Lift: {plan.expectedProfitabilityLift}
                    </span>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-white">
                    {plan.proposedAgentRole}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-neutral-300">
                    {plan.recommendationReason}
                  </p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-950 px-3 py-1 text-xs text-neutral-300">
                  <Lock className="h-3.5 w-3.5 text-neutral-500" aria-hidden="true" />
                  No execution
                </span>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-neutral-800/80 bg-neutral-950/40 p-3">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                    <BrainCircuit className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
                    Skills à construire
                  </div>
                  <p className="mt-2 text-sm leading-6 text-neutral-300">
                    {plan.skillsToBuild.slice(0, 4).join(" · ")}
                  </p>
                </div>
                <div className="rounded-xl border border-neutral-800/80 bg-neutral-950/40 p-3">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
                    Connaissances à charger
                  </div>
                  <p className="mt-2 text-sm leading-6 text-neutral-300">
                    {plan.knowledgeToLoad.slice(0, 4).join(" · ")}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-neutral-800 bg-neutral-900/40 p-4 text-sm leading-6 text-neutral-400">
          Aucune venture sauvegardée à analyser. Les blueprints agents apparaîtront quand une
          candidate réelle sera sauvegardée.
        </div>
      )}
    </section>
  );
}
