import { DevelopmentMissionForm } from "@/features/missions/components/development-mission-form";
import type { Route } from "next";
import Link from "next/link";
import { Bot, LayoutDashboard, ShieldAlert } from "lucide-react";
import { MissionKanbanBoard } from "@/features/missions/components/mission-kanban-board";
import { MissionDossier } from "@/features/missions/components/mission-dossier";
import { OrchestrationProjection } from "@/features/missions/components/orchestration-projection";
import { MissionApprovalPanel } from "@/features/missions/components/mission-approval-panel";
import { missionStatusLabels } from "@/features/missions/mission-dossier";
import { listMissionPage, parseMissionPageFilter, missionPageHref, MISSION_PAGE_SIZE } from "@/server/missions/mission-page";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { requireOwnerAccess } from "@/server/auth/owner";
import { OwnerAccessDenied } from "@/features/hq/components/owner-access-denied";
import { CockpitShell } from "@/features/cockpit/components/cockpit-shell";
import { serverEnv } from "@/lib/server-env";
import { resolvePaperclipBinding } from "@/server/orchestration/workspace-binding";
import {
  HqMetric,
  HqPageHeader,
  HqSummaryRail,
  HqWidget,
} from "@/features/hq/components/hq-widget-system";

export const dynamic = "force-dynamic";

