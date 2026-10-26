"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveAgentDisplayName } from "../actions/display-names";
import { normalizeAgentDisplayName } from "../display-name";

export function AgentNameEditor({ agentId, name, defaultName, available }: {
  agentId: string; name: string; defaultName: string; available: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null);
  async function save(reset: boolean) {
    if (busy || !available) return;
    const next = reset ? null : normalizeAgentDisplayName(value);
    if (!reset && !next) { setFeedback({ error: true, text: "Saisis un nom de 1 à 80 caractères." }); return; }
    setBusy(true); setFeedback(null);
    try {
      const result = await saveAgentDisplayName({ agentId, displayName: next });
      if (result.status !== "saved") { setFeedback({ error: true, text: result.message }); return; }
      setValue(result.displayName ?? defaultName);
      setFeedback({ error: false, text: reset ? "Nom par défaut rétabli." : "Nom enregistré dans le stockage durable." });
      router.refresh();
    } catch { setFeedback({ error: true, text: "Sauvegarde non confirmée. Le nom n’a pas été annoncé comme enregistré." }); }
    finally { setBusy(false); }
  }
  return (
    <details className="border-t border-neutral-800 pt-3">
      <summary className="min-h-11 cursor-pointer text-sm text-amber-200 focus-visible:outline-2 focus-visible:outline-amber-400">Modifier le nom d’affichage</summary>
      <p className="mb-3 text-xs text-neutral-400">Identité, historique et permissions restent inchangés.</p>
      {!available && <p role="status" className="mb-3 text-sm text-amber-200">Renommage indisponible : stockage durable non provisionné ou non qualifié.</p>}
      <form onSubmit={event => { event.preventDefault(); void save(false); }}>
        <label className="block text-sm text-neutral-300">Nom d’affichage
          <input value={value} onChange={event => setValue(event.target.value)} maxLength={160} disabled={!available || busy}
            className="mt-2 min-h-11 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 text-white focus-visible:outline-2 focus-visible:outline-amber-400 disabled:opacity-60" />
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="submit" disabled={!available || busy} className="min-h-11 rounded-lg border border-amber-500/40 px-3 text-sm text-amber-200 disabled:opacity-50">{busy ? "Sauvegarde…" : "Enregistrer le nom"}</button>
          <button type="button" disabled={!available || busy} onClick={() => void save(true)} className="min-h-11 rounded-lg border border-neutral-700 px-3 text-sm text-neutral-300 disabled:opacity-50">Rétablir le défaut</button>
        </div>
      </form>
      {feedback && <p role={feedback.error ? "alert" : "status"} className="mt-2 text-sm text-neutral-300">{feedback.text}</p>}
    </details>
  );
}
