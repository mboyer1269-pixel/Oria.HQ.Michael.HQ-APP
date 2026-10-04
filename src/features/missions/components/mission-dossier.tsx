"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Mission } from "@/core/types";
import { missionDossierSummary, missionReportedOutput, missionStatusLabels } from "../mission-dossier";
import { MissionResultPanel } from "./mission-result-panel";
import { OpenHandsPreparation } from "./openhands-preparation";
import { MissionTransfer } from "./mission-transfer";
import { OpenHandsToolReview } from "./openhands-tool-review";
import { OpenHandsLaunch } from "./openhands-launch";

type Props = { missions: Mission[]; source: "supabase" | "local" | "mock"; transferEnabled?: boolean; paginated?: boolean; openHandsEnabled?: boolean; toolReviewEnabled?:boolean; launchEnabled?:boolean };

export function MissionDossier({ missions, source, transferEnabled = false, paginated = false, openHandsEnabled = false, toolReviewEnabled=false, launchEnabled=false }: Props) {
  const [selectedId, setSelectedId] = useState(missions[0]?.id ?? "");
  const [filter, setFilter] = useState("");
  const router = useRouter();
  const visible = missions.filter((mission) => `${mission.title} ${mission.objective}`.toLocaleLowerCase("fr").includes(filter.toLocaleLowerCase("fr")));
  const selected = visible.find((mission) => mission.id === selectedId) ?? visible[0];
  const dossier = selected ? missionDossierSummary(selected) : null;
  const launch=selected?.input._openhandsLaunch as {launchId?:unknown;state?:unknown}|undefined;
  const launchId=typeof launch?.launchId==='string'&&/^[a-f0-9-]{36}$/.test(launch.launchId)?launch.launchId:null;

  return (
    <section aria-label="Dossier de mission" className="min-w-0 rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Dossier de mission</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-neutral-400">Retrouver l’objectif, le responsable et le résultat attendu au même endroit.</p>
        </div>
        <button type="button" onClick={() => router.refresh()} className="min-h-11 rounded-lg border border-neutral-700 px-4 text-sm text-neutral-200 hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-amber-300">Actualiser les missions</button>
      </div>
      <p className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-5 text-amber-200">
        {source === "supabase" ? "Missions enregistrées sur le serveur. Le statut rapporté ne constitue pas une validation indépendante."
          : "Mode local de développement : exemples et brouillons temporaires. Ces données ne prouvent aucune exécution réelle et peuvent disparaître au redémarrage."}
      </p>
      <div className="mt-5 grid min-w-0 gap-5 md:grid-cols-[minmax(180px,1fr)_minmax(0,2fr)]">
        <div className="min-w-0">
          {!paginated && <><label htmlFor="mission-search" className="text-sm font-medium text-neutral-300">Rechercher une mission</label>
          <input id="mission-search" value={filter} onChange={(event) => setFilter(event.target.value)} type="search" className="mt-2 min-h-11 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 text-sm text-white focus-visible:outline-2 focus-visible:outline-amber-300" /></>}
          <ul className="mt-3 space-y-2" aria-label="Missions disponibles">
            {visible.map((mission) => <li key={mission.id}><button type="button" aria-pressed={selected?.id === mission.id} onClick={() => setSelectedId(mission.id)} className={`min-h-11 w-full break-words rounded-lg border p-3 text-left focus-visible:outline-2 focus-visible:outline-amber-300 ${selected?.id === mission.id ? "border-amber-400/50 bg-amber-500/10 text-amber-100" : "border-neutral-800 text-neutral-300 hover:bg-neutral-900"}`}><span className="block text-sm font-medium">{mission.title}</span><span className="mt-1 block text-xs text-neutral-400">{missionStatusLabels[mission.status]}</span></button></li>)}
          </ul>
          <p role="status" className="mt-3 text-xs text-neutral-400">{visible.length} mission{visible.length !== 1 ? "s" : ""} affichée{visible.length !== 1 ? "s" : ""}</p>
        </div>
        {selected && dossier ? <article className="min-w-0 break-words rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 sm:p-5" aria-label={`Dossier : ${selected.title}`}>
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-300">{dossier.status}</p>
          <h3 className="mt-2 text-lg font-semibold text-white">{selected.title}</h3>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-neutral-300">{selected.objective}</p>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            <div><dt className="text-xs text-neutral-400">Responsable</dt><dd className="mt-1 text-sm text-white">{dossier.owner}</dd></div>
            <div><dt className="text-xs text-neutral-400">Budget autorisé</dt><dd className="mt-1 text-sm text-white">{dossier.budget}</dd></div>
            <div><dt className="text-xs text-neutral-400">Consommation observée</dt><dd className="mt-1 text-sm text-neutral-300">Inconnue</dd></div>
            <div><dt className="text-xs text-neutral-400">Validation indépendante</dt><dd className="mt-1 text-sm text-neutral-300">Non reliée à ce dossier</dd></div>
          </dl>
          <h4 className="mt-6 text-sm font-semibold text-white">Résultat attendu</h4><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-300">{selected.expectedOutput}</p>
          <MissionResultPanel key={`result:${selected.id}`} output={missionReportedOutput(selected)} source={source} />
          <p className="mt-5 border-t border-neutral-800 pt-4 text-sm leading-6 text-amber-200">{dossier.nextStep}</p>
          <OpenHandsPreparation key={`openhands:${selected.id}:${selected.updatedAt}`} mission={selected} source={source} enabled={openHandsEnabled} />
          {launchEnabled&&openHandsEnabled&&source==='supabase'&&selected.input._openhandsReservation!==undefined&&<OpenHandsLaunch key={`launch:${selected.id}:${selected.updatedAt}`} mission={selected} onRefresh={()=>router.refresh()} />}
          {toolReviewEnabled&&source==='supabase'&&launchId&&launch?.state==='running'&&<OpenHandsToolReview key={launchId} launchId={launchId} missionId={selected.id} />}
          <MissionTransfer key={`${selected.id}:${selected.updatedAt}`} mission={selected} source={source} enabled={transferEnabled} />
          <details className="mt-5 text-xs text-neutral-400"><summary className="min-h-11 cursor-pointer py-3 focus-visible:outline-2 focus-visible:outline-amber-300">Référence et limites du dossier</summary><p className="break-all">{selected.id}</p><p className="mt-2 leading-5">Les sous-tâches, versions de contexte, preuves et discussions ne sont pas encore reliées à cette vue. Le dossier lit la mission existante sans créer une seconde copie.</p></details>
        </article> : <p className="rounded-xl border border-dashed border-neutral-700 p-6 text-sm text-neutral-400">{paginated ? "Aucun résultat sur cette page. Modifiez les filtres ou revenez à la première page." : missions.length ? "Aucune mission ne correspond. Modifiez votre recherche." : "Aucune mission disponible. Une mission créée dans HQ apparaîtra ici après actualisation."}</p>}
      </div>
    </section>
  );
}
