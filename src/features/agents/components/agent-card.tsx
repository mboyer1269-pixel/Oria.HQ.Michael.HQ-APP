import {
  Bot,
  Eye,
  Hammer,
  Lock,
  Megaphone,
  NotebookPen,
  SearchCheck,
  Settings2,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import type { AgentProfile, AgentRoleId, AgentStatus } from "../types";

const ROLE_ICONS: Record<AgentRoleId, React.ComponentType<{ className?: string }>> = {
  orchestrator: Bot,
  scout: SearchCheck,
  builder: Hammer,
  closer: Megaphone,
  operator: Settings2,
  auditor: ShieldAlert,
  memory: NotebookPen,
  money: TrendingUp,
};

const STATUS_STYLES: Record<AgentStatus, { badge: string; dot: string; label: string }> = {
  active: {
    badge: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
    dot: "bg-emerald-400",
    label: "Actif",
  },
  standby: {
    badge: "border-amber-500/20 bg-amber-500/10 text-amber-300",
    dot: "bg-amber-400",
    label: "Standby",
  },
  locked: {
    badge: "border-red-500/20 bg-red-500/10 text-red-300",
    dot: "bg-red-400",
    label: "Verrouillé",
  },
  planned: {
    badge: "border-neutral-700 bg-neutral-900 text-neutral-500",
    dot: "bg-neutral-600",
    label: "Planifié",
  },
};

export function AgentCard({ agent }: { agent: AgentProfile }) {
  const Icon = ROLE_ICONS[agent.role];
  const status = STATUS_STYLES[agent.status];

  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-neutral-800 bg-neutral-950/70 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900">
            <Icon className="h-4 w-4 text-neutral-400" />
          </div>
          <div>
            <h3 className="font-semibold text-white">
              {agent.lore ? (
                <span
                  title={agent.lore}
                  className="cursor-help underline decoration-amber-500/40 decoration-dotted underline-offset-4 transition-colors hover:decoration-amber-400"
                >
                  {agent.name}
                </span>
              ) : (
                agent.name
              )}
            </h3>
            <p className="text-xs text-neutral-500">{agent.tagline}</p>
          </div>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${status.badge}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} aria-hidden="true" />
          {status.label}
        </span>
      </div>

      <p className="text-sm leading-6 text-neutral-400">{agent.description}</p>

      <div className="flex items-center justify-between gap-2 text-xs text-neutral-500">
        <span className="flex items-center gap-1.5">
          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          {agent.skillIds.length} skill{agent.skillIds.length !== 1 ? "s" : ""}
        </span>
        <span>Autonomie {agent.autonomyLevel}/5</span>
      </div>

      {agent.constraints.length > 0 && (
        <ul className="space-y-1 border-t border-neutral-800/60 pt-3">
          {agent.constraints.map((c) => (
            <li key={c} className="flex items-start gap-1.5 text-xs text-neutral-600">
              <Lock className="mt-0.5 h-3 w-3 shrink-0 text-neutral-700" aria-hidden="true" />
              {c}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
