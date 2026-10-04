"use client";

import { useEffect, useRef, useState } from "react";
import { loadOrchestration, reportedStatusLabel, type OrchestrationState } from "../orchestration-projection";

export function OrchestrationProjection({ workspaceId }: { workspaceId: string }) {
  const [state, setState] = useState<OrchestrationState>({ kind: "idle" });
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => { pending.current?.abort(); pending.current = null; }, []);

  async function refresh() {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setState({ kind: "loading" });
    const timeout = setTimeout(() => controller.abort(), 10000);
    const result = await loadOrchestration(workspaceId, controller.signal);
    clearTimeout(timeout);
    if (pending.current === controller && !controller.signal.aborted) setState(result);
    else if (pending.current === controller) setState({ kind: "unavailable", message: "Le délai de lecture est dépassé. Vous pouvez réessayer." });
  }

  return <section aria-label="Suivi de l’orchestration" aria-busy={state.kind === "loading"} className="min-w-0 rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h2 className="text-xl font-semibold text-white">Suivi de l’orchestration</h2><p className="mt-1 text-sm leading-6 text-neutral-400">Tâches de l’organisation Paperclip reliée à cet espace. Lecture seule.</p></div>
      <button type="button" onClick={refresh} disabled={state.kind === "loading"} className="min-h-11 rounded-lg border border-neutral-700 px-4 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-amber-300">{state.kind === "loading" ? "Lecture en cours…" : state.kind === "idle" ? "Charger le suivi" : "Actualiser le suivi"}</button>
    </div>
    <div role="status" className="mt-4 text-sm leading-6 text-neutral-300">
      {state.kind === "idle" && "Le suivi n’a pas encore été consulté. Chargez-le pour connaître l’état de la connexion et les tâches rapportées."}
      {state.kind === "loading" && "Consultation de Paperclip…"}
      {state.kind === "unavailable" && state.message}
      {state.kind === "ready" && `${state.snapshot.issues.length} tâche(s) affichée(s). Relevé du ${new Date(state.snapshot.observedAt).toLocaleString("fr-CA")}.`}
    </div>
    {state.kind === "ready" && <>
      <p className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-5 text-amber-200">Statuts rapportés par Paperclip. Validation indépendante, consommation et disponibilité des modèles : inconnues dans cette vue. Ces tâches ne sont pas encore associées aux dossiers HQ.</p>
      {state.snapshot.issues.length ? <ul aria-label="Tâches rapportées par Paperclip" className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">
        {state.snapshot.issues.map(issue => <li key={issue.id} className="min-w-0 break-words rounded-xl border border-neutral-800 p-4">
          <p className="text-xs text-amber-200">{reportedStatusLabel(issue.status)}</p><h3 className="mt-2 font-medium text-white">{issue.title}</h3>
          <p className="mt-2 text-xs text-neutral-400">{issue.assigneeAgentId ? "Agent attribué · nom non disponible" : "Aucun agent attribué"}</p>
          <p className="mt-1 text-xs text-neutral-400">Mise à jour rapportée : {new Date(issue.updatedAt).toLocaleString("fr-CA")}</p>
        </li>)}
      </ul> : <p className="mt-4 text-sm text-neutral-400">Aucune tâche renvoyée pour cette organisation.</p>}
      {state.snapshot.page.mayHaveMore && <p className="mt-3 text-xs text-amber-200">Les 50 tâches les plus récemment mises à jour sont affichées. D’autres peuvent exister ; ce nombre n’est pas un total.</p>}
    </>}
  </section>;
}
