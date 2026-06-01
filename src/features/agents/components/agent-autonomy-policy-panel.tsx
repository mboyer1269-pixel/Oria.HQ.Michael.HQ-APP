import { AlertTriangle, CheckCircle2, Lock, ShieldCheck, Sparkles } from "lucide-react";
import type { AgentAutonomyCockpitModel, AgentSkillAutonomyItem } from "../agent-autonomy-cockpit";

const STATUS_LABEL: Record<AgentSkillAutonomyItem["status"], string> = {
  active: "actif",
  partial: "partiel",
  planned: "planifie",
};

function SkillChips({
  emptyLabel,
  items,
  tone,
}: {
  emptyLabel: string;
  items: AgentSkillAutonomyItem[];
  tone: "safe" | "approval" | "blocked";
}) {
  const styles = {
    safe: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
    approval: "border-amber-500/20 bg-amber-500/10 text-amber-300",
    blocked: "border-red-500/20 bg-red-500/10 text-red-300",
  };

  if (items.length === 0) {
    return emptyLabel ? <p className="text-xs text-neutral-600">{emptyLabel}</p> : null;
  }

  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <li
          key={item.id}
          title={item.reason}
          className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${styles[tone]}`}
        >
          {item.label}
          <span className="ml-1 text-current/60">· {STATUS_LABEL[item.status]}</span>
        </li>
      ))}
    </ul>
  );
}

export function AgentAutonomyPolicyPanel({ model }: { model: AgentAutonomyCockpitModel }) {
  return (
    <section className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Autonomy Policy
          </div>
          <h2 className="mt-3 text-xl font-semibold text-white">
            Autonomie agent par capacite, pas par fournisseur LLM
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
            Les modeles approuves restent interchangeables. Les decisions d&apos;autonomie sont
            pilotees par le risque de la capacite et par les effets de bord des skills.
          </p>
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-2 text-sm sm:grid-cols-4 lg:w-[31rem]">
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Autonomes</p>
            <p className="mt-1 tabular-nums text-2xl font-semibold text-emerald-300">
              {model.summary.autonomousCapabilities}
            </p>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Approbation</p>
            <p className="mt-1 tabular-nums text-2xl font-semibold text-amber-300">
              {model.summary.approvalRequiredCapabilities}
            </p>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Bloquees</p>
            <p className="mt-1 tabular-nums text-2xl font-semibold text-red-300">
              {model.summary.blockedCapabilities}
            </p>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Modele</p>
            <p className="mt-2 text-xs font-medium text-violet-300">
              {model.summary.providerModeLabel}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_18rem]">
        <div className="overflow-hidden rounded-xl border border-neutral-800">
          <div className="hidden grid-cols-[1.05fr_1fr_1fr] gap-3 border-b border-neutral-800 bg-neutral-900/60 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500 md:grid">
            <span>Agent</span>
            <span>Autonome</span>
            <span>Approbation / blocage</span>
          </div>
          <div className="divide-y divide-neutral-800">
            {model.agents.map((agent) => (
              <div
                key={agent.id}
                className="grid gap-3 px-4 py-3 text-sm md:grid-cols-[1.05fr_1fr_1fr]"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-white">{agent.name}</span>
                    <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[11px] text-neutral-400">
                      {agent.role}
                    </span>
                    <span className="text-xs text-neutral-500">L{agent.autonomyLevel}/5</span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-600">
                    Provider lock-in: non · execution directe: non
                  </p>
                </div>

                <SkillChips
                  emptyLabel="Aucune skill autonome"
                  items={agent.autonomousSkills}
                  tone="safe"
                />

                <div className="space-y-2">
                  <SkillChips
                    emptyLabel="Aucune approbation requise"
                    items={agent.approvalRequiredSkills}
                    tone="approval"
                  />
                  <SkillChips
                    emptyLabel=""
                    items={agent.blockedSkills}
                    tone="blocked"
                  />
                  {agent.missingSkillIds.length > 0 && (
                    <ul className="flex flex-wrap gap-1.5">
                      {agent.missingSkillIds.map((id) => (
                        <li
                          key={id}
                          className="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 font-mono text-[11px] text-red-300"
                        >
                          missing: {id}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <aside className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-red-300">
            <Lock className="h-4 w-4" aria-hidden="true" />
            Toujours bloque
          </div>
          <ul className="mt-3 space-y-2">
            {model.blockedCapabilities.map((capability) => (
              <li key={capability.id} className="text-xs leading-5 text-neutral-400">
                <span className="font-medium text-red-200">{capability.label}</span>
                <span className="text-neutral-600"> · </span>
                {capability.description}
              </li>
            ))}
          </ul>
        </aside>
      </div>

      <div className="mt-4 grid gap-2 text-xs text-neutral-500 md:grid-cols-3">
        <p className="flex items-center gap-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
          Analyse, plans, recherche et brouillons internes peuvent monter haut en autonomie.
        </p>
        <p className="flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
          Ecriture reversible, publication et contact externe restent gates.
        </p>
        <p className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-violet-400" aria-hidden="true" />
          La selection du modele reste flexible dans le pool approuve.
        </p>
      </div>
    </section>
  );
}
