import type { Route } from "next";
import Link from "next/link";
import { ArrowLeft, Users } from "lucide-react";
import { buildAgentAutonomyCockpit } from "@/features/agents/agent-autonomy-cockpit";
import { buildAgentKnowledgePackCatalog } from "@/features/agents/agent-knowledge-packs";
import { AgentAutonomyPolicyPanel } from "@/features/agents/components/agent-autonomy-policy-panel";
import { AgentCard } from "@/features/agents/components/agent-card";
import { AgentKnowledgePackPanel } from "@/features/agents/components/agent-knowledge-pack-panel";
import { AgentSkillPanel } from "@/features/agents/components/agent-skill-panel";
import { getDefaultAgentAutonomyPolicy } from "@/features/agents/autonomy-policy";
import { agentRegistry } from "@/features/agents/seed";
import { validateAgentSkillMapping } from "@/features/agents/skill-mapping";
import { skillsCatalog } from "@/features/skills/seed";
import { requireOwnerAccess } from "@/server/auth/owner";
import { OwnerAccessDenied } from "@/features/hq/components/owner-access-denied";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const access = await requireOwnerAccess("/hq/agents");

  if (access.status === "forbidden") {
    return <OwnerAccessDenied email={access.user.email} />;
  }

  const active = agentRegistry.filter((a) => a.status === "active");
  const standby = agentRegistry.filter((a) => a.status === "standby");
  const locked = agentRegistry.filter((a) => a.status === "locked");
  const planned = agentRegistry.filter((a) => a.status === "planned");

  const mappingReport = validateAgentSkillMapping(agentRegistry, skillsCatalog);
  const autonomyCockpit = buildAgentAutonomyCockpit({
    agents: agentRegistry,
    skills: skillsCatalog,
    policy: getDefaultAgentAutonomyPolicy(),
  });
  const knowledgePackCatalog = buildAgentKnowledgePackCatalog({
    agents: agentRegistry,
    skills: skillsCatalog,
  });

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-5 md:px-8 md:py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link
            href={"/hq" as Route}
            className="inline-flex items-center gap-1.5 text-xs text-neutral-500 transition hover:text-neutral-300"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Michael HQ
          </Link>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-300">
            <Users className="h-3.5 w-3.5" />
            Agent Registry
          </div>
          <h1 className="mt-4 text-3xl font-bold leading-tight text-white sm:text-4xl">
            Registre des agents
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-400">
            Tous les agents Oria — orchestrateur, scouts, builders, closers, opérateurs, auditeur
            et finance. Aucun agent n&apos;agit sans mandat explicite.
          </p>
        </div>

        <aside className="shrink-0 rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4 sm:w-48">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
            Résumé
          </p>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-emerald-300">Actifs</span>
              <span className="tabular-nums text-white">{active.length}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-amber-300">Standby</span>
              <span className="tabular-nums text-white">{standby.length}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-red-300">Verrouillés</span>
              <span className="tabular-nums text-white">{locked.length}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-neutral-500">Planifiés</span>
              <span className="tabular-nums text-white">{planned.length}</span>
            </div>
          </div>
        </aside>
      </header>

      <AgentAutonomyPolicyPanel model={autonomyCockpit} />

      <AgentKnowledgePackPanel catalog={knowledgePackCatalog} />

      {[
        { label: "Actifs", agents: active, accent: "text-emerald-400" },
        { label: "Standby", agents: standby, accent: "text-amber-400" },
        { label: "Verrouillés", agents: locked, accent: "text-red-400" },
        { label: "Planifiés", agents: planned, accent: "text-neutral-500" },
      ]
        .filter(({ agents }) => agents.length > 0)
        .map(({ label, agents, accent }) => (
          <section key={label}>
            <h2 className={`mb-3 text-xs font-semibold uppercase tracking-[0.18em] ${accent}`}>
              {label}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {agents.map((agent) => (
                <AgentCard key={agent.id} agent={agent} />
              ))}
            </div>
          </section>
        ))}
      <section>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Mapping Agent → Skills
          </h2>
          <span
            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
              mappingReport.valid
                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                : "border-amber-500/20 bg-amber-500/10 text-amber-300"
            }`}
          >
            {mappingReport.valid ? "Cohérent" : "Mismatches détectés"}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {mappingReport.results.map((result) => (
            <AgentSkillPanel key={result.agent.id} result={result} />
          ))}
        </div>

        {mappingReport.unclaimed.length > 0 && (
          <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
            <p className="text-xs font-semibold text-amber-300">
              Skills non revendiquées par aucun agent
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {mappingReport.unclaimed.map((id) => (
                <li
                  key={id}
                  className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 font-mono text-[11px] text-amber-300"
                >
                  {id}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </main>
  );
}
