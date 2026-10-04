"use client";
import { useRef, useState } from "react";
import { MEMEX_REVIEW_EVENT } from "./memex-review-panel";
import type { MemexProposalResult } from "@/server/memory/memex-proposal-service";
const states = ["proposed", "quarantined", "approved", "rejected", "publishing", "promoted"];
const labels: Record<string, string> = { proposed: "Proposition reçue, en attente de revue", quarantined: "En quarantaine", approved: "Approuvée, publication non confirmée", rejected: "Proposition rejetée", publishing: "Publication en cours", promoted: "Promotion déclarée par Memex" };
type Receipt = Extract<MemexProposalResult, { status: "received" }>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function parseReceiptHistory(raw: string | null): Receipt[] {
  if (!raw) return [];
  const rows: unknown = JSON.parse(raw);
  if (!Array.isArray(rows) || rows.length > 20 || rows.some(row => !row || row.status !== "received" || !uuid.test(row.requestId) || typeof row.proposalId !== "string" || !states.includes(row.proposalStatus) || row.publicationStatus !== "unknown")) throw Error("invalid history");
  return rows.map(row => ({ status: "received", requestId: row.requestId, proposalId: row.proposalId, proposalStatus: row.proposalStatus, publicationStatus: "unknown" }));
}
export function appendReceipt(history: Receipt[], receipt: Receipt): Receipt[] {
  return [receipt, ...history.filter(item => item.requestId !== receipt.requestId)].slice(0, 20);
}
export function MemexProposalPanel({ workspaceId }: { workspaceId: string }) {
  const storageKey = `hq:memex-proposal:${workspaceId}`;
  const [content, setContent] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [result, setResult] = useState<MemexProposalResult | { status: "request_denied" | "invalid_request" } | null>(null);
  const frozenContent = useRef<string | null>(null);
  const [contentLocked, setContentLocked] = useState(false);
  const [history, setHistory] = useState<Receipt[]>([]);
  const [storageError, setStorageError] = useState(false);
  const [busy, setBusy] = useState(false); const lock = useRef(false);
  async function send(receiptOnly: boolean, selectedId?: string, retry = false) {
    const retryAllowed = requestId && ["not_found", "request_denied", "invalid_request"].includes(result?.status ?? "");
    if (lock.current || (!receiptOnly && requestId && !(retry && retryAllowed))) return;
    if (selectedId && requestId && result?.status !== "received") return;
    lock.current = true; setBusy(true);
    let previous: string | null = null;
    try {
      previous = sessionStorage.getItem(storageKey);
      if (previous && !uuid.test(previous)) throw Error("invalid pending receipt");
      setHistory(parseReceiptHistory(sessionStorage.getItem(`${storageKey}:history`)));
      setStorageError(false);
    } catch { setStorageError(true); lock.current = false; setBusy(false); return; }
    if (selectedId && previous && previous !== selectedId && result?.status !== "received") { setRequestId(previous); setResult({ status: "outcome_unknown" }); lock.current = false; setBusy(false); return; }
    if (receiptOnly && !selectedId && !requestId && !previous) { setResult({ status: "not_found" }); lock.current = false; setBusy(false); return; }
    const id = selectedId ?? requestId ?? previous ?? crypto.randomUUID();
    if (!requestId && previous) receiptOnly = true;
    setRequestId(id);
    try { sessionStorage.setItem(storageKey, id); } catch { setStorageError(true); lock.current = false; setBusy(false); return; }
    if (!receiptOnly && frozenContent.current === null) { frozenContent.current = content; setContentLocked(true); }
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(receiptOnly ? `/api/memory/proposals?requestId=${encodeURIComponent(id)}` : "/api/memory/proposals", {
        method: receiptOnly ? "GET" : "POST", cache: "no-store", signal: controller.signal,
        ...(!receiptOnly ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: id, content: frozenContent.current ?? content }) } : {}),
      });
      const body = await response.json();
      if ((response.status === 403 && body?.status === "request_denied") || (response.status === 400 && body?.status === "invalid_request")) { setResult({ status: body.status }); return; }
      if (!response.ok || !body || !["received", "disabled", "unconfigured", "workspace_unbound", "unavailable", "outcome_unknown", "not_found", "conflict"].includes(body.status)) throw Error("unknown");
      if (body.status === "received" && (body.requestId !== id || typeof body.proposalId !== "string" || !states.includes(body.proposalStatus) || !["unknown", "pending", "complete"].includes(body.publicationStatus))) throw Error("unknown");
      setResult(body);
      if (body.status === "received") {
        try {
          const next = appendReceipt(parseReceiptHistory(sessionStorage.getItem(`${storageKey}:history`)), body);
          sessionStorage.setItem(`${storageKey}:history`, JSON.stringify(next)); setHistory(next);
        } catch { setStorageError(true); }
      }
    } catch { setResult({ status: receiptOnly ? "unavailable" : "outcome_unknown" }); }
    finally { clearTimeout(timer); lock.current = false; setBusy(false); }
  }
  const descriptions: Record<string, string> = {
    request_denied: "Envoi refusé avant transmission : origine non autorisée. Corrige la connexion puis réessaie avec le même identifiant.",
    invalid_request: "Requête refusée avant transmission. Vérifie les données ; le même identifiant reste réservé.",
    disabled: "Contribution désactivée pour cette instance.", unconfigured: "Contribution non configurée ou accès expiré.", workspace_unbound: "Ce projet n’est pas raccordé pour contribuer.",
    unavailable: "Reçu indisponible. Vérifie à nouveau sans renvoyer le contenu.", outcome_unknown: "Résultat de l’envoi inconnu. Vérifie le reçu ; aucun renvoi automatique.",
    not_found: "Aucun reçu retrouvé pour cet identifiant. Cela ne déclenche aucun nouvel envoi.", conflict: "Cet identifiant correspond à un autre contenu. Vérification nécessaire ; aucun renvoi.",
  };
  return <section className="rounded-2xl border border-neutral-800 bg-neutral-950/50 p-5" aria-labelledby="memex-proposal-title">
    <h2 id="memex-proposal-title" className="text-lg font-semibold text-white">Proposer une connaissance</h2>
    <p className="mt-2 text-sm text-neutral-400">La contribution est soumise à Memex pour revue. Elle n’est ni validée ni publiée automatiquement par HQ.</p>
    <p className="mt-2 text-xs text-neutral-500">Les 20 derniers reçus sont conservés pour cette session et ce projet uniquement. Aucun contenu n’est enregistré dans le navigateur. Une réponse incertaine doit être résolue avant une nouvelle proposition.</p>
    {storageError && <p role="alert" className="mt-3 text-sm text-amber-200">Le suivi de session est indisponible ou corrompu. Aucun nouvel envoi autorisé ; conserve l’identifiant visible pour vérifier le reçu.</p>}
    <button disabled={busy} onClick={() => void send(true)} className="mt-3 min-h-11 rounded-lg border border-neutral-700 px-4 text-sm text-neutral-300">Retrouver le reçu de cette session</button>
    <form onSubmit={event => { event.preventDefault(); void send(false); }} className="mt-4">
      <label className="text-sm text-neutral-300">Contenu et sources utiles<textarea required maxLength={8000} disabled={busy || (requestId !== null && contentLocked)} value={content} onChange={event => setContent(event.target.value)} rows={5} className="mt-2 block w-full rounded-lg border border-neutral-700 bg-neutral-900 p-3 text-white disabled:opacity-60" /></label>
      {!requestId && <button disabled={busy || !content.trim()} className="mt-3 min-h-11 rounded-lg bg-amber-400 px-4 font-semibold text-neutral-950 disabled:opacity-50">Soumettre pour revue</button>}
    </form>
    <p role="status" className="mt-3 text-sm text-neutral-300">{busy ? "Vérification en cours…" : result?.status === "received" ? `${labels[result.proposalStatus]}. Publication complète non confirmée.` : result ? descriptions[result.status] : ""}</p>
    {requestId && <div className="mt-3"><p className="break-all text-xs text-neutral-500">Identifiant de suivi : {requestId}</p><button disabled={busy} onClick={() => void send(true)} className="mt-3 min-h-11 rounded-lg border border-neutral-700 px-4 text-sm text-amber-200 disabled:opacity-50">Vérifier le reçu</button></div>}
    {requestId && ["not_found", "request_denied", "invalid_request"].includes(result?.status ?? "") && <div className="mt-3"><p className="text-xs text-neutral-400">Réessaie le contenu original. Après actualisation, ressaisis-le à l’identique ; Memex refusera une collision avec un contenu différent.</p><button disabled={busy || !content.trim() || storageError} onClick={() => void send(false, undefined, true)} className="mt-2 min-h-11 rounded-lg border border-amber-500/40 px-4 text-sm text-amber-200 disabled:opacity-50">Réessayer cette proposition avec le même identifiant</button></div>}
    {result?.status === "received" && <button disabled={busy || storageError} onClick={() => {
      if (lock.current || result.status !== "received") return;
      try { sessionStorage.removeItem(storageKey); } catch { setStorageError(true); return; }
      setRequestId(null); setResult(null); setContent(""); frozenContent.current = null; setContentLocked(false);
    }} className="mt-3 min-h-11 rounded-lg bg-amber-400 px-4 font-semibold text-neutral-950 disabled:opacity-50">Nouvelle proposition</button>}
    {history.length > 0 && <details className="mt-5 text-sm text-neutral-300" open><summary className="cursor-pointer">Reçus de cette session ({history.length}/20)</summary><ul className="mt-3 space-y-3">{history.map(receipt => <li key={receipt.requestId} className="rounded-lg border border-neutral-800 p-3"><p>{labels[receipt.proposalStatus]}</p><p className="break-all text-xs text-neutral-500">Demande : {receipt.requestId}<br />Proposition : {receipt.proposalId}</p><button disabled={busy || (!!requestId && result?.status !== "received")} onClick={() => void send(true, receipt.requestId)} className="mt-2 min-h-10 text-amber-200 disabled:opacity-50">Actualiser ce reçu</button><button onClick={() => window.dispatchEvent(new CustomEvent(MEMEX_REVIEW_EVENT, { detail: receipt.proposalId }))} className="ml-3 min-h-10 text-amber-200">Examiner cette proposition</button></li>)}</ul></details>}
  </section>;
}
