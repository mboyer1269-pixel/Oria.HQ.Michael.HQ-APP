import { CheckCircle2, Lock, FileCode2, Database, Timer } from "lucide-react";

type StatusLevel = "enabled" | "locked" | "partial";

type StatusItem = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  detail: string;
  level: StatusLevel;
};

const STATUS_ITEMS: StatusItem[] = [
  {
    icon: CheckCircle2,
    label: "Joris planning",
    detail: "dry-run uniquement",
    level: "enabled",
  },
  {
    icon: Lock,
    label: "Exécuteur live",
    detail: "verrouillé — Red Team pass requis",
    level: "locked",
  },
  {
    icon: FileCode2,
    label: "Approval records",
    detail: "contrat défini, pas de persistence",
    level: "partial",
  },
  {
    icon: Database,
    label: "Persistence",
    detail: "proposée, migration non appliquée",
    level: "partial",
  },
  {
    icon: Timer,
    label: "Idempotency / rate limit",
    detail: "local dry-run uniquement",
    level: "partial",
  },
];

const LEVEL_STYLES: Record<StatusLevel, { badge: string; dot: string }> = {
  enabled: {
    badge: "border-emerald-500/20 bg-emerald-500/8 text-emerald-300",
    dot: "bg-emerald-400",
  },
  locked: {
    badge: "border-red-500/20 bg-red-500/8 text-red-300",
    dot: "bg-red-400",
  },
  partial: {
    badge: "border-amber-500/20 bg-amber-500/8 text-amber-300",
    dot: "bg-amber-400",
  },
};

export function MissionSystemStatus() {
  return (
    <section
      aria-label="Mission system status"
      className="rounded-2xl border border-neutral-800 bg-neutral-950/60 px-4 py-3"
    >
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
        État du système
      </p>
      <ul className="flex flex-wrap gap-2">
        {STATUS_ITEMS.map((item) => {
          const styles = LEVEL_STYLES[item.level];
          const Icon = item.icon;
          return (
            <li
              key={item.label}
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${styles.badge}`}
            >
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${styles.dot}`} aria-hidden="true" />
              <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
              <span className="font-medium">{item.label}</span>
              <span className="text-neutral-500">—</span>
              <span className="opacity-70">{item.detail}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
