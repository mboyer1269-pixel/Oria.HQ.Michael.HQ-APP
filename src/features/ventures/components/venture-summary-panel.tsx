import { BarChart3, Info, ShieldCheck } from "lucide-react";
import type { VentureCockpit } from "../venture-cockpit";

type VentureSummaryPanelProps = {
  cockpit: VentureCockpit;
};

export function VentureSummaryPanel({ cockpit }: VentureSummaryPanelProps) {
  return (
    <section
      aria-label="Synthèse du Venture Engine"
      className="rounded-3xl border border-neutral-800 bg-neutral-950/70 p-5"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-400">
            Synthèse
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            Capacité actuelle du Venture Engine
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
            {cockpit.totalVentures} venture{cockpit.totalVentures !== 1 ? "s" : ""} visible
            au total, dont{" "}
            <span className="text-neutral-200">{cockpit.demoCount} démo</span>.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2">
          <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium text-emerald-300">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Human-on-the-Loop
          </span>
          <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1 text-[11px] font-medium text-neutral-300">
            <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
            {cockpit.activeValidationCount}/{cockpit.activeValidationSlotLimit} slots actifs
          </span>
        </div>
      </div>

      <dl className="mt-5 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Ventures sauvegardées
          </dt>
          <dd className="mt-2 flex items-baseline gap-2 text-white">
            <span className="text-2xl font-semibold tabular-nums">{cockpit.savedCount}</span>
            <span className="text-xs text-neutral-500">persistées</span>
          </dd>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Ventures scorées
          </dt>
          <dd className="mt-2 flex items-baseline gap-2 text-white">
            <span className="text-2xl font-semibold tabular-nums">{cockpit.scoredCount}</span>
            <span className="text-xs text-neutral-500">avec score</span>
          </dd>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Candidats non scorés
          </dt>
          <dd className="mt-2 flex items-baseline gap-2 text-white">
            <span className="text-2xl font-semibold tabular-nums">
              {cockpit.unscoredCandidateCount}
            </span>
            <span className="text-xs text-neutral-500">à scorer</span>
          </dd>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Slots de validation actifs
          </dt>
          <dd className="mt-2 flex items-baseline gap-2 text-white">
            <span className="text-2xl font-semibold tabular-nums">{cockpit.activeValidationCount}</span>
            <span className="text-xs text-neutral-500">
              / {cockpit.activeValidationSlotLimit} max
            </span>
          </dd>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Slots restants
          </dt>
          <dd className="mt-2 flex items-baseline gap-2 text-white">
            <span className="text-2xl font-semibold tabular-nums">
              {cockpit.activeValidationSlotsRemaining}
            </span>
            <span className="text-xs text-neutral-500">disponibles</span>
          </dd>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Ventures terminales
          </dt>
          <dd className="mt-2 flex items-baseline gap-2 text-white">
            <span className="text-2xl font-semibold tabular-nums">{cockpit.terminalCount}</span>
            <span className="text-xs text-neutral-500">archivées / tuées</span>
          </dd>
        </div>
      </dl>

      <div className="mt-5 border-t border-neutral-800/60 pt-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
          <Info className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
          Répartition des recommandations
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {(["go", "test_small", "hold", "kill"] as const).map((recommendation) => (
            <span
              key={recommendation}
              className="inline-flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1 text-xs text-neutral-300"
            >
              <span className="font-semibold uppercase tracking-[0.12em] text-neutral-500">
                {recommendation}
              </span>
              <span className="tabular-nums text-white">{cockpit.countsByRecommendation[recommendation]}</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
