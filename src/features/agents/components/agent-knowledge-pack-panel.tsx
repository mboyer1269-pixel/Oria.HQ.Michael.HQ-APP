import { BookOpen, Database, ShieldCheck, Target } from "lucide-react";
import type { AgentKnowledgePackCatalog, AgentKnowledgePackBlueprint } from "../agent-knowledge-packs";

function PackCard({ pack }: { pack: AgentKnowledgePackBlueprint }) {
  const topContext = pack.requiredContext.slice(0, 3);
  const topMetrics = pack.successMetrics.slice(0, 4);

  return (
    <article className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-white">{pack.agentName}</h3>
        <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[11px] text-neutral-400">
          {pack.role}
        </span>
      </div>

      <p className="mt-2 line-clamp-2 text-xs leading-5 text-neutral-500">{pack.purpose}</p>

      <div className="mt-4 grid gap-3 text-xs md:grid-cols-2">
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 font-medium text-neutral-300">
            <BookOpen className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
            Contexte
          </p>
          <ul className="space-y-1 text-neutral-500">
            {topContext.map((item) => (
              <li key={`${item.source}-${item.label}`}>{item.label}</li>
            ))}
          </ul>
        </div>

        <div>
          <p className="mb-1.5 flex items-center gap-1.5 font-medium text-neutral-300">
            <Target className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
            Métriques
          </p>
          <ul className="space-y-1 font-mono text-[11px] text-neutral-500">
            {topMetrics.map((metric) => (
              <li key={metric}>{metric}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {pack.allowedSkillIds.map((id) => (
          <span
            key={id}
            className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] text-emerald-300"
          >
            {id}
          </span>
        ))}
        {pack.missingSkillIds.map((id) => (
          <span
            key={id}
            className="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 font-mono text-[11px] text-red-300"
          >
            missing: {id}
          </span>
        ))}
      </div>
    </article>
  );
}

export function AgentKnowledgePackPanel({ catalog }: { catalog: AgentKnowledgePackCatalog }) {
  return (
    <section className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-300">
            <Database className="h-3.5 w-3.5" aria-hidden="true" />
            Knowledge Packs
          </div>
          <h2 className="mt-3 text-xl font-semibold text-white">
            Agent knowledge blueprints
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
            Chaque agent a un pack de contexte attendu: sources fiables, connaissances requises,
            métriques business et guardrails. Ces packs sont des blueprints en lecture seule.
          </p>
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-2 text-sm sm:grid-cols-4 lg:w-[31rem]">
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Packs</p>
            <p className="mt-1 tabular-nums text-2xl font-semibold text-white">
              {catalog.summary.totalPacks}
            </p>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Actifs</p>
            <p className="mt-1 tabular-nums text-2xl font-semibold text-emerald-300">
              {catalog.summary.activePacks}
            </p>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Missing</p>
            <p className="mt-1 tabular-nums text-2xl font-semibold text-amber-300">
              {catalog.summary.packsWithMissingSkills}
            </p>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Execution</p>
            <p className="mt-2 text-xs font-medium text-red-300">not authorized</p>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {catalog.packs.map((pack) => (
          <PackCard key={pack.agentId} pack={pack} />
        ))}
      </div>

      <div className="mt-4 grid gap-2 text-xs text-neutral-500 md:grid-cols-3">
        <p className="flex items-center gap-2">
          <BookOpen className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
          Le contexte provient du registre, du catalogue de skills, de la mémoire, des résumés ledger et de la politique.
        </p>
        <p className="flex items-center gap-2">
          <Target className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
          Les métriques restent orientées business, sans inventer de revenus.
        </p>
        <p className="flex items-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5 text-violet-400" aria-hidden="true" />
          Human-on-the-loop et non-exécution restent explicites.
        </p>
      </div>
    </section>
  );
}
