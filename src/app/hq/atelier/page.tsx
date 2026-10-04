import type { Route } from "next";
import Link from "next/link";
import { FileText } from "lucide-react";
import { missionDossierId } from "@/features/missions/development-mission-handoff";
import { missionReportedOutput } from "@/features/missions/mission-dossier";
import { CockpitShell } from "@/features/cockpit/components/cockpit-shell";
import { HqPageHeader, HqSummaryRail, HqMetric } from "@/features/hq/components/hq-widget-system";
import { OwnerAccessDenied } from "@/features/hq/components/owner-access-denied";
import { requireOwnerAccess } from "@/server/auth/owner";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { createDevelopmentStore } from "@/server/missions/development-mission";

export const dynamic = "force-dynamic";

export default async function AtelierPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await requireOwnerAccess("/hq/atelier");
  if (access.status === "forbidden") return <OwnerAccessDenied email={access.user.email} />;

  const params = await searchParams;
  const missionId = missionDossierId(params.mission);
  const { activeWorkspace } = getActiveWorkspaceContext();
  const mission = missionId ? await createDevelopmentStore()?.load(activeWorkspace.id, missionId) : null;
  const output = mission ? missionReportedOutput(mission) : null;
  const receipt = output?.receipt ?? null;
  const modelExecution = receipt?.report.modelExecution;

  return (
    <CockpitShell active="missions" crumb="Atelier">
      <HqPageHeader
        backHref={(missionId ? `/hq/missions?mission=${missionId}#requested-mission` : "/hq/missions") as Route}
        eyebrow="Atelier"
        icon={FileText}
        tone="amber"
        title="Résultat de mission"
        description="Surface de lecture du résultat agent. Elle ouvre le reçu persistant de la mission sans relancer OpenHands ni valider le livrable à la place du propriétaire."
      >
        <HqSummaryRail>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Preuve</p>
          <div className="mt-3 grid gap-2">
            <HqMetric label="Mission" value={mission ? "trouvée" : "absente"} tone={mission ? "emerald" : "amber"} />
            <HqMetric label="Résultat" value={receipt ? receipt.report.executionState : "absent"} tone={receipt?.report.executionState === "agent_returned" ? "emerald" : "amber"} />
            <HqMetric label="Validation indépendante" value={receipt?.report.independentValidationPassed ? "oui" : "non"} />
          </div>
        </HqSummaryRail>
      </HqPageHeader>

      {!mission ? (
        <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 text-sm text-amber-100">
          Mission introuvable dans le workspace actif.
        </section>
      ) : !receipt ? (
        <section className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-5 text-sm text-neutral-300">
          <h2 className="text-lg font-semibold text-white">{mission.title}</h2>
          <p className="mt-2">Aucun reçu OpenHands lié et terminé n’est enregistré pour cette mission.</p>
          <Link href={`/hq/missions?mission=${mission.id}#requested-mission` as Route} className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-neutral-700 px-4 text-amber-200">
            Revenir au dossier mission
          </Link>
        </section>
      ) : (
        <section className="min-w-0 rounded-2xl border border-neutral-800 bg-neutral-950/70 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">Mission approuvée visible</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">{mission.title}</h2>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-neutral-300">{mission.objective}</p>

          <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
              <dt className="text-neutral-500">État agent</dt>
              <dd className="mt-1 font-semibold text-emerald-200">{receipt.report.executionState}</dd>
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
              <dt className="text-neutral-500">Résumé</dt>
              <dd className="mt-1 font-semibold text-neutral-200">{receipt.report.summary.status === "present" ? "présent" : "absent / non inventé"}</dd>
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
              <dt className="text-neutral-500">Modèle ACP demandé</dt>
              <dd className="mt-1 break-all font-semibold text-white">{modelExecution?.requestedModelId ?? "inconnu"}</dd>
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
              <dt className="text-neutral-500">Modèle ACP confirmé</dt>
              <dd className="mt-1 break-all font-semibold text-white">{modelExecution?.acpConfirmedModelId ?? "inconnu"}</dd>
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3 sm:col-span-2">
              <dt className="text-neutral-500">Modèles fournisseur observés</dt>
              <dd className="mt-1 break-all font-semibold text-neutral-200">{modelExecution?.observedModelIds?.join(", ") || "inconnus"}</dd>
            </div>
          </dl>

          <div className="mt-6 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
            <h3 className="font-semibold text-white">Artefacts sélectionnés</h3>
            {receipt.report.files.length === 0 ? (
              <p className="mt-2 text-sm text-neutral-400">Aucun fichier ou diff sélectionné dans ce reçu. Le résultat agent est enregistré, mais il n’y a pas encore d’artefact de fichier à ouvrir.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {receipt.report.files.map((file) => (
                  <details key={file.path} className="rounded-lg border border-neutral-800 px-3">
                    <summary className="min-h-11 cursor-pointer break-words py-3 text-sm text-neutral-200 focus-visible:outline-2 focus-visible:outline-amber-300">{file.path} · {file.status}</summary>
                    {file.diff ? <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words bg-neutral-950 p-3 text-xs leading-5">{file.diff}</pre> : <p className="pb-3 text-xs text-neutral-400">Aucune différence de contenu dans ce reçu.</p>}
                  </details>
                ))}
              </div>
            )}
          </div>

          <Link href={`/hq/missions?mission=${mission.id}#requested-mission` as Route} className="mt-5 inline-flex min-h-11 items-center rounded-lg border border-neutral-700 px-4 text-sm font-semibold text-amber-200 transition hover:bg-neutral-900">
            Revenir au dossier mission
          </Link>
        </section>
      )}
    </CockpitShell>
  );
}
