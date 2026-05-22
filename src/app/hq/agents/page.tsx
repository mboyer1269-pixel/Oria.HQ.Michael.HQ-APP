import type { Route } from "next";
import Link from "next/link";
import { ArrowLeft, Users } from "lucide-react";
import { AgentCard } from "@/features/agents/components/agent-card";
import { agentRegistry } from "@/features/agents/seed";
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
    </main>
  );
}