export default async function MissionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await requireOwnerAccess("/hq/missions");

  if (access.status === "forbidden") {
    return <OwnerAccessDenied email={access.user.email} />;
  }

  const { activeWorkspace, activeMode } = getActiveWorkspaceContext();
  const filter = parseMissionPageFilter(await searchParams);
  const { missions, source, summary, filteredTotal, reviewTotal, pageNumber } = await listMissionPage({
    workspaceId: activeWorkspace.id,
    modeId: activeMode.id,
  }, filter);

  const pageRecovered = pageNumber !== filter.page;
  filter.page = pageNumber;
  const hasMissions = missions.length > 0;
  const pages = Math.max(1, Math.ceil(filteredTotal / MISSION_PAGE_SIZE));
  const transferEnabled = source === "supabase" && resolvePaperclipBinding({ enabled: serverEnv.paperclipDispatchEnabled,
    baseUrl: serverEnv.paperclipBaseUrl, token: serverEnv.paperclipBoardToken, workspaceId: serverEnv.paperclipWorkspaceId,
    companyId: serverEnv.paperclipCompanyId }, activeWorkspace.id).status === "ready";

  return (
    <CockpitShell active="missions" crumb="Missions">
      <HqPageHeader
        backHref={"/hq" as Route}
        eyebrow="Mission Control"
        icon={LayoutDashboard}
        tone="amber"
        title="Pipeline des missions"
        description={
          <>
            Retrouvez l’objectif, le responsable et les preuves de chaque mission. Pour préparer une demande, ouvrez{" "}
            <Link href={"/hq#command-center" as Route} className="text-amber-300 underline-offset-2 hover:underline">l’assistant HQ</Link>.
            Une proposition dans la conversation ne signifie pas qu’un agent a commencé son exécution.
          </>
        }
      >
        <HqSummaryRail>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Résumé global du mode actif</p>
          <div className="mt-3 grid gap-2">
            <HqMetric label="Total" value={summary.total} />
            <HqMetric label="En cours" value={summary.running} tone="amber" />
            <HqMetric label="Approbation" value={summary.needs_approval} tone="amber" />
            <HqMetric label="Terminées" value={summary.completed} tone="emerald" />
            {summary.failed > 0 && (
              <HqMetric label="Échouées" value={summary.failed} tone="rose" />
            )}
          </div>
        </HqSummaryRail>
      </HqPageHeader>

      <DevelopmentMissionForm workspaceId={activeWorkspace.id} />
      <section aria-label="Recherche dans toutes les missions" className="rounded-2xl border border-neutral-800 p-4">
        {pageRecovered && <p role="status" className="mb-3 text-sm text-amber-200">La page demandée n’existe plus. La première page est affichée.</p>}
        <form key={missionPageHref(filter)} action="/hq/missions" className="flex flex-wrap items-end gap-3">
          <label className="grid gap-2 text-sm text-neutral-300">Titre ou objectif, tout l’historique
            <input name="q" type="search" maxLength={200} defaultValue={filter.q} className="min-h-11 rounded-lg border border-neutral-700 bg-neutral-900 px-3" />
          </label>
          <label className="grid gap-2 text-sm text-neutral-300">Statut ou besoin de revue
            <select name="status" defaultValue={filter.status} className="min-h-11 rounded-lg border border-neutral-700 bg-neutral-900 px-3">
              <option value="all">Tous les statuts</option><option value="review">Approbation requise (tous motifs)</option>
              {Object.entries(missionStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <button className="min-h-11 rounded-lg bg-amber-400 px-4 text-sm font-semibold text-neutral-950">Rechercher</button>
          <Link href="/hq/missions" className="p-3 text-sm text-neutral-300 underline">Réinitialiser</Link>
        </form>
        <p role="status" className="mt-4 text-sm text-neutral-300">{filteredTotal} résultat(s) sur {summary.total} missions. {missions.length ? `${(filter.page - 1) * MISSION_PAGE_SIZE + 1}–${(filter.page - 1) * MISSION_PAGE_SIZE + missions.length}` : "0"} affiché(s), plus récentes en premier.</p>
        <nav aria-label="Pages des missions" className="mt-3 flex flex-wrap items-center gap-4 text-sm text-amber-200">
          {filter.page > 1 && <Link href={missionPageHref(filter, filter.page - 1) as Route}>Page précédente</Link>}
          <span>Page {filter.page} / {pages}</span>
          {filter.page < pages && <Link href={missionPageHref(filter, filter.page + 1) as Route}>Page suivante</Link>}
          {filter.page > pages && <Link href={missionPageHref(filter, 1) as Route}>Revenir à la première page</Link>}
        </nav>
      </section>
      <MissionDossier key={missionPageHref(filter)} missions={missions} source={source} transferEnabled={transferEnabled} openHandsEnabled={process.env.ORIA_ENABLE_OPENHANDS_CONFIRMATION === "1"} toolReviewEnabled={process.env.ORIA_ENABLE_OPENHANDS_TOOL_REVIEW === "1"} launchEnabled={process.env.ORIA_ENABLE_OPENHANDS_LAUNCH === "1"} paginated />
      <OrchestrationProjection key={activeWorkspace.id} workspaceId={activeWorkspace.id} />

      {reviewTotal > 0 && <section className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4 text-sm text-orange-100">
        <p>{summary.needs_approval} mission(s) au statut « Approbation » ; {reviewTotal} mission(s) nécessitent une revue selon la politique globale.</p>
        <Link href={missionPageHref({ page: 1, q: "", status: "review" }) as Route} className="mt-2 inline-block underline">Voir toutes les missions nécessitant une revue</Link>
      </section>}
      {filter.status === "review" && <HqWidget title="Approbations — cette page" eyebrow="Human gate" icon={ShieldAlert}>
        <MissionApprovalPanel missions={missions} />
      </HqWidget>}

      <HqWidget title="Kanban — résultats de cette page" eyebrow="Pipeline" icon={LayoutDashboard}>
        {hasMissions ? (
          <MissionKanbanBoard missions={missions} />
        ) : (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-neutral-800 bg-neutral-950/40 px-4 py-24 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-900 shadow-inner">
              <Bot className="h-8 w-8 text-amber-400" />
            </div>
            <div className="mt-6 max-w-md">
              <h2 className="text-xl font-semibold text-white">Aucun résultat sur cette page</h2>
              <p className="mt-3 text-sm leading-6 text-neutral-400">
                Modifiez les filtres ou revenez à la première page. Seules les missions enregistrées apparaissent dans ce dossier.
              </p>
              <Link 
                href={"/hq" as Route} 
                className="mt-8 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-amber-500 px-6 text-sm font-semibold text-neutral-950 transition hover:bg-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.15)]"
              >
                <Bot className="h-4 w-4" />
                Préparer une demande
              </Link>
            </div>
          </div>
        )}
      </HqWidget>

      <footer className="rounded-2xl border border-white/[0.07] bg-neutral-950/60 px-4 py-3">
        <p className="text-xs leading-5 text-neutral-600">
          <span className="font-medium text-neutral-500">
            Source: {source === "supabase" ? "Supabase" : "données locales"} —{" "}
          </span>
          Le statut provient de la source indiquée. Le suivi Paperclip et les preuves de résultat se consultent séparément.
        </p>
      </footer>
    </CockpitShell>
  );
}
