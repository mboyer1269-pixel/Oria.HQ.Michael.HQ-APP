import type { Route } from "next";
import type { Mission } from "@/core/types";
import Link from "next/link";
import { FileText } from "lucide-react";
import { missionDossierId } from "@/features/missions/development-mission-handoff";
import { missionReportedOutput } from "@/features/missions/mission-dossier";
import { MissionResultPanel } from "@/features/missions/components/mission-result-panel";
import { CockpitShell } from "@/features/cockpit/components/cockpit-shell";
import { HqPageHeader, HqSummaryRail, HqMetric } from "@/features/hq/components/hq-widget-system";
import { OwnerAccessDenied } from "@/features/hq/components/owner-access-denied";
import { requireOwnerAccess } from "@/server/auth/owner";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { createDevelopmentStore } from "@/server/missions/development-mission";
import { readOwnerSpecEvidence } from "@/server/missions/atelier-owner-spec-read";
import { AtelierLocalMissions } from "@/features/atelier/components/atelier-local-missions";

export const dynamic = "force-dynamic";

export default async function AtelierPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await requireOwnerAccess("/hq/atelier");
  if (access.status === "forbidden") return <OwnerAccessDenied email={access.user.email} />;

  const params = await searchParams;
  const missionId = missionDossierId(params.mission);
  const { activeWorkspace, activeMode } = getActiveWorkspaceContext();
  let mission: Mission | null = null;
  let readUnavailable = false;
  if (missionId) {
    try {
      const store = createDevelopmentStore();
      if (!store) readUnavailable = true;
      else {
        const candidate = await store.load(activeWorkspace.id, missionId);
        // Match the dossier's server-derived scope; a URL never selects a workspace or mode.
        if (candidate?.id === missionId && candidate.workspaceId === activeWorkspace.id
          && candidate.modeId === activeMode.id) mission = candidate;
      }
    } catch { readUnavailable = true; }
  }
  const output = mission ? missionReportedOutput(mission, readOwnerSpecEvidence(mission, {
    workspaceId: activeWorkspace.id, modeId: activeMode.id, actorId: access.user.id,
  })) : null;
  const receipt = output?.receipt ?? null;

  return (
    <CockpitShell active="missions" crumb="Atelier">
      <HqPageHeader
        backHref={(missionId ? `/hq/missions?mission=${missionId}#requested-mission` : "/hq/missions") as Route}
        eyebrow="Atelier"
        icon={FileText}
        tone="amber"
        title="Résultat de mission"
        description="Surface de lecture du résultat agent. Elle ouvre le reçu persistant de la mission sans relancer un agent ni valider le livrable à la place du propriétaire."
      >
        <HqSummaryRail>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Preuve</p>
          <div className="mt-3 grid gap-2">
            <HqMetric label="Mission" value={readUnavailable ? "lecture indisponible" : mission ? "trouvée" : "absente"} tone={mission ? "emerald" : "amber"} />
            <HqMetric label="Résultat" value={readUnavailable ? "inconnu" : output?.atelierSpec?.state === "recorded" ? "reçu Atelier" : output?.atelierSpec?.state === "unverified" ? "non vérifié" : output?.atelierSpec?.state === "awaiting_result" ? "en attente" : receipt ? receipt.report.executionState : output?.state === "reported" ? "compte rendu" : "absent"} tone={receipt?.report.executionState === "agent_returned" ? "emerald" : "amber"} />
            <HqMetric label="Validation indépendante" value={receipt?.report.independentValidationPassed ? "oui" : "non"} />
          </div>
        </HqSummaryRail>
      </HqPageHeader>

      <AtelierLocalMissions workspaceId={activeWorkspace.id} />

      {readUnavailable ? (
        <section role="status" className="rounded-2xl border border-[var(--marigold)] p-5 text-sm text-[var(--fg)]">
          <h2 className="font-semibold">Lecture du résultat indisponible</h2>
          <p className="mt-2">Le serveur n’a pas confirmé la lecture. Cela ne signifie pas que la mission ou son résultat a disparu. Aucune exécution ni nouvelle tentative n’a été demandée.</p>
          <a href={`/hq/atelier?mission=${missionId}`} className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-[var(--fg-faint)] px-4 focus-visible:outline-2 focus-visible:outline-[var(--marigold)]">Réessayer la lecture</a>
        </section>
      ) : !mission ? (
        <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 text-sm text-amber-100">
          {missionId ? "Mission introuvable dans le projet et le mode actifs." : "Ouvrez le résultat depuis le dossier d’une mission."}
          <Link href="/hq/missions" className="mt-4 flex min-h-11 items-center underline focus-visible:outline-2 focus-visible:outline-amber-300">Ouvrir les missions</Link>
        </section>
      ) : (
        <section className="min-w-0 rounded-2xl border border-neutral-800 bg-neutral-950/70 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">Dossier de résultat</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">{mission.title}</h2>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-neutral-300">{mission.objective}</p>
          {!receipt && (!output?.atelierSpec || output.atelierSpec.state === "absent") && <p className="mt-3 text-sm text-neutral-400">Aucun reçu OpenHands lié et terminé n’est enregistré pour cette mission. Un compte rendu éventuel reste consultable ci-dessous, sans attester une exécution.</p>}
          <MissionResultPanel output={output!} source="supabase" showAtelierLink={false} />
          <Link href={`/hq/missions?mission=${mission.id}#requested-mission` as Route} className="mt-5 inline-flex min-h-11 items-center rounded-lg border border-neutral-700 px-4 text-sm font-semibold text-amber-200 transition hover:bg-neutral-900 focus-visible:outline-2 focus-visible:outline-amber-300">
            Revenir au dossier mission
          </Link>
        </section>
      )}
    </CockpitShell>
  );
}
