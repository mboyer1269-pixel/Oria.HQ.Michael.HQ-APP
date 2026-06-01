import { AlertCircle, Gauge, ListTodo, ShieldCheck } from "lucide-react";
import type { VentureDecisionQueueItem } from "../venture-cockpit";

export function VentureDecisionQueue({
  items,
}: {
  items: VentureDecisionQueueItem[];
}) {
  return (
    <section
      aria-label="File de décisions CEO"
      className="rounded-3xl border border-neutral-800 bg-neutral-950/70 p-5"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-400">
            File de décisions CEO
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            Prochaine décision recommandée et priorités
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
            Cette file reste informative. Elle classe les ventures sauvegardées par besoin
            d&apos;attention sans déclencher d&apos;action.
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1 text-[11px] font-medium text-neutral-300">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Lecture seule
        </span>
      </div>

      {items.length > 0 ? (
        <ol className="mt-5 grid gap-3">
          {items.map((item, index) => (
            <li
              key={item.id}
              className={`rounded-2xl border p-4 ${
                index === 0
                  ? "border-amber-500/30 bg-amber-500/10"
                  : "border-neutral-800 bg-neutral-900/60"
              }`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-950 px-2.5 py-1 text-[11px] font-medium text-neutral-300">
                      <ListTodo className="h-3.5 w-3.5" aria-hidden="true" />
                      #{index + 1}
                    </span>
                    <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-[11px] font-medium text-neutral-300">
                      {item.name}
                    </span>
                    <span className="rounded-full border border-neutral-800 bg-neutral-950 px-2.5 py-1 text-[11px] font-medium text-neutral-500">
                      Statut: {item.status}
                    </span>
                    {item.recommendation && (
                      <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-1 text-[11px] font-medium text-sky-300">
                        Recommandation: {item.recommendation}
                      </span>
                    )}
                  </div>
                  <p className="mt-3 text-sm font-semibold text-white">{item.suggestedAction}</p>
                  <p className="mt-1 text-sm leading-6 text-neutral-300">{item.reason}</p>
                </div>
                {typeof item.score === "number" && (
                  <div className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-950 px-3 py-1 text-xs text-neutral-300">
                    <Gauge className="h-3.5 w-3.5 text-neutral-500" aria-hidden="true" />
                    <span className="tabular-nums text-white">{item.score}/100</span>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-neutral-800 bg-neutral-900/40 p-4 text-sm leading-6 text-neutral-400">
          Aucune venture sauvegardée à prioriser. Les cartes de démonstration restent visibles
          dans le cockpit, mais elles ne créent pas de file de décision.
        </div>
      )}

      {items[0] && (
        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-neutral-800/80 bg-neutral-900/40 p-4 text-sm leading-6 text-neutral-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
          <p>
            <span className="font-semibold text-white">Next:</span> {items[0].suggestedAction}{" "}
            pour <span className="font-semibold text-white">{items[0].name}</span>.
          </p>
        </div>
      )}
    </section>
  );
}
