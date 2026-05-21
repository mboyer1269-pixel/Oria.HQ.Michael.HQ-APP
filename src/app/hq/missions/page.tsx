import type { Route } from "next";
import Link from "next/link";
import { ArrowLeft, LayoutDashboard, LayoutGrid, ShieldAlert } from "lucide-react";
import { MissionKanbanBoard } from "@/features/missions/components/mission-kanban-board";
import { MissionApprovalPanel } from "@/features/missions/components/mission-approval-panel";
import { summarizeMissions } from "@/features/missions/summary";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { listMissionsForWorkspace } from "@/server/missions";
import { requireOwnerAccess } from "@/server/auth/owner";
import { OwnerAccessDenied } from "@/features/hq/components/owner-access-denied";

export const dynamic = "force-dynamic";

export default async function MissionsPage() {
  const access = await requireOwnerAccess("/hq/missions");

  if (access.status === "forbidden") {
    return <OwnerAccessDenied email={access.user.email} />;
  }

  const { activeWorkspace, activeMode } = getActiveWorkspaceContext();
  const { missions, source } = listMissionsForWorkspace({
    workspaceId: activeWorkspace.id,
    modeId: activeMode.id,
  });

  const summary = summarizeMissions(missions);
  const hasMissions = summary.total > 0;

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
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300">
            <LayoutDashboard className="h-3.5 w-3.5" />
            Mission Control
          </div>
          <h1 className="mt-4 text-3xl font-bold leading-tight text-white sm:text-4xl">
            Pipeline des missions
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-400">
            Toutes les missions assignées aux agents sont visibles ici. Aucune action autonome ne s&apos;exécute
            sans approbation explicite.
          </p>
        </div>

        <aside className="shrink-0 rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4 sm:w-56">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Résumé</p>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-neutral-400">Total</span>
              <span className="tabular-nums text-white">{summary.total}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-amber-300">En cours</span>
              <span className="tabular-nums text-white">{summary.running}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-orange-300">Approbation</span>
              <span className="tabular-nums text-white">{summary.needs_approval}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-emerald-300">Terminées</span>
              <span className="tabular-nums text-white">{summary.completed}</span>
            </div>
            {summary.failed > 0 && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-red-400">Échouées</span>
                <span className="tabular-nums text-white">{summary.failed}</span>
              </div>
            )}
          </div>
        </aside>
      </header>

      {summary.needs_approval > 0 && (
        <section className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-orange-300" />
            <div>
              <h2 className="font-semibold text-orange-100">
                {summary.needs_approval} mission{summary.needs_approval > 1 ? "s" : ""} en attente d&apos;approbation
              </h2>
              <ul className="mt-2 space-y-1">
                {missions
                  .filter((m) => m.status === "needs_approval")
                  .map((m) => (
                    <li key={m.id} className="text-sm text-orange-200/70">
                      · {m.title} — autonomie {m.autonomyLevel}/5
                    </li>
                  ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      <MissionApprovalPanel missions={missions} />

      <section>
        {hasMissions ? (
          <MissionKanbanBoard missions={missions} />
        ) : (
          <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-neutral-800 bg-neutral-950/40 py-20 text-center">
            <LayoutGrid className="h-10 w-10 text-neutral-700" />
            <div>
              <p className="font-semibold text-neutral-400">Aucune mission pour ce workspace</p>
              <p className="mt-1 text-sm text-neutral-600">
                Les missions apparaîtront ici une fois le pipeline activé.
              </p>
            </div>
          </div>
        )}
      </section>

      <footer className="rounded-2xl border border-neutral-800 bg-neutral-950/60 px-4 py-3">
        <p className="text-xs leading-5 text-neutral-600">
          <span className="font-medium text-neutral-500">
            Source: {source === "mock" ? "données mock" : "Supabase"} —{" "}
          </span>
          Aucune exécution autonome réelle. Le pipeline d&apos;exécution sera activé en Phase 2
          après approbation du modèle Mission.
        </p>
      </footer>
    </main>
  );
}
