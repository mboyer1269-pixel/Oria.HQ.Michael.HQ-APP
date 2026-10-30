import { DevelopmentMissionForm } from "@/features/missions/components/development-mission-form";
import { missionDossierId } from "@/features/missions/development-mission-handoff";
import { createDevelopmentStore } from "@/server/missions/development-mission";
import { readOwnerSpecEvidence, ownerSpecMissionForClient } from "@/server/missions/atelier-owner-spec-read";
import { listMissionsForWorkspace } from "@/server/missions";
import { evaluateMissionApproval } from "@/server/missions/approval-service";
import type { Mission } from "@/core/types";
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
  HqWidget,
} from "@/features/hq/components/hq-widget-system";

export const dynamic = "force-dynamic";

export default async function MissionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await requireOwnerAccess("/hq/missions");

  if (access.status === "forbidden") {
    return <OwnerAccessDenied email={access.user.email} />;
  }

  const { activeWorkspace, activeMode } = getActiveWorkspaceContext();
  const params = await searchParams;
  const filter = parseMissionPageFilter(params);
  const requestedId = missionDossierId(params.mission);
  let missionPage: Awaited<ReturnType<typeof listMissionPage>>;
  try {
    missionPage = await listMissionPage({ workspaceId: activeWorkspace.id, modeId: activeMode.id }, filter);
  } catch {
    const retryHref = `${missionPageHref(filter)}${requestedId ? `&mission=${encodeURIComponent(requestedId)}` : ""}`;
    return <CockpitShell active="missions" crumb="Missions">
      <section aria-labelledby="mission-read-error" className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--ink-900)] p-5 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--marigold)]">Salle des missions</p>
        <h1 id="mission-read-error" className="mt-3 text-2xl font-bold text-[var(--fg)]">Lecture des missions indisponible</h1>
        <p role="status" className="mt-3 max-w-xl text-sm leading-6 text-[var(--fg-muted)]">Impossible de vérifier les dossiers pour le moment. Aucun statut ni total n’est confirmé. Vos filtres et la mission demandée sont conservés pour la relecture.</p>
        <Link href={retryHref as Route} className="mt-5 inline-flex min-h-11 items-center rounded-lg border border-[var(--fg-faint)] px-4 text-sm font-semibold text-[var(--marigold)] focus-visible:outline-2 focus-visible:outline-amber-300">Réessayer la lecture</Link>
      </section>
      <DevelopmentMissionForm key="development-form" workspaceId={activeWorkspace.id} />
    </CockpitShell>;
  }
  const { missions, source, summary, filteredTotal, reviewTotal, pageNumber } = missionPage;

  // The explicit receipt supplements the page in the owner-derived scope.
  let requestedMission: Mission | null = null;
  let requestedReadFailed = false;
  if (requestedId) {
    try {
      const store = source === "supabase" ? createDevelopmentStore() : null;
      if (source === "supabase" && !store) throw new Error("Mission storage unavailable.");
      const candidate = source === "supabase"
        ? await store!.load(activeWorkspace.id, requestedId)
        : (await listMissionsForWorkspace({ workspaceId: activeWorkspace.id, modeId: activeMode.id })).missions.find(mission => mission.id === requestedId);
      if (candidate?.id === requestedId && candidate.workspaceId === activeWorkspace.id && candidate.modeId === activeMode.id) requestedMission = candidate;
    } catch { requestedReadFailed = true; }
  }

  const pageRecovered = pageNumber !== filter.page;
  filter.page = pageNumber;
  const hasMissions = missions.length > 0;
  // One interactive dossier: an explicit receipt supplements this page, never
  // creates a second independent set of reservation/launch controls.
  const dossierMissions = requestedMission
    ? [requestedMission, ...missions.filter(mission => mission.id !== requestedMission.id)] : missions;
  const ownerSpecEvidence = source === "supabase" ? Object.fromEntries(dossierMissions.map(mission => [mission.id,
    readOwnerSpecEvidence(mission, { workspaceId: activeWorkspace.id, modeId: activeMode.id, actorId: access.user.id })])) : undefined;
  const reviewMissions = (filter.status === "review" ? dossierMissions : requestedMission ? [requestedMission] : [])
    .filter(mission => evaluateMissionApproval(mission).required);
  const clientDossierMissions = dossierMissions.map(ownerSpecMissionForClient);
  const clientReviewMissions = reviewMissions.map(ownerSpecMissionForClient);
  const clientPageMissions = missions.map(ownerSpecMissionForClient);
  const pages = Math.max(1, Math.ceil(filteredTotal / MISSION_PAGE_SIZE));
  const transferEnabled = source === "supabase" && resolvePaperclipBinding({ enabled: serverEnv.paperclipDispatchEnabled,
    baseUrl: serverEnv.paperclipBaseUrl, token: serverEnv.paperclipBoardToken, workspaceId: serverEnv.paperclipWorkspaceId,
    companyId: serverEnv.paperclipCompanyId }, activeWorkspace.id).status === "ready";

  return (
    <CockpitShell active="missions" crumb="Missions">
      <header className="min-w-0 py-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--marigold)]">Salle des missions</p>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-3xl font-extrabold text-[var(--fg)] sm:text-4xl">Vos missions.</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--fg-muted)]">Consultez le dossier, prenez les décisions nécessaires et retrouvez les résultats rapportés. Une demande préparée n’est pas une exécution.</p>
          </div>
          <a href="#development-mission" className="inline-flex min-h-11 shrink-0 items-center rounded-lg border border-[var(--fg-faint)] px-4 text-sm font-semibold text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-amber-300">Nouvelle mission</a>
        </div>
        <dl aria-label="Résumé du mode actif" className="mt-5 flex flex-wrap gap-x-6 gap-y-3 border-y border-[var(--border)] py-3 text-sm">
          <div className="flex gap-2"><dt className="text-[var(--fg-muted)]">Total</dt><dd className="font-semibold text-[var(--fg)]">{summary.total}</dd></div>
          <div className="flex gap-2"><dt className="text-[var(--fg-muted)]">En cours</dt><dd className="font-semibold text-[var(--fg)]">{summary.running}</dd></div>
          <div className="flex gap-2"><dt className="text-[var(--fg-muted)]">Terminées déclarées</dt><dd className="font-semibold text-[var(--fg)]">{summary.completed}</dd></div>
          {summary.failed > 0 && <div className="flex gap-2"><dt className="text-[var(--fg-muted)]">Échouées</dt><dd className="font-semibold text-[var(--fg)]">{summary.failed}</dd></div>}
        </dl>
        {reviewTotal > 0 && <Link href={missionPageHref({page:1,q:"",status:"review"}) as Route} className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-[var(--marigold)]/30 px-3 text-sm text-[var(--marigold)] focus-visible:outline-2 focus-visible:outline-amber-300">{reviewTotal} mission(s) à examiner — ouvrir les décisions</Link>}
      </header>

      <section aria-label="Recherche dans toutes les missions" className="rounded-2xl border border-neutral-800 p-4">
        {pageRecovered && <p role="status" className="mb-3 text-sm text-amber-200">La page demandée n’existe plus. La première page est affichée.</p>}
        <details open={Boolean(filter.q || filter.status !== "all")}>
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-neutral-200 focus-visible:outline-2 focus-visible:outline-amber-300">Rechercher dans les missions</summary>
        <form key={missionPageHref(filter)} action="/hq/missions" className="flex flex-wrap items-end gap-3">
          <label className="grid min-w-0 w-full gap-2 text-sm text-neutral-300 sm:w-auto">Titre ou objectif, tout l’historique
            <input name="q" type="search" maxLength={200} defaultValue={filter.q} className="min-h-11 w-full min-w-0 rounded-lg border border-[var(--fg-faint)] bg-neutral-900 px-3" />
          </label>
          <label className="grid min-w-0 w-full gap-2 text-sm text-neutral-300 sm:w-auto">Statut ou besoin de revue
            <select name="status" defaultValue={filter.status} className="min-h-11 w-full min-w-0 rounded-lg border border-[var(--fg-faint)] bg-neutral-900 px-3">
              <option value="all">Tous les statuts</option><option value="review">Approbation requise (tous motifs)</option>
              {Object.entries(missionStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <button className="min-h-11 rounded-lg bg-amber-400 px-4 text-sm font-semibold text-neutral-950">Rechercher</button>
          <Link href="/hq/missions" className="p-3 text-sm text-neutral-300 underline">Réinitialiser</Link>
        </form>
        </details>
        <p role="status" className="mt-4 text-sm text-neutral-300">{filteredTotal} résultat(s) sur {summary.total} missions. {missions.length ? `${(filter.page - 1) * MISSION_PAGE_SIZE + 1}–${(filter.page - 1) * MISSION_PAGE_SIZE + missions.length}` : "0"} affiché(s), plus récentes en premier.</p>
        <nav aria-label="Pages des missions" className="mt-3 flex flex-wrap items-center gap-4 text-sm text-amber-200">
          {filter.page > 1 && <Link href={missionPageHref(filter, filter.page - 1) as Route}>Page précédente</Link>}
          <span>Page {filter.page} / {pages}</span>
          {filter.page < pages && <Link href={missionPageHref(filter, filter.page + 1) as Route}>Page suivante</Link>}
          {filter.page > pages && <Link href={missionPageHref(filter, 1) as Route}>Revenir à la première page</Link>}
        </nav>
      </section>
      {dossierMissions.length === 0 && <DevelopmentMissionForm key="development-form" workspaceId={activeWorkspace.id} />}
      <section key="selected-dossier" id="requested-mission" aria-label="Mission sélectionnée">
        {params.mission !== undefined && !requestedMission && <p role="status" className="mb-4 rounded-xl border border-amber-500/30 p-4 text-sm text-amber-200">{requestedReadFailed ? "Lecture de cette mission indisponible. Actualise pour réessayer." : "Cette mission est introuvable dans le projet et le mode actifs."}</p>}
        <MissionDossier key={`${missionPageHref(filter)}:${requestedId ?? ""}`} missions={clientDossierMissions} ownerSpecEvidence={ownerSpecEvidence} initialSelectedId={requestedMission?.id} source={source} transferEnabled={transferEnabled} openHandsEnabled={process.env.ORIA_ENABLE_OPENHANDS_CONFIRMATION === "1"} toolReviewEnabled={process.env.ORIA_ENABLE_OPENHANDS_TOOL_REVIEW === "1"} launchEnabled={process.env.ORIA_ENABLE_OPENHANDS_LAUNCH === "1"} paginated />
      </section>
      {dossierMissions.length > 0 && <DevelopmentMissionForm key="development-form" workspaceId={activeWorkspace.id} />}

      {reviewMissions.length > 0 && <section id="mission-approval" aria-label="Décisions des missions affichées">
        <HqWidget title="Approbations — dossier et page affichés" eyebrow="Human gate" icon={ShieldAlert}>
          <MissionApprovalPanel missions={clientReviewMissions} />
        </HqWidget>
      </section>}

      <details className="rounded-2xl border border-[var(--border)] p-4"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-amber-300">Vue Kanban</summary>
      <HqWidget title="Kanban — résultats de cette page" eyebrow="Pipeline" icon={LayoutDashboard}>
        {hasMissions ? (
          <MissionKanbanBoard missions={clientPageMissions} />
        ) : (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-neutral-800 bg-neutral-950/40 px-4 py-24 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-900 shadow-inner">
              <Bot className="h-8 w-8 text-amber-400" />
            </div>
            <div className="mt-6 max-w-md">
              <h2 className="text-xl font-semibold text-white">{summary.total === 0 ? "Aucune donnée — rien n’a encore été enregistré" : "Aucun résultat sur cette page"}</h2>
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
      </details>
      <details className="rounded-2xl border border-[var(--border)] p-4"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-amber-300">Suivi technique</summary><OrchestrationProjection key={activeWorkspace.id} workspaceId={activeWorkspace.id} /></details>

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
