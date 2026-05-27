import { BookOpen, CalendarClock, ClipboardList, Lock, ShieldAlert } from "lucide-react";

const LEGEND_ITEMS = [
  {
    icon: CalendarClock,
    label: "Proposition calendrier (pending)",
    detail: "En attente sur /hq — TTL 10 min. Approuver ou refuser dans le bandeau Michael HQ.",
    tone: "text-amber-300 border-amber-500/20 bg-amber-500/5",
  },
  {
    icon: CalendarClock,
    label: "Mission draft calendrier confirmée",
    detail: "Après confirm : status Brouillon, calendar.book + missionId sur le ledger (local).",
    tone: "text-emerald-300 border-emerald-500/20 bg-emerald-500/5",
  },
  {
    icon: ClipboardList,
    label: "Plan Joris (dry-run)",
    detail: "mission.plan dans le chat — texte seulement, aucune mission créée.",
    tone: "text-sky-300 border-sky-500/20 bg-sky-500/5",
  },
  {
    icon: ShieldAlert,
    label: "Approbation exécuteur (mock)",
    detail: "Missions needs_approval du seed — boutons désactivés, Phase 2.",
    tone: "text-orange-300 border-orange-500/20 bg-orange-500/5",
  },
  {
    icon: Lock,
    label: "Exécuteur live",
    detail: "Verrouillé — Red Team pass requis avant toute exécution autonome.",
    tone: "text-red-300 border-red-500/20 bg-red-500/5",
  },
  {
    icon: BookOpen,
    label: "Pipeline seed",
    detail: "Données de démonstration Phase 1 — pas d’exécution réelle.",
    tone: "text-neutral-400 border-neutral-800 bg-neutral-950/40",
  },
] as const;

export function MissionFlowLegend() {
  return (
    <section
      aria-label="Légende des flux mission"
      className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
        Lire le pipeline
      </p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {LEGEND_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <li
              key={item.label}
              className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs leading-5 ${item.tone}`}
            >
              <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden="true" />
              <div>
                <p className="font-semibold">{item.label}</p>
                <p className="mt-0.5 opacity-80">{item.detail}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
