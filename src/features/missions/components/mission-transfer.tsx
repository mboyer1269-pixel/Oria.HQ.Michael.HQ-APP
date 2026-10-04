"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Mission } from "@/core/types";
import { missionTransferState, transferMission, type TransferState } from "../mission-transfer";

export function MissionTransfer({ mission, source, enabled }: { mission: Mission; source: "supabase" | "local" | "mock"; enabled: boolean }) {
  const [result, setResult] = useState<TransferState | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const inFlight = useRef(false);
  const router = useRouter();
  const state = result ?? missionTransferState(mission, source, enabled);
  function refresh() {
    // Only known pre-effect failures can release the local send lock.
    if (state.kind === "error") { inFlight.current = false; setResult(null); setConfirming(false); }
    router.refresh();
  }
  const button = "min-h-11 rounded-lg border border-neutral-700 px-4 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-amber-300";
  async function send() {
    if (inFlight.current || state.kind !== "available" || !confirming) return;
    inFlight.current = true; setSending(true);
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15000);
    try { setResult(await transferMission(mission, controller.signal)); }
    finally { clearTimeout(timer); setSending(false); setConfirming(false); router.refresh(); }
    // Do not unlock this mounted form after an uncertain response. The server receipt is authoritative.
  }
  return <section aria-label="Transfert de la mission" aria-busy={sending} className="mt-5 rounded-xl border border-neutral-700 p-4">
    <h4 className="text-sm font-semibold text-white">Transfert vers Paperclip</h4>
    <p role="status" className="mt-2 text-sm leading-6 text-neutral-300">{sending ? "Enregistrement du transfert… Ne renvoyez pas la demande." : state.message}</p>
    {state.remoteIssueId && <details className="mt-2 text-xs text-neutral-400"><summary className="min-h-11 cursor-pointer py-3">Référence de la tâche distante</summary><p className="break-all">{state.remoteIssueId}</p></details>}
    {state.kind === "available" && !confirming && <button type="button" className={`${button} mt-3`} onClick={() => setConfirming(true)}>Préparer le transfert</button>}
    {state.kind === "available" && confirming && <div className="mt-3 rounded-lg bg-amber-500/5 p-3">
      <p className="text-sm leading-6 text-amber-200">Confirmer l’envoi de « {mission.title} » avec son objectif et son résultat attendu ? La tâche sera créée dans les éléments à préparer de Paperclip, sans agent attribué.</p>
      <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={sending} className={button} onClick={send}>{sending ? "Transfert en cours…" : "Confirmer le transfert"}</button><button type="button" disabled={sending} className={button} onClick={() => setConfirming(false)}>Annuler</button></div>
    </div>}
    {(state.kind === "reconcile" || state.kind === "error") && <button type="button" className={`${button} mt-3`} onClick={refresh}>Actualiser le dossier</button>}
  </section>;
}
