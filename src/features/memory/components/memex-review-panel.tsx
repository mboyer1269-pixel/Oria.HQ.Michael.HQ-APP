"use client";
import { useEffect, useRef, useState } from "react";
import type { ReviewDecision, ReviewResult, ReviewSnapshot } from "@/server/memory/memex-review-service";
export const MEMEX_REVIEW_EVENT="hq:memex-review-proposal";
export function parsePendingReview(raw:string):ReviewDecision {
 try {
  const value=JSON.parse(raw);
  if(!value||typeof value!=="object"||Array.isArray(value)||Object.keys(value).sort().join(",")!=="decision,decisionId,expectedPayloadHash,hashVersion,proposalId"
   ||typeof value.proposalId!=="string"||!/^[a-zA-Z0-9][a-zA-Z0-9:_.-]{0,159}$/.test(value.proposalId)
   ||typeof value.expectedPayloadHash!=="string"||! /^[a-f0-9]{64}$/.test(value.expectedPayloadHash)
   ||typeof value.decisionId!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.decisionId)
   ||value.hashVersion!==1||!["approve","reject"].includes(value.decision))throw Error();
  return value;
 }catch{throw Error("storage");}
}
export function MemexReviewPanel({workspaceId}:{workspaceId:string}) {
 const [proposalId,setProposalId]=useState("");const [snapshot,setSnapshot]=useState<ReviewSnapshot|null>(null);
 const [pending,setPending]=useState<ReviewDecision|null>(null);const [result,setResult]=useState<ReviewResult|{status:"request_denied"}|null>(null);
 const [confirmed,setConfirmed]=useState(false);const [busy,setBusy]=useState(false);const [storageError,setStorageError]=useState(false);const lock=useRef(false);
 const storageKey=`hq:memex-review:${workspaceId}`;
 useEffect(()=>{const open=(event:Event)=>{const id=(event as CustomEvent<unknown>).detail;if(typeof id!=="string"||id.length>160||pending||lock.current)return;setProposalId(id);setSnapshot(null);setConfirmed(false);setResult(null);document.getElementById("memex-review-panel")?.scrollIntoView({behavior:"smooth"});};window.addEventListener(MEMEX_REVIEW_EVENT,open);return()=>window.removeEventListener(MEMEX_REVIEW_EVENT,open);},[pending]);
 async function perform(decision?:ReviewDecision){
  if(lock.current)return;lock.current=true;setBusy(true);
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12000);
  try{
   let saved:string|null;
   try{saved=sessionStorage.getItem(storageKey);}catch{throw Error("storage");}
   if(!decision&&saved){const parsed=parsePendingReview(saved);setPending(parsed);setProposalId(parsed.proposalId);setResult({status:"outcome_unknown"});return;}
   if(decision){
    if(saved){const existing=parsePendingReview(saved);if(JSON.stringify(existing)!==JSON.stringify(decision)){setPending(existing);setProposalId(existing.proposalId);setResult({status:"outcome_unknown"});return;}}
    try{sessionStorage.setItem(storageKey,JSON.stringify(decision));}catch{throw Error("storage");}setPending(decision);
   }
   const response=await fetch("/api/memory/review",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(decision?{action:"decision",...decision}:{action:"snapshot",proposalId}),cache:"no-store",signal:controller.signal});
   const data=await response.json();
   if(response.status===403&&data?.status==="request_denied"){setResult({status:"request_denied"});return;}
   if(!response.ok||!data||!["snapshot","decided","disabled","unconfigured","workspace_unbound","unavailable","outcome_unknown","not_found","conflict","unsupported_snapshot"].includes(data.status))throw Error("response");
   if(data.status==="snapshot"){
    if(data.snapshot?.proposal?.id!==proposalId||data.snapshot?.hashVersion!==1||typeof data.snapshot?.payloadHash!=="string")throw Error("snapshot");
    setSnapshot(data.snapshot);setConfirmed(false);
   }
   if(data.status==="decided"){
    if(!decision||data.receipt?.decisionId!==decision.decisionId||data.receipt?.payloadHash!==decision.expectedPayloadHash||data.receipt?.decision!==decision.decision||data.receipt?.proposalId!==decision.proposalId)throw Error("receipt");
    sessionStorage.removeItem(storageKey);setPending(null);setSnapshot(null);setConfirmed(false);
   }
   setResult(data);
  }catch(error){if(error instanceof Error&&error.message==="storage")setStorageError(true);setResult({status:decision?"outcome_unknown":"unavailable"});}
  finally{clearTimeout(timer);lock.current=false;setBusy(false);controller.abort();}
 }
 function decide(decision:"approve"|"reject"){
  if(!snapshot||!confirmed||pending||busy)return;
  void perform({proposalId:snapshot.proposal.id,expectedPayloadHash:snapshot.payloadHash,hashVersion:1,decisionId:crypto.randomUUID(),decision});
 }
 const messages:Record<string,string>={disabled:"Revue humaine désactivée pour cette instance.",unconfigured:"Canal opérateur non configuré.",workspace_unbound:"Projet non raccordé pour la revue.",unavailable:"Lecture indisponible.",outcome_unknown:"Résultat incertain. Reprendre uniquement la même décision ci-dessous.",conflict:"Conflit : le contenu ou la décision a changé. Cette décision n’est pas confirmée.",not_found:"Proposition introuvable dans ce projet.",unsupported_snapshot:"Schéma ou empreinte non pris en charge. Aucun bouton de décision disponible.",request_denied:"Origine refusée avant transmission. Corrige la connexion avant de reprendre."};
 return <section id="memex-review-panel" aria-labelledby="memex-review-title" className="rounded-2xl border border-amber-500/20 bg-neutral-950/50 p-5">
  <h2 id="memex-review-title" className="text-lg font-semibold text-white">Examiner une proposition</h2><p className="mt-2 text-sm text-neutral-400">Décision du propriétaire sur un contenu exact. Approuver ne publie pas la mémoire.</p>
  <form onSubmit={event=>{event.preventDefault();setSnapshot(null);void perform();}} className="mt-4 flex flex-wrap gap-3"><label className="min-w-0 flex-1 text-sm text-neutral-300">Référence de proposition<input required maxLength={160} disabled={busy||!!pending} value={proposalId} onChange={e=>{setProposalId(e.target.value);setSnapshot(null);setConfirmed(false);}} className="mt-2 block min-h-11 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3" /></label><button disabled={busy||!!pending} className="min-h-11 self-end rounded-lg border border-neutral-700 px-4 text-sm text-amber-200">Charger le contenu exact</button></form>
  <p role="status" className="mt-3 text-sm text-neutral-300">{busy?"Vérification…":result?.status==="decided"?`Décision ${result.receipt.decision === "approve"?"d’approbation":"de rejet"} enregistrée. Aucune publication déclenchée.`:result?.status==="snapshot"?"Contenu chargé, aucune décision prise.":result?messages[result.status]:""}</p>
  {storageError&&<p role="alert" className="text-sm text-amber-200">Suivi local illisible : conserve le reçu et demande une vérification opérateur.</p>}
  {snapshot&&result?.status==="snapshot"&&!pending&&<div className="mt-4"><p className="text-xs text-neutral-400">Tous les champs reçus sont affichés ci-dessous, y compris entités, relations, provenance, confiance et risques. Empreinte : {snapshot.payloadHash}</p><p className="mt-3 whitespace-pre-wrap break-words text-sm text-neutral-200">{snapshot.proposal.content}</p><dl className="mt-3 space-y-2 text-sm text-neutral-400"><div><dt>Statut</dt><dd>{snapshot.proposal.status}</dd></div><div><dt>Provenance</dt><dd className="whitespace-pre-wrap break-words">{snapshot.proposal.provenance || "Non renseignée"}</dd></div><div><dt>Confiance déclarée</dt><dd>{snapshot.proposal.confidence ?? "Inconnue"}</dd></div><div><dt>Risques signalés</dt><dd className="whitespace-pre-wrap break-words">{snapshot.proposal.riskFlags || "Non renseignés"}</dd></div></dl><details className="mt-4"><summary className="cursor-pointer text-sm text-amber-200">Examiner tous les champs, entités et relations proposés</summary><pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-neutral-800 p-3 text-xs text-neutral-300">{JSON.stringify(snapshot.proposal,null,2)}</pre></details><label className="mt-3 flex gap-3 text-sm text-neutral-300"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} />J’ai examiné tout le contenu et ses effets proposés.</label><div className="mt-3 flex gap-3"><button disabled={busy||!confirmed||snapshot.proposal.status!=="proposed"} onClick={()=>decide("approve")} className="min-h-11 rounded-lg bg-amber-400 px-4 text-neutral-950 disabled:opacity-40">Approuver sans publier</button><button disabled={busy||!confirmed||!["proposed","quarantined"].includes(snapshot.proposal.status)} onClick={()=>decide("reject")} className="min-h-11 rounded-lg border border-neutral-700 px-4 text-neutral-300 disabled:opacity-40">Rejeter</button></div></div>}
  {pending&&<div className="mt-4 text-sm text-neutral-300"><p className="break-all">Décision en suivi : {pending.decisionId} · {pending.decision}</p><button disabled={busy||storageError} onClick={()=>void perform(pending)} className="mt-3 min-h-11 rounded-lg border border-amber-500/40 px-4 text-amber-200">Reprendre cette même décision</button>{result?.status==="conflict"&&<button disabled={busy} onClick={()=>{try{sessionStorage.removeItem(storageKey);setPending(null);setSnapshot(null);setResult(null);setConfirmed(false);}catch{setStorageError(true);}}} className="ml-3 min-h-11 text-neutral-300">Fermer le conflit et recharger le contenu</button>}</div>}
  {result?.status==="decided"&&<p className="mt-3 break-all text-xs text-neutral-500">Reçu : {result.receipt.decisionId} · acteur : {result.receipt.reviewerId} · service : {result.receipt.technicalPrincipal}</p>}
 </section>;
}
