import {
  Bot,
  ClipboardCheck,
  ChevronDown,
  Eye,
  Hammer,
  Headset,
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
  support: Headset,
  quality: ClipboardCheck,
};

const ROLE_LABELS: Record<AgentRoleId, string> = {
  orchestrator: "Orchestration", scout: "Recherche", builder: "Construction", closer: "Vente",
  operator: "Opérations", auditor: "Audit", memory: "Mémoire", money: "Finance", support: "Support", quality: "Qualité",
};
const STATUS_STYLES: Record<AgentStatus, { color: string; label: string }> = {
  active: { color: "text-[var(--mint)]", label: "Profil activé" },
  standby: { color: "text-[var(--fg-muted)]", label: "Profil en attente" },
  locked: { color: "text-[var(--coral)]", label: "Profil verrouillé" },
  planned: { color: "text-[var(--fg-muted)]", label: "Profil planifié" },
};

export function AgentCard({ agent }: { agent: AgentProfile }) {
  const Icon = ROLE_ICONS[agent.role];
  const status = STATUS_STYLES[agent.status];

  return (
    <article aria-label={`Profil ${agent.name}`} className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--ink-950)] p-4">
      <details className="group">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--marigold)] [&::-webkit-details-marker]:hidden">
          <Icon className="h-5 w-5 shrink-0 text-[var(--fg-muted)]" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <strong className="block break-words text-[var(--fg)]">{agent.name}</strong>
            <span className="block text-sm text-[var(--fg-muted)]">{ROLE_LABELS[agent.role]}</span>
            <span className={`mt-1 block text-xs ${status.color}`}>{status.label}</span>
          </span>
          <span className="text-xs text-[var(--fg-muted)]"><span className="group-open:hidden">Voir le profil</span><span className="hidden group-open:inline">Réduire</span></span>
          <ChevronDown className="h-4 w-4 shrink-0 text-[var(--fg-muted)] group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="mt-4 space-y-4 border-t border-[var(--border)] pt-4">
          <p className="text-sm text-[var(--fg)]">{agent.tagline}</p>
          <p className="break-words text-sm leading-6 text-[var(--fg-muted)]">{agent.description}</p>
          <p className="text-xs text-[var(--fg-muted)]">Profil configuré uniquement : aucune connexion ni exécution en cours confirmée par cette fiche.</p>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--fg-muted)]">
        <span className="flex items-center gap-1.5">
          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          {agent.skillIds.length} compétence{agent.skillIds.length !== 1 ? "s" : ""}
        </span>
        <span>Autonomie {agent.autonomyLevel}/5</span>
      </div>

      {agent.constraints.length > 0 && (
        <ul aria-label="Limites du profil" className="space-y-2 border-t border-[var(--border)] pt-3">
          {agent.constraints.map((c) => (
            <li key={c} className="flex items-start gap-1.5 text-xs text-[var(--fg-muted)]">
              <Lock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
              {c}
            </li>
          ))}
        </ul>
      )}
          {agent.lore && <p className="text-xs italic text-[var(--fg-muted)]">{agent.lore}</p>}
        </div>
      </details>
      {agent.status === "locked" && <p className="mt-3 text-xs text-[var(--coral)]">Profil verrouillé : aucune exécution autorisée.</p>}
    </article>
  );
}
