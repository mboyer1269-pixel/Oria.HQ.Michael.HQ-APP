import { Info, ShieldCheck } from "lucide-react";
import {
  getDefaultActiveValidationSlotLimit,
  getDefaultVisibleCandidateLimit,
  isActiveVentureStatus,
} from "../lifecycle";
import type { VentureCard } from "../types";

type VentureSummaryPanelProps = {
  cards: VentureCard[];
};

export function VentureSummaryPanel({ cards }: VentureSummaryPanelProps) {
  const candidateLimit = getDefaultVisibleCandidateLimit();
  const validationSlotLimit = getDefaultActiveValidationSlotLimit();
  const totalCandidates = cards.length;
  const activeValidationSlotsUsed = cards.filter((c) => isActiveVentureStatus(c.status)).length;

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
            Le Venture Engine garde une capacité visible volontairement étroite : le CEO doit voir,
            décider et arbitrer chaque promotion sans surcharge cognitive.
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium text-emerald-300">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Human-on-the-Loop
        </span>
      </div>

      <dl className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Candidats visibles
          </dt>
          <dd className="mt-2 flex items-baseline gap-2 text-white">
            <span className="text-2xl font-semibold tabular-nums">{totalCandidates}</span>
            <span className="text-xs text-neutral-500">
              / {candidateLimit} max
            </span>
          </dd>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Slots de validation actifs
          </dt>
          <dd className="mt-2 flex items-baseline gap-2 text-white">
            <span className="text-2xl font-semibold tabular-nums">
              {activeValidationSlotsUsed}
            </span>
            <span className="text-xs text-neutral-500">
              / {validationSlotLimit} max
            </span>
          </dd>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Capacité restante
          </dt>
          <dd className="mt-2 flex items-baseline gap-2 text-white">
            <span className="text-2xl font-semibold tabular-nums">
              {Math.max(0, validationSlotLimit - activeValidationSlotsUsed)}
            </span>
            <span className="text-xs text-neutral-500">
              slot{Math.max(0, validationSlotLimit - activeValidationSlotsUsed) === 1
                ? ""
                : "s"}{" "}
              disponible{Math.max(0, validationSlotLimit - activeValidationSlotsUsed) === 1
                ? ""
                : "s"}
            </span>
          </dd>
        </div>
      </dl>

      <ul className="mt-5 space-y-2 border-t border-neutral-800/60 pt-4 text-xs leading-5 text-neutral-400">
        <li className="flex items-start gap-2">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden="true" />
          Les ventures générées par les agents restent des candidats jusqu&apos;à approbation CEO.
        </li>
        <li className="flex items-start gap-2">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden="true" />
          Les actions risquées restent sous porte d&apos;approbation.
        </li>
      </ul>
    </section>
  );
}
