import { AlertTriangle, Bot, Lock, ShieldAlert } from "lucide-react";
import type { CockpitReviewAttention } from "@/features/agents/agent-review-cockpit";
import { Tooltip } from "./ui";

// ---------------------------------------------------------------------------
// Situational overview — the top strip. Every number here is real:
//   - attention totals come from the local review queue
//   - agent counts come from the agent registry
//   - runtime is shown locked because runtime execution is not authorized
// No invented metrics.
// ---------------------------------------------------------------------------

interface AgentCounts {
  total: number;
  active: number;
}

function Tile({
  icon: Icon,
  iconColor,
  value,
  label,
  tag,
  tagClass,
  tip,
}: {
  icon: typeof AlertTriangle;
  iconColor: string;
  value: string;
  label: string;
  tag: string;
  tagClass: string;
  tip: { title: string; detail: string; meta?: string };
}) {
  return (
    <Tooltip title={tip.title} detail={tip.detail} meta={tip.meta} className="w-full">
      <div className="w-full rounded-2xl border border-white/[0.06] bg-[#141a2c]/60 p-4 shadow-[0_2px_10px_rgba(0,0,0,.28)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-white/10">
        <div className="flex items-center justify-between">
          <span className={`grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-black/20 ${iconColor}`}>
            <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
          </span>
          <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${tagClass}`}>{tag}</span>
        </div>
        <div className="mt-3.5 text-[40px] font-extrabold leading-none tracking-tight text-[#eff1fb] tabular-nums">
          {value}
        </div>
        <div className="mt-2 text-[12.5px] text-[#98a1c4]">{label}</div>
      </div>
    </Tooltip>
  );
}

export function CockpitOverview({
  attention,
  agents,
}: {
  attention: CockpitReviewAttention;
  agents: AgentCounts;
}) {
  return (
    <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
      <Tile
        icon={AlertTriangle}
        iconColor="text-rose-300"
        value={String(attention.total)}
        label="Décisions en attente de revue"
        tag={attention.needsAttention ? "action requise" : "à jour"}
        tagClass={
          attention.needsAttention
            ? "bg-rose-500/12 text-rose-300"
            : "bg-emerald-500/12 text-emerald-300"
        }
        tip={{
          title: "File de revue",
          detail:
            "Items dérivés des scorecards de tes agents. Chacun attend une décision humaine explicite.",
          meta: `${attention.critical} critique(s) · ${attention.high} élevé(s)`,
        }}
      />
      <Tile
        icon={ShieldAlert}
        iconColor="text-amber-300"
        value={String(attention.critical + attention.high)}
        label="Prioritaires (critique + élevé)"
        tag={attention.critical > 0 ? "critique" : "ok"}
        tagClass={
          attention.critical > 0
            ? "bg-rose-500/12 text-rose-300"
            : "bg-emerald-500/12 text-emerald-300"
        }
        tip={{
          title: "À traiter en premier",
          detail:
            "Le sous-ensemble le plus urgent de la file : risque de gouvernance qui demande ton attention maintenant.",
          meta: "Trié en tête de la file de revue",
        }}
      />
      <Tile
        icon={Bot}
        iconColor="text-cyan-300"
        value={String(agents.total)}
        label="Agents gouvernés"
        tag={`${agents.active} actifs`}
        tagClass="bg-cyan-500/10 text-cyan-300"
        tip={{
          title: "Registre des agents",
          detail:
            "Agents sous politique d'autonomie, évalués par scorecards. Aucun n'agit sans mandat explicite.",
          meta: "Voir Agents · gouvernance",
        }}
      />
      <Tile
        icon={Lock}
        iconColor="text-rose-300"
        value="—"
        label="Runtime — exécution"
        tag="verrouillé"
        tagClass="bg-rose-500/12 text-rose-300"
        tip={{
          title: "Runtime",
          detail:
            "L'exécution autonome reste verrouillée tant qu'une action n'est pas approuvée, ledgerée et bornée. C'est voulu.",
          meta: "Aucune exécution autorisée",
        }}
      />
    </div>
  );
}
