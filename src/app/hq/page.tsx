import Link from "next/link";
import { LogOut, Sparkles } from "lucide-react";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { CockpitShell } from "@/features/cockpit/components/cockpit-shell";
import { AgendaPanel } from "@/features/hq/components/agenda-panel";
import { CommandCenter } from "@/features/hq/components/command-center";
import { HomeMissionOverview } from "@/features/hq/components/home-mission-overview";
import { HqPageHeader } from "@/features/hq/components/hq-widget-system";
import { MissionDraftPendingPanel } from "@/features/hq/components/mission-draft-pending-panel";
import { OwnerAccessDenied } from "@/features/hq/components/owner-access-denied";
import { listActionLedgerForWorkspace } from "@/server/actions/action-ledger-read";
import { signOutAction } from "@/server/auth/actions";
import { requireOwnerAccess } from "@/server/auth/owner";
import { listLocalMissionDrafts, listMissionsForWorkspace } from "@/server/missions";

export const dynamic = "force-dynamic";

export default async function HqPage() {
  const access = await requireOwnerAccess("/hq");
  if (access.status === "forbidden") return <OwnerAccessDenied email={access.user.email} />;
  const { activeWorkspace, activeMode } = getActiveWorkspaceContext();
  const [missionRead, activityRead] = await Promise.allSettled([
    listMissionsForWorkspace({ workspaceId: activeWorkspace.id, modeId: activeMode.id }),
    listActionLedgerForWorkspace({ workspaceId: activeWorkspace.id, limit: 8 }),
  ]);
  // The repository's local fallback includes examples. Only actual session drafts belong here.
  const missions = missionRead.status === "fulfilled"
    ? missionRead.value.source === "supabase" ? missionRead.value.missions
      : listLocalMissionDrafts(activeWorkspace.id, activeMode.id)
    : [];
  return (
    <CockpitShell active="hq" crumb="HQ">
      <HqPageHeader eyebrow={activeWorkspace.displayName} icon={Sparkles} title="Que veux-tu accomplir ?"
        description="Décris ton objectif, examine la proposition, puis suis les résultats de tes missions.">
        <form action={signOutAction}>
          <button className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-neutral-700 px-3 text-sm text-neutral-300 hover:bg-neutral-800">
            <LogOut className="h-4 w-4" aria-hidden="true" /> Déconnexion
          </button>
        </form>
      </HqPageHeader>
      <CommandCenter />
      <MissionDraftPendingPanel />
      <HomeMissionOverview
        missions={missions.map(({ id, title, objective, status, updatedAt }) => ({ id, title, objective, status, updatedAt }))}
        missionSource={missionRead.status === "fulfilled" ? missionRead.value.source === "supabase" ? "supabase" : "local" : "unavailable"}
        activity={activityRead.status === "fulfilled" ? activityRead.value.entries.map(({ id, summary, createdAt }) => ({ id, summary, createdAt })) : []}
        activitySource={activityRead.status === "fulfilled" ? activityRead.value.source : "unavailable"}
      />
      <details className="rounded-2xl border border-neutral-800 bg-neutral-950/50 p-5">
        <summary className="cursor-pointer font-semibold text-neutral-100">Consulter mon agenda</summary>
        <div className="mt-5"><AgendaPanel /></div>
      </details>
      <details className="rounded-2xl border border-neutral-800 bg-neutral-950/50 p-5">
        <summary className="cursor-pointer font-semibold text-neutral-100">Équipe, mémoire et outils</summary>
        <p className="mt-3 text-sm text-neutral-400">Consulte les capacités et connexions dans leurs espaces dédiés. Leur présence ne signifie pas qu’un agent est en cours d’exécution.</p>
        <nav aria-label="Ressources du projet" className="mt-4 flex flex-wrap gap-3 text-sm text-amber-300">
          <Link href="/hq/agents" className="rounded-lg border border-neutral-700 px-4 py-3 hover:bg-neutral-800">Équipe</Link>
          <Link href="/hq/memory" className="rounded-lg border border-neutral-700 px-4 py-3 hover:bg-neutral-800">Mémoire partagée</Link>
          <Link href="/hq/runtime" className="rounded-lg border border-neutral-700 px-4 py-3 hover:bg-neutral-800">Connexions</Link>
          <Link href="/hq/skills" className="rounded-lg border border-neutral-700 px-4 py-3 hover:bg-neutral-800">Compétences</Link>
        </nav>
      </details>
    </CockpitShell>
  );
}
