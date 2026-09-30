"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Mission } from "@/core/types";

type Source = "supabase" | "local" | "unavailable";
type MissionPreview = Pick<Mission, "id" | "title" | "objective" | "status" | "updatedAt">;
const labels: Record<Mission["status"], string> = {
  draft: "Brouillon", queued: "En attente", running: "En cours déclaré", needs_approval: "Décision attendue",
  completed: "Terminée déclarée", failed: "Échouée", cancelled: "Annulée",
};
function sourceLabel(source: Source) {
  return source === "supabase" ? "Données enregistrées" : source === "local" ? "Session temporaire · non persistée" : "Lecture indisponible";
}
function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("fr-CA", { timeZone: "America/Toronto", dateStyle: "medium", timeStyle: "short" }) : "Date inconnue";
}

export function HomeMissionOverview({ missions, missionSource, activity, activitySource }: {
  missions: MissionPreview[];
  missionSource: Source;
  activity: { id: string; summary: string; createdAt: string }[];
  activitySource: Source;
}) {
  const [filter, setFilter] = useState<"all" | "attention" | "draft">("all");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const visible = missions.filter((mission) => filter === "all" || (filter === "draft" ? mission.status === "draft" : mission.status === "needs_approval" || mission.status === "failed"));
  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-[1.4fr_1fr]">
      <section aria-labelledby="home-missions-title" className="min-w-0 rounded-2xl border border-neutral-800 bg-neutral-950/50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="home-missions-title" className="text-lg font-semibold text-white">Mes missions</h2>
          <button disabled={pending} onClick={() => startTransition(() => router.refresh())} className="min-h-10 rounded-lg border border-neutral-700 px-3 text-sm text-neutral-300 hover:bg-neutral-800 disabled:opacity-50">{pending ? "Actualisation…" : "Actualiser"}</button>
        </div>
        <p className="mt-1 text-xs text-neutral-400">{sourceLabel(missionSource)}</p>
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filtrer les missions">
          {([ ["all", "Toutes"], ["attention", "À examiner"], ["draft", "Brouillons"] ] as const).map(([value, label]) => (
            <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)} className={`min-h-10 rounded-lg border px-3 text-sm ${filter === value ? "border-amber-500/50 bg-amber-500/10 text-amber-200" : "border-neutral-800 text-neutral-400 hover:bg-neutral-800"}`}>{label}</button>
          ))}
        </div>
        <div aria-live="polite" aria-busy={pending} className="mt-4 space-y-3">
          {missionSource === "unavailable" ? <p className="text-sm text-amber-200">Impossible de lire les missions. Actualise pour réessayer ; aucune absence de mission n’est confirmée.</p>
            : visible.length === 0 ? <p className="py-4 text-sm text-neutral-400">{missions.length === 0 ? "Aucune mission enregistrée dans cette source. Commence par décrire ton objectif ci-dessus." : "Aucune mission pour ce filtre."}</p>
              : visible.slice(0, 6).map((mission) => (
                <details key={mission.id} className="rounded-xl border border-neutral-800 p-3">
                  <summary className="cursor-pointer break-words text-sm font-medium text-neutral-100">{mission.title}<span className="ml-2 text-xs font-normal text-amber-200">{labels[mission.status]}</span></summary>
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm text-neutral-400">{mission.objective}</p>
                  <p className="mt-2 text-xs text-neutral-500">Mise à jour : {dateLabel(mission.updatedAt)}</p>
                </details>
              ))}
        </div>
        <p className="mt-4 text-xs text-neutral-500">Les statuts sont déclarés ; la validation du livrable reste dans le dossier.</p>
        <Link href="/hq/missions" className="mt-4 inline-flex min-h-10 items-center text-sm font-semibold text-amber-300 hover:underline">Ouvrir les dossiers de mission →</Link>
      </section>
      <section id="ledger-activity" aria-labelledby="home-activity-title" className="min-w-0 rounded-2xl border border-neutral-800 bg-neutral-950/50 p-5">
        <h2 id="home-activity-title" className="text-lg font-semibold text-white">Dernière activité</h2>
        <p className="mt-1 text-xs text-neutral-400">{sourceLabel(activitySource)} · espace de travail</p>
        {activitySource === "unavailable" ? <p className="mt-4 text-sm text-amber-200">Le journal est indisponible. Utilise Actualiser pour réessayer.</p>
          : activity.length === 0 ? <p className="mt-4 text-sm text-neutral-400">Aucune activité enregistrée dans cette source.</p>
            : <ol className="mt-4 divide-y divide-neutral-800">{activity.map((entry) => <li key={entry.id} className="py-3 first:pt-0"><p className="break-words text-sm text-neutral-300">{entry.summary}</p><time dateTime={entry.createdAt} className="mt-1 block text-xs text-neutral-500">{dateLabel(entry.createdAt)}</time></li>)}</ol>}
        <Link href="/hq/activity" className="mt-4 inline-flex min-h-10 items-center text-sm font-semibold text-amber-300 hover:underline">Consulter le journal détaillé →</Link>
      </section>
    </div>
  );
}
