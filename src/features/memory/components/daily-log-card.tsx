import type { DailyLog } from "../types";

const cad = new Intl.NumberFormat("fr-CA", {
  currency: "CAD",
  style: "currency",
  maximumFractionDigits: 2,
});

function fromCents(cents: number) {
  return cad.format(cents / 100);
}

export function DailyLogCard({ log }: { log: DailyLog }) {
  const net = log.moneyInCents - log.moneyOutCents;

  return (
    <article className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-white">{log.date}</h3>
        <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-[11px] text-neutral-400">
          Daily Log
        </span>
      </div>

      <p className="mt-2 text-sm leading-6 text-neutral-400">{log.summary}</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400/80">Mergé</p>
          <ul className="mt-1 space-y-1 text-xs leading-5 text-neutral-400">
            {log.mergedPrs.map((pr) => (
              <li key={pr}>✓ {pr}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-400/80">Décisions</p>
          <ul className="mt-1 space-y-1 text-xs leading-5 text-neutral-400">
            {log.decisions.map((decision) => (
              <li key={decision}>• {decision}</li>
            ))}
          </ul>
        </div>
      </div>

      {log.blockers.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-red-400/80">Bloqueurs</p>
          <ul className="mt-1 space-y-1 text-xs leading-5 text-neutral-400">
            {log.blockers.map((blocker) => (
              <li key={blocker}>⚠ {blocker}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-2.5">
          <p className="text-[10px] uppercase tracking-wide text-neutral-600">In</p>
          <p className="mt-0.5 text-sm font-semibold text-emerald-300">{fromCents(log.moneyInCents)}</p>
        </div>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-2.5">
          <p className="text-[10px] uppercase tracking-wide text-neutral-600">Out</p>
          <p className="mt-0.5 text-sm font-semibold text-neutral-300">{fromCents(log.moneyOutCents)}</p>
        </div>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-2.5">
          <p className="text-[10px] uppercase tracking-wide text-neutral-600">Net</p>
          <p className={`mt-0.5 text-sm font-semibold ${net >= 0 ? "text-emerald-300" : "text-red-300"}`}>
            {fromCents(net)}
          </p>
        </div>
      </div>

      <div className="mt-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-600">Prochaines actions</p>
        <ul className="mt-1 space-y-1 text-xs leading-5 text-neutral-400">
          {log.nextActions.map((action) => (
            <li key={action}>→ {action}</li>
          ))}
        </ul>
      </div>
    </article>
  );
}
