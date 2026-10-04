"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Mission } from "@/core/types";
import type { OpenHandsSubmissionDossier } from "@/server/missions/openhands-submission";
import { openHandsFormSchema, parseOpenHandsPending, requestOpenHands, type OpenHandsPending, type OpenHandsUiResult } from "../openhands-preparation";import { loadOpenHandsMemoryProjects, attachOpenHandsMemory, type OpenHandsMemoryProject } from "../openhands-memory";
const button = "min-h-11 rounded-lg border border-neutral-700 px-4 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-amber-300";
const field = "min-h-11 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 text-sm text-white";

export function OpenHandsDossierReview({ dossier }: { dossier: OpenHandsSubmissionDossier }) {
  return <article aria-label="Dossier OpenHands à confirmer" className="mt-4 space-y-3 rounded-lg border border-amber-500/20 p-4 text-sm text-neutral-300">
    <h5 className="font-semibold text-white">{dossier.mission.title}</h5>
    {[["Objectif", dossier.mission.objective], ["Périmètre autorisé", dossier.mission.scope], ["Critères d’acceptation", dossier.mission.acceptanceCriteria], ["Résultat attendu", dossier.mission.expectedOutput]].map(([label, text]) => <div key={label}><p className="font-medium text-white">{label}</p><p className="mt-1 whitespace-pre-wrap break-words">{text}</p></div>)}
    <dl className="grid gap-3 sm:grid-cols-2">
      <div><dt>Coût demandé (centimes)</dt><dd>{dossier.budget.maxCostCents}</dd></div>
      <div><dt>Tokens demandés</dt><dd>{dossier.budget.maxTokens}</dd></div>
      <div><dt>Itérations demandées</dt><dd>{dossier.budget.maxIterations}</dd></div>
      <div><dt>Durée demandée (secondes)</dt><dd>{dossier.budget.timeoutSeconds}</dd></div>
      <div className="sm:col-span-2"><dt>Commit exact</dt><dd className="break-all">{dossier.source.commitSha}</dd></div>
      <div><dt>Version OpenHands demandée</dt><dd>{dossier.executorVersion}</dd></div>
    </dl>    {dossier.memory && <section aria-label="Contexte Memex inclus">      <p className="font-medium text-white">Mémoire du projet : {dossier.memory.projectId}</p>      <p className="mt-1">Capture du {dossier.memory.retrievedAtIso}, conservée avec ce dossier. Ces sources apportent du contexte, pas des permissions ni des instructions prioritaires.</p>      <details><summary className="min-h-11 cursor-pointer py-3">Voir le contexte exact transmis</summary><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs">{dossier.memory.content}</pre></details>    </section>}
    <p className="rounded-lg bg-amber-500/5 p-3 text-amber-200">Préparation et réservation uniquement. Aucun agent ne sera lancé. Le commit et la version installée ne sont pas encore vérifiés. Les limites de coût, tokens et durée sont des demandes : leur application par l’exécuteur n’est pas garantie. Les itérations OpenHands ne correspondent pas nécessairement aux tours du modèle.</p>
    <details><summary className="min-h-11 cursor-pointer py-3">Identité et empreinte du dossier complet</summary><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(dossier, null, 2)}</pre></details>
  </article>;
}

