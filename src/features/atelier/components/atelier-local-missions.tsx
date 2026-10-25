import { listMissions, missionView } from "@/server/atelier/atelier-mission";

/** Read-only panel: local subscription-CLI atelier missions (contract atelier-mission/v1). */
export function AtelierLocalMissions() {
  let missions: ReturnType<typeof missionView>[] = [];
  try { missions = listMissions().map(missionView); } catch { missions = []; }
  return (
    <section className="mb-6 rounded-2xl border border-neutral-800 bg-neutral-950/70 p-5 text-sm text-neutral-300" aria-labelledby="atelier-local-title">
      <h2 id="atelier-local-title" className="text-lg font-semibold text-white">Missions atelier locales (Codex abonnement)</h2>
      {missions.length === 0 ? <p className="mt-2">Aucune mission atelier locale.</p> : missions.map(m => (
        <article key={m.id} className="mt-4 rounded-xl border border-neutral-800 p-4">
          <h3 className="font-semibold text-white">{m.title} — <span className="text-amber-200">{m.status}</span></h3>
          <p className="mt-1">Branche {m.repo.branch} · HEAD {m.repo.headSha.slice(0, 7)} · modèle demandé {m.modelProof.requested} / observé {m.modelProof.observed ?? "inconnu"}</p>
          <ol className="mt-2 list-decimal pl-5">{m.steps.map(s => <li key={s.id}>{s.kind} : {s.status}{s.resumedFrom ? " (reprise)" : ""}{s.reason ? ` — ${s.reason}` : ""}</li>)}</ol>
          <ul className="mt-2 flex flex-wrap gap-2">{m.artifacts.map(a => (
            <li key={a.id}><a className="underline text-amber-200" href={`/api/atelier/missions/${m.id}/artifacts/${a.id}`}>{a.kind}</a></li>
          ))}</ul>
        </article>
      ))}
    </section>
  );
}
