"use client";
import { useRef, useState } from "react";
type RecordView = { id: string; type: string; title: string | null; content: string | null; provenance: string | null; confidence: number | null; updatedAt: string | null };
export function MemexReadPanel() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState("idle");
  const [records, setRecords] = useState<RecordView[]>([]);
  const [sampled, setSampled] = useState(0);
  const busy = useRef(false);
  async function read() {
    if (busy.current) return;
    busy.current = true; setState("loading"); setRecords([]);
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(`/api/memory/search?q=${encodeURIComponent(query)}`, { cache: "no-store", signal: controller.signal });
      const body = await response.json();
      if (!response.ok || !["ready", "disabled", "unconfigured", "workspace_unbound"].includes(body.status)) throw new Error("unavailable");
      if (body.status === "ready") {
        if (!Array.isArray(body.records) || typeof body.sampled !== "number") throw new Error("invalid");
        setRecords(body.records); setSampled(body.sampled);
      }
      setState(body.status);
    } catch { setState("unavailable"); }
    finally { clearTimeout(timer); busy.current = false; }
  }
  const messages: Record<string, string> = {
    idle: "Lance une lecture pour vérifier la connexion et consulter les données du projet.",
    loading: "Lecture de Memex…", disabled: "Lecture Memex désactivée pour cette instance.",
    unconfigured: "Connexion Memex non configurée ou accès expiré.", workspace_unbound: "Ce projet n’est pas raccordé à Memex.",
    unavailable: "Lecture indisponible. Aucun résultat n’est confirmé ; tu peux réessayer.",
  };
  return <section className="rounded-2xl border border-emerald-500/20 bg-neutral-950/50 p-5" aria-labelledby="memex-read-title">
    <h2 id="memex-read-title" className="text-lg font-semibold text-white">Explorer la mémoire durable Memex</h2>
    <p className="mt-2 text-sm text-neutral-400">Lecture seule du projet. Le filtre porte sur un échantillon de 50 entrées au maximum, sans garantie de récence ni recherche exhaustive. Aucun modèle IA n’est appelé.</p>
    <form onSubmit={event => { event.preventDefault(); void read(); }} className="mt-4 flex flex-wrap gap-3">
      <label className="min-w-0 flex-1 text-sm text-neutral-300">Filtrer le texte (facultatif)<input value={query} onChange={event => setQuery(event.target.value)} maxLength={200} className="mt-2 block min-h-11 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 text-white" /></label>
      <button disabled={state === "loading"} className="min-h-11 self-end rounded-lg bg-emerald-400 px-4 font-semibold text-neutral-950 disabled:opacity-50">{state === "loading" ? "Lecture…" : "Consulter Memex"}</button>
    </form>
    <div role="status" className="mt-4 text-sm text-neutral-400">{state === "ready" ? `${records.length} résultat(s) dans ${sampled} entrée(s) consultée(s). ${records.length === 0 ? "Aucune correspondance dans cet échantillon." : "Publication et exactitude non vérifiées indépendamment par HQ."}` : messages[state]}</div>
    <ul className="mt-4 space-y-3">{records.map(record => <li key={record.id} className="rounded-xl border border-neutral-800 p-4">
      <h3 className="break-words font-medium text-white">{record.title || "Entrée sans titre"}</h3>
      <p className="mt-1 text-xs text-neutral-500">{record.type} · Confiance déclarée : {record.confidence === null ? "inconnue" : record.confidence}</p>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm text-neutral-300">{record.content || "Aucun texte consultable dans cette entrée."}</p>
      <details className="mt-3 text-xs text-neutral-400"><summary className="cursor-pointer">Provenance</summary><p className="mt-2 break-words">{record.provenance || "Source non renseignée"}</p><p className="mt-1 break-words">Référence : {record.id}</p><p className="mt-1">Mise à jour : {record.updatedAt || "inconnue"}</p></details>
    </li>)}</ul>
  </section>;
}