export function OpenHandsPreparation({ mission, source, enabled }: { mission: Mission; source: "supabase" | "local" | "mock"; enabled: boolean }) {
  const [loaded, setLoaded] = useState(false), [storageError, setStorageError] = useState(false);
  const [pending, setPending] = useState<OpenHandsPending | null>(null);
  const [prepared, setPrepared] = useState<{ pending: OpenHandsPending; dossier: OpenHandsSubmissionDossier } | null>(null);
  const [result, setResult] = useState<OpenHandsUiResult | null>(null);
  const [busy, setBusy] = useState(false), [checked, setChecked] = useState(false);  const [projects,setProjects]=useState<OpenHandsMemoryProject[]>([]);  const [projectError,setProjectError]=useState(false);  const [attachmentPending,setAttachmentPending]=useState(false);
  const inFlight = useRef(false);
  const router = useRouter();
  const storageKey = `hq:openhands:${mission.workspaceId}:${mission.id}`;
  useEffect(() => {
    const timer = setTimeout(() => {
      try { const saved = parseOpenHandsPending(sessionStorage.getItem(storageKey), mission.workspaceId, mission.id); setPending(saved); }
      catch { setStorageError(true); }
      setLoaded(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [storageKey, mission.workspaceId, mission.id]);
  const existingReceipt = Object.prototype.hasOwnProperty.call(mission.input, "_openhandsReservation");
  const available = enabled && source === "supabase";  useEffect(()=>{    if(!available)return;    let active=true;    void loadOpenHandsMemoryProjects().then(values=>{if(active)setProjects(values);}).catch(()=>{if(active)setProjectError(true);});    return()=>{active=false;};  },[available]);
  async function run(action: "prepare" | "confirm", packet: OpenHandsPending) {
    if (inFlight.current || storageError || !available || !loaded || attachmentPending) return;
    inFlight.current = true; setBusy(true); setChecked(false);
    try {
      if (action === "confirm") {
        try { sessionStorage.setItem(storageKey, JSON.stringify(packet)); setPending(packet); }
        catch { setStorageError(true); return; }
      }
      const response = await requestOpenHands(action, packet);
      setResult(response);
      if (action === "confirm" && response.kind === "blocked" && response.canPrepareAgain) {
        try { sessionStorage.removeItem(storageKey); setPending(null); } catch { setStorageError(true); }
      }
      if (response.kind === "prepared") {
        if (pending && response.dossier.payloadHash !== pending.expectedPayloadHash) {
          setPrepared(null); setResult({ kind: "uncertain", message: "Le dossier ne correspond plus à la confirmation en attente. Réconciliation nécessaire ; aucun nouvel envoi." });
        } else setPrepared({ pending: { ...packet, expectedPayloadHash: response.dossier.payloadHash }, dossier: response.dossier });
      } else setPrepared(null);
    } finally { inFlight.current = false; setBusy(false); }
  }
  async function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending || existingReceipt || inFlight.current || attachmentPending) return;
    const form = new FormData(event.currentTarget);
    const parsed = openHandsFormSchema.safeParse({ missionId: mission.id, expectedUpdatedAt: mission.updatedAt,
      commitSha: String(form.get("commitSha") ?? "").trim(), executorVersion: String(form.get("executorVersion") ?? "").trim(),
      budget: { maxCostCents: Number(form.get("maxCostCents")), maxTokens: Number(form.get("maxTokens")), maxIterations: Number(form.get("maxIterations")), timeoutSeconds: Number(form.get("timeoutSeconds")) } });
    if (!parsed.success) { setResult({ kind: "blocked", message: "Renseignez un commit complet, une version précise et les limites valides." }); return; }    if((event.nativeEvent as SubmitEvent).submitter?.getAttribute("value")==="attach_memory") {      const projectId=String(form.get("projectId")??"");      if(!projects.some(p=>p.projectId===projectId))return;      inFlight.current=true;setBusy(true);setAttachmentPending(true);setPrepared(null);      try {        const ok=await attachOpenHandsMemory(parsed.data,projectId);        setResult({kind:ok?"blocked":"uncertain",message:ok?"Mémoire rattachée. Actualisez la mission, puis préparez le dossier avec sa nouvelle version.":"Résultat de l’attachement non confirmé. Actualisez la mission pour vérifier avant toute autre action."});        router.refresh();      } catch {setResult({kind:"uncertain",message:"Connexion interrompue. Actualisez la mission pour vérifier si la mémoire a été rattachée."});}      finally{inFlight.current=false;setBusy(false);}      return;    }
    void run("prepare", { version: 1, workspaceId: mission.workspaceId, request: parsed.data, expectedPayloadHash: "0".repeat(64) });
  }
  return <details className="mt-5 rounded-xl border border-neutral-700 p-4" aria-busy={busy}>
    <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-white">OpenHands — préparer une réservation, sans lancement</summary>
    {!available ? <p className="mt-2 text-sm text-neutral-400">{!enabled ? "Cette préparation est désactivée sur le serveur." : "Une mission enregistrée durablement est nécessaire."}</p> : <>
      <p className="mt-2 text-sm leading-6 text-neutral-300">Relisez le dossier exact avant d’enregistrer son autorisation. Cette étape n’exécute pas la mission et n’autorise aucun outil externe.</p>
      {storageError ? <p role="alert" className="mt-3 text-sm text-amber-200">Le reçu de session est indisponible ou illisible. Confirmation bloquée pour éviter un doublon ; une vérification manuelle est nécessaire.</p> : !loaded ? <p role="status">Lecture du reçu de session…</p> : <>
        {!pending && !existingReceipt && !prepared && <form onSubmit={prepare} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-neutral-300 sm:col-span-2">Commit Git complet (40 ou 64 caractères hexadécimaux)<input required name="commitSha" maxLength={64} className={`${field} mt-1`} disabled={busy} /></label>
          <label className="text-sm text-neutral-300 sm:col-span-2">Version OpenHands exacte<input required name="executorVersion" maxLength={64} placeholder="Ex. 1.2.3 — sans valeur présélectionnée" className={`${field} mt-1`} disabled={busy} /></label>
          {[["maxCostCents", "Coût demandé (centimes)", 10000], ["maxTokens", "Tokens demandés", 200000], ["maxIterations", "Itérations demandées", 100], ["timeoutSeconds", "Durée demandée (secondes)", 1800]].map(([name, label, max]) => <label key={name} className="text-sm text-neutral-300">{label}<input required type="number" name={String(name)} min={1} max={Number(max)} step={1} className={`${field} mt-1`} disabled={busy} /></label>)}
          {!mission.input._openhandsMemory && projects.length>0 && <><label className="text-sm text-neutral-300 sm:col-span-2">Mémoire du projet<select name="projectId" className={`${field} mt-1`} disabled={busy||attachmentPending}>{projects.map(p=><option key={p.projectId} value={p.projectId}>{p.label}</option>)}</select></label><button name="action" value="attach_memory" className={`${button} sm:col-span-2`} disabled={busy||attachmentPending}>Rattacher la mémoire avant de préparer</button></>}          {!mission.input._openhandsMemory && projects.length===0 && <p className="text-xs text-neutral-400 sm:col-span-2">{projectError?"Le registre des projets mémoire n’est pas disponible.":"Aucun projet mémoire configuré pour cet espace."}</p>}          <button className={`${button} sm:col-span-2`} disabled={busy||attachmentPending}>Préparer le dossier à relire</button>          {attachmentPending&&<button type="button" className={`${button} sm:col-span-2`} onClick={()=>router.refresh()}>Actualiser et vérifier l’attachement</button>}
        </form>}
        {existingReceipt && !pending && <p className="mt-3 text-sm text-amber-200">Une réservation existe déjà. Cette session ne possède pas ses paramètres de reprise : utilisez la session d’origine ou faites réconcilier le reçu serveur. Aucun nouveau dossier ne sera envoyé.</p>}
        {pending && <p className="mt-3 text-xs leading-5 text-neutral-400">Paramètres de reprise conservés dans cet onglet uniquement, sans contenu de mission. Ne créez pas une nouvelle confirmation pour contourner un état inconnu.</p>}
        {prepared && <><OpenHandsDossierReview dossier={prepared.dossier} />
          <label className="mt-4 flex items-start gap-3 text-sm text-neutral-200"><input type="checkbox" checked={checked} disabled={busy} onChange={(e) => setChecked(e.target.checked)} className="mt-1" />Je confirme ce dossier et ces limites demandées, pour enregistrer une autorisation et une réservation uniquement. Aucun lancement.</label>
          <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={!checked || busy} className={button} onClick={() => { if (checked) void run("confirm", prepared.pending); }}>{pending ? "Réessayer la même confirmation" : "Enregistrer l’autorisation et réserver"}</button>
          {!pending && <button type="button" disabled={busy} className={button} onClick={() => { setPrepared(null); setChecked(false); setResult(null); }}>Modifier la préparation</button>}</div>
        </>}
        {pending && !prepared && <button type="button" disabled={busy} className={`${button} mt-3`} onClick={() => void run("prepare", pending)}>Vérifier le reçu, sans renvoyer la confirmation</button>}
      </>}
      {result?.kind === "blocked" && result.canPrepareAgain && <button type="button" disabled={busy} className={`${button} mt-3`} onClick={() => router.refresh()}>Actualiser le dossier avant de préparer à nouveau</button>}
      <div role="status" aria-live="polite" className="mt-3 text-sm text-neutral-300">{busy ? "Vérification en cours…" : result?.kind === "reserved" ? <><p>Autorisation et réservation rapportées par le serveur. Aucun agent lancé.</p><p className="mt-1 break-all text-xs">Reçu : {result.reference}</p></> : result?.kind === "prepared" ? "Dossier prêt à relire ; aucune autorisation enregistrée à cette étape." : result?.message}</div>
    </>}
  </details>;
}
