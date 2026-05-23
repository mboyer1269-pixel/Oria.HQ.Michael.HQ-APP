import { Building2 } from "lucide-react";
import type { VentureProgress, VentureProgressStatus } from "../types";

const cad = new Intl.NumberFormat("fr-CA", {
  currency: "CAD",
  style: "currency",
  maximumFractionDigits: 0,
});

function fromCents(cents: number) {
  return cad.format(cents / 100);
}

const statusLabel: Record<VentureProgressStatus, string> = {
  on_track: "Sur la bonne voie",
  at_risk: "À risque",
  early: "Démarrage",
  blocked: "Bloqué",
};

const statusClass: Record<VentureProgressStatus, string> = {
  on_track: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  at_risk: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  early: "border-neutral-700 bg-neutral-900 text-neutral-400",
  blocked: "border-red-500/30 bg-red-500/10 text-red-300",
};

export function VentureProgressPanel({ ventures }: { ventures: VentureProgress[] }) {
  return (
    <section className="rounded-3xl border border-neutral-800 bg-neutral-950/70 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-400">Venture Progress</p>
          <h2 className="mt-2 text-xl font-semibold text-white">Progrès par entreprise</h2>
        </div>
        <Building2 className="h-6 w-6 text-amber-400" />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {ventures.map((venture) => {
          const progress =
            venture.mrrTargetCents > 0
              ? Math.min(100, Math.round((venture.mrrCurrentCents / venture.mrrTargetCents) * 100))
              : 0;

          return (
            <article key={venture.id} className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold text-white">{venture.name}</h3>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${statusClass[venture.status]}`}
                >
                  {statusLabel[venture.status]}
                </span>
              </div>

              <p className="mt-2 text-xs leading-5 text-neutral-400">{venture.summary}</p>

              <div className="mt-3">
                <div className="flex items-center justify-between text-[11px] text-neutral-500">
                  <span>MRR</span>
                  <span className="tabular-nums">
                    {fromCents(venture.mrrCurrentCents)} / {fromCents(venture.mrrTargetCents)}
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-neutral-800">
                  <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.max(2, progress)}%` }} />
                </div>
              </div>

              <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-amber-400/80">
                Prochaine action
              </p>
              <p className="mt-0.5 text-xs leading-5 text-neutral-400">{venture.nextAction}</p>

              <p className="mt-2 text-[11px] text-neutral-600">Risque : {venture.riskStatus}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
