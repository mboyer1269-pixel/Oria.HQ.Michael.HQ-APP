"use client";
import {useEffect,useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {OUTCOME_MESSAGES,REFUSAL_MESSAGES,RETRYABLE_STATUSES,classifyTrackingValue,describeReceipt,developmentMissionTrackingKey,isResponseApplicable,performDevelopmentRequest,planIntent,requestMethodFor} from "@/features/missions/development-mission-session";
import type {DevelopmentOutcome,DevelopmentPayload,Intent,ReceiptOrigin,TrackingState} from "@/features/missions/development-mission-session";
const fields=[{key:"title",label:"Titre",max:200},{key:"objective",label:"Objectif",max:4000},{key:"scope",label:"Périmètre autorisé (fichiers, changements et exclusions)",max:1000},{key:"acceptanceCriteria",label:"Critères d’acceptation et validations attendues",max:2000}] as const;
const EMPTY={title:"",objective:"",scope:"",acceptanceCriteria:""};
export function DevelopmentMissionForm({workspaceId}:{workspaceId:string}){
 const [values,setValues]=useState(EMPTY);const [tracking,setTracking]=useState<TrackingState>("ok");const [activeRequestId,setActiveRequestId]=useState<string|null>(null);const [pendingRequestId,setPendingRequestId]=useState<string|null>(null);const [releasedRequestId,setReleasedRequestId]=useState<string|null>(null);const [result,setResult]=useState<DevelopmentOutcome|null>(null);const [origin,setOrigin]=useState<ReceiptOrigin|null>(null);const [refusal,setRefusal]=useState<string|null>(null);const [busy,setBusy]=useState(false);const [frozen,setFrozen]=useState(false);const lock=useRef(false);const payload=useRef<DevelopmentPayload|null>(null);const generation=useRef(0);const inflight=useRef<AbortController|null>(null);const router=useRouter();const key=developmentMissionTrackingKey(workspaceId);
 /**
  * Réhydratation au montage et à chaque changement de projet.
  *
  * L’identifiant de demande survit au rechargement, la saisie non : la clé est
  * cloisonnée par projet, donc aucune reprise ne traverse les workspaces. Le
  * changement de projet incrémente la génération et annule la requête en vol —
  * une réponse tardive de l’ancien projet ne doit rien afficher dans le nouveau.
  */
 useEffect(()=>{
  generation.current+=1;inflight.current?.abort();inflight.current=null;lock.current=false;payload.current=null;
  setBusy(false);setFrozen(false);setActiveRequestId(null);setReleasedRequestId(null);setResult(null);setOrigin(null);setRefusal(null);setValues(EMPTY);
  let stored:string|null;
  try{stored=sessionStorage.getItem(key);}catch{setTracking("unavailable");setPendingRequestId(null);return;}
  const kind=classifyTrackingValue(stored);setTracking(kind==="corrupt"?"corrupt":"ok");setPendingRequestId(kind==="resumable"?stored:null);
 },[key]);
 async function act(intent:Intent){
  if(lock.current)return;
  const plan=planIntent({tracking,activeRequestId,pendingRequestId,releasedRequestId,hasFrozenPayload:payload.current!==null,inputComplete:fields.every(field=>values[field.key].trim()!=="")},intent);
  if(plan.kind==="refused"){setRefusal(REFUSAL_MESSAGES[plan.reason]);return;}
  setRefusal(null);
  if(plan.kind==="read-empty"){setResult({status:"not_found"});setOrigin("read");return;}
  const method=requestMethodFor(plan);if(method===null)return;
  let id:string;
  if(plan.kind==="create"){
   id=crypto.randomUUID();
   try{sessionStorage.setItem(key,id);}catch{setTracking("unavailable");setRefusal(REFUSAL_MESSAGES["tracking-unavailable"]);return;}
   setActiveRequestId(id);setReleasedRequestId(null);
  }else id=plan.requestId;
  // Même identifiant et même charge pour tout renvoi : la charge est figée au premier envoi.
  if(method==="POST"&&!payload.current){payload.current={requestId:id,...values};setFrozen(true);}
  const nextOrigin:ReceiptOrigin=method==="GET"?"read":plan.kind==="retry"?"retried":"created";
  const ticket={generation:generation.current,trackingKey:key};
  lock.current=true;setBusy(true);
  const controller=new AbortController();inflight.current=controller;const timer=setTimeout(()=>controller.abort(),15000);
  try{
   const outcome=await performDevelopmentRequest({method,requestId:id,payload:payload.current,fetchImpl:fetch,signal:controller.signal});
   // Le projet a pu changer pendant l’appel : une réponse obsolète est ignorée.
   if(!isResponseApplicable(ticket,{generation:generation.current,trackingKey:key}))return;
   setOrigin(nextOrigin);setResult(outcome);if(outcome.status==="saved")router.refresh();
  }finally{
   clearTimeout(timer);if(inflight.current===controller)inflight.current=null;controller.abort();
   if(isResponseApplicable(ticket,{generation:generation.current,trackingKey:key})){lock.current=false;setBusy(false);}
  }
 }
 function reset(){try{sessionStorage.removeItem(key);}catch{setTracking("unavailable");return;}setTracking("ok");setActiveRequestId(null);setPendingRequestId(null);setReleasedRequestId(null);setResult(null);setOrigin(null);setRefusal(null);setValues(EMPTY);payload.current=null;setFrozen(false);}
 const canSubmit=!activeRequestId&&!pendingRequestId&&tracking==="ok";
 const incomplete=fields.some(field=>!values[field.key].trim());
 return <section id="development-mission" className="rounded-2xl border border-amber-500/20 bg-neutral-950/50 p-5" aria-labelledby="development-title"><h2 id="development-title" className="text-lg font-semibold text-white">Créer une mission de développement</h2><p className="mt-2 text-sm text-neutral-400">Enregistre un brouillon durable, sans lancer d’agent. Le périmètre et les critères accompagneront son transfert explicite vers Paperclip.</p>
 {pendingRequestId&&!activeRequestId&&<div role="group" aria-label="Reprise d’une demande précédente" className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3"><p className="text-sm text-amber-100">Une demande de cette session n’est pas clôturée. Ta saisie n’a pas été envoyée : choisis explicitement.</p><p className="mt-1 break-all text-xs text-neutral-400">Demande précédente : {pendingRequestId}</p>
  <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={()=>{setActiveRequestId(pendingRequestId);setPendingRequestId(null);void act("read-pending");}} className="min-h-11 rounded-lg bg-amber-400 px-4 text-sm font-semibold text-neutral-950 disabled:opacity-50">Reprendre cette demande</button>
  <button type="button" disabled={busy} onClick={()=>{setReleasedRequestId(pendingRequestId);setPendingRequestId(null);setResult(null);setOrigin(null);setRefusal(null);}} className="min-h-11 rounded-lg border border-neutral-700 px-4 text-sm text-amber-200 disabled:opacity-50">Commencer une nouvelle mission</button></div></div>}
 {tracking==="corrupt"&&<div role="group" aria-label="Suivi de session illisible" className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3"><p role="alert" className="text-sm text-amber-100">{REFUSAL_MESSAGES["tracking-corrupt"]}</p><button type="button" disabled={busy} onClick={reset} className="mt-3 min-h-11 rounded-lg border border-neutral-700 px-4 text-sm text-amber-200 disabled:opacity-50">Écarter ce suivi illisible</button></div>}
 {tracking==="unavailable"&&<p role="alert" className="mt-4 text-sm text-amber-200">{REFUSAL_MESSAGES["tracking-unavailable"]}</p>}
 <form className="mt-4 space-y-3" onSubmit={e=>{e.preventDefault();void act("create");}}>{fields.map(field=><label key={field.key} className="block text-sm text-neutral-300">{field.label}<textarea required maxLength={field.max} rows={field.key==="title"?1:3} disabled={busy||frozen} value={values[field.key]} onChange={e=>setValues({...values,[field.key]:e.target.value})} className="mt-2 block w-full rounded-lg border border-neutral-700 bg-neutral-900 p-3 disabled:opacity-60" /></label>)}{canSubmit&&<button disabled={busy||incomplete} className="min-h-11 rounded-lg bg-amber-400 px-4 font-semibold text-neutral-950 disabled:opacity-50">Enregistrer le brouillon</button>}</form>
 <p role="status" className="mt-3 text-sm text-neutral-300">{busy?"Vérification…":result?.status==="saved"&&origin?describeReceipt(origin,result.title):result?OUTCOME_MESSAGES[result.status]:""}</p>{refusal&&<p role="alert" className="text-sm text-amber-200">{refusal}</p>}
 <button type="button" disabled={busy} onClick={()=>void act("read-active")} className="mt-3 min-h-11 rounded-lg border border-neutral-700 px-4 text-sm text-amber-200">Vérifier le dernier reçu</button>{activeRequestId&&<p className="mt-2 break-all text-xs text-neutral-500">Identifiant de demande : {activeRequestId}</p>}
 {releasedRequestId&&<p className="mt-2 break-all text-xs text-neutral-500">Demande mise de côté, hors suivi de session : {releasedRequestId} <button type="button" disabled={busy} onClick={()=>void act("read-released")} className="underline text-amber-200">Vérifier ce reçu</button></p>}
 {activeRequestId&&RETRYABLE_STATUSES.includes(result?.status??"")&&<button type="button" disabled={busy||(payload.current===null&&incomplete)||tracking!=="ok"} onClick={()=>void act("retry")} className="mt-3 min-h-11 rounded-lg border border-neutral-700 px-4 text-sm text-amber-200 disabled:opacity-50">Réessayer avec le même identifiant</button>}
 {result?.status==="saved"&&<div className="mt-3"><p className="break-all text-xs text-neutral-500">Mission : {result.missionId}</p><button type="button" disabled={busy} onClick={reset} className="mt-3 min-h-11 text-amber-200">Préparer une autre mission</button></div>}
 <p className="mt-3 text-xs text-neutral-500">Seul l’identifiant est conservé pour cette session et ce projet, jamais le contenu saisi. Après actualisation, la reprise et la nouvelle mission sont deux choix explicites : aucune saisie n’est envoyée sous un identifiant précédent sans ton accord.</p></section>;
}
