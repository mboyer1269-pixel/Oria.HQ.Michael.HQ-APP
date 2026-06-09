import { Bot, Database, LockKeyhole, ScrollText, type LucideIcon } from "lucide-react";

// ---------------------------------------------------------------------------
// hq-overview-widgets.tsx — compact, honest "Vue opérateur" section for /hq.
//
// Four DECLARED-posture cards (not live metrics): runtime locked, proposal-only
// actions, mandatory ledger audit, real-source data. No fabricated numbers, no
// execution CTA, no live/health/revenue claims. Presentational only — it states
// the operating posture, it does not measure or execute anything.
// ---------------------------------------------------------------------------

type Tone = "violet" | "amber" | "sky" | "emerald";

const TONE: Record<Tone, { chip: string; icon: string }> = {
  violet: { chip: "border-violet-500/30 bg-violet-500/10 text-violet-200", icon: "text-violet-300" },
  amber: { chip: "border-amber-500/30 bg-amber-500/10 text-amber-200", icon: "text-amber-300" },
  sky: { chip: "border-sky-500/30 bg-sky-500/10 text-sky-200", icon: "text-sky-300" },
  emerald: { chip: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200", icon: "text-emerald-300" },
};

type Card = { id: string; icon: LucideIcon; title: string; value: string; detail: string; tone: Tone };

const CARDS: Card[] = [
  { id: "runtime", icon: LockKeyhole, title: "Runtime", value: "Verrouillé", detail: "Exécution agentique gardée par approbation.", tone: "violet" },
  { id: "actions", icon: Bot, title: "Actions", value: "Proposition seulement", detail: "Aucune action directe depuis cette vue.", tone: "amber" },
  { id: "ledger", icon: ScrollText, title: "Ledger", value: "Audit obligatoire", detail: "Les écritures doivent être traçables et contrôlées.", tone: "sky" },
  { id: "data", icon: Database, title: "Données", value: "Sources réelles", detail: "Aucun revenu, run rate ou état live simulé.", tone: "emerald" },
];

export function HqOverviewWidgets() {
  return (
    <section aria-label="Vue opérateur" className="rounded-3xl border border-neutral-800 bg-neutral-950/70 p-5">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-400">Vue opérateur</p>
        <p className="text-sm text-neutral-400">Signaux déclarés · aucune exécution directe</p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {CARDS.map((card) => {
          const Icon = card.icon;
          const tone = TONE[card.tone];
          return (
            <article
              key={card.id}
              className="flex flex-col gap-2 rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4"
            >
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-white">
                <Icon className={`h-4 w-4 ${tone.icon}`} aria-hidden="true" />
                {card.title}
              </span>
              <span className={`inline-flex w-fit rounded-full border px-2 py-0.5 text-[11px] font-bold ${tone.chip}`}>
                {card.value}
              </span>
              <p className="text-xs leading-5 text-neutral-500">{card.detail}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
