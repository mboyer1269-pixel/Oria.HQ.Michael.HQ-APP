import { BadgeDollarSign, TrendingDown, TrendingUp } from "lucide-react";
import type { Moneyboard } from "../types";

const cad = new Intl.NumberFormat("fr-CA", {
  currency: "CAD",
  style: "currency",
  maximumFractionDigits: 2,
});

function fromCents(cents: number) {
  return cad.format(cents / 100);
}

export function MoneyboardPanel({ data }: { data: Moneyboard }) {
  const net = data.moneyInCents - data.moneyOutCents;

  return (
    <section className="rounded-3xl border border-neutral-800 bg-neutral-950/70 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-400">Moneyboard</p>
          <h2 className="mt-2 text-xl font-semibold text-white">Argent in / argent out</h2>
        </div>
        <BadgeDollarSign className="h-6 w-6 text-emerald-400" />
      </div>
      <p className="mt-1 text-xs text-neutral-500">{data.periodLabel} · données illustratives</p>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-emerald-500">
            <TrendingUp className="h-3.5 w-3.5" />
            In
          </p>
          <p className="mt-2 text-2xl font-bold text-emerald-300">{fromCents(data.moneyInCents)}</p>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
          <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-neutral-500">
            <TrendingDown className="h-3.5 w-3.5" />
            Out
          </p>
          <p className="mt-2 text-2xl font-bold text-white">{fromCents(data.moneyOutCents)}</p>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
          <p className="text-xs uppercase tracking-wide text-neutral-500">Net</p>
          <p className={`mt-2 text-2xl font-bold ${net >= 0 ? "text-emerald-300" : "text-red-300"}`}>
            {fromCents(net)}
          </p>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
          <p className="text-xs uppercase tracking-wide text-neutral-500">Pipeline estimé</p>
          <p className="mt-2 text-2xl font-bold text-amber-300">{fromCents(data.pipelineEstimatedCents)}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400/80">Détail in</p>
          <ul className="mt-2 space-y-1.5 text-sm text-neutral-400">
            {data.inBreakdown.map((item) => (
              <li key={item.label} className="flex items-center justify-between gap-3">
                <span>{item.label}</span>
                <span className="tabular-nums text-neutral-300">{fromCents(item.amountCents)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Détail out</p>
          <ul className="mt-2 space-y-1.5 text-sm text-neutral-400">
            {data.outBreakdown.map((item) => (
              <li key={item.label} className="flex items-center justify-between gap-3">
                <span>{item.label}</span>
                <span className="tabular-nums text-neutral-300">{fromCents(item.amountCents)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="mt-3 text-[11px] text-neutral-600">
        Coût IA / runtime estimé : {fromCents(data.aiRuntimeCostCents)} sur la période.
      </p>
    </section>
  );
}
