"use client";
import {useEffect,useRef,useState} from "react";
import {useRouter} from "next/navigation";
import Link from "next/link";
import {consumeDevelopmentHandoff,missionDossierHref} from "@/features/missions/development-mission-handoff";
import {canRestoreDevelopmentDraft,clearDevelopmentDraft,readDevelopmentDraft,saveDevelopmentDraft} from "@/features/missions/development-mission-draft";
import {OUTCOME_MESSAGES,REFUSAL_MESSAGES,RETRYABLE_STATUSES,classifyTrackingValue,describeReceipt,developmentMissionTrackingKey,isResponseApplicable,performDevelopmentRequest,planIntent,requestMethodFor} from "@/features/missions/development-mission-session";
import type {DevelopmentOutcome,DevelopmentPayload,Intent,ReceiptOrigin,TrackingState} from "@/features/missions/development-mission-session";
const fields=[{key:"title",label:"Titre",max:200},{key:"objective",label:"Objectif",max:4000},{key:"scope",label:"Périmètre autorisé (fichiers, changements et exclusions)",max:1000},{key:"acceptanceCriteria",label:"Critères d’acceptation et validations attendues",max:2000}] as const;
const EMPTY={title:"",objective:"",scope:"",acceptanceCriteria:""};
type FormState={tracking:TrackingState;activeRequestId:string|null;pendingRequestId:string|null;releasedRequestId:string|null;result:DevelopmentOutcome|null;origin:ReceiptOrigin|null;refusal:string|null;busy:boolean;frozen:boolean;values:typeof EMPTY};
const fresh=():FormState=>({tracking:"ok",activeRequestId:null,pendingRequestId:null,releasedRequestId:null,result:null,origin:null,refusal:null,busy:false,frozen:false,values:EMPTY});
/**
 * Une instance de formulaire par projet.
 *
 * `key={workspaceId}` fait démonter puis remonter l’instance interne quand le
 * projet change : état **et** refs repartent de zéro, en particulier la charge
 * figée. Sans cela, la charge de A survivait au changement et un enregistrement
 * en B aurait posté l’identifiant et le contenu de A tout en inscrivant un
 * nouvel identifiant B dans `sessionStorage`.
 *
 * Le brouillon non envoyé est conservé séparément du `requestId`, qui est
 * relu à l’action depuis `sessionStorage` : revenir en A propose donc une
 * reprise explicite, jamais un envoi silencieux.
 */
export function DevelopmentMissionForm({workspaceId}:{workspaceId:string}){
 return <DevelopmentMissionFormInstance key={workspaceId} workspaceId={workspaceId} />;
}
function DevelopmentMissionFormInstance({workspaceId}:{workspaceId:string}){
 const key=developmentMissionTrackingKey(workspaceId);
 const [s,setState]=useState<FormState>(fresh);const lock=useRef(false);const payload=useRef<DevelopmentPayload|null>(null);const generation=useRef(0);const inflight=useRef<AbortController|null>(null);const router=useRouter();
 const [handoffNotice,setHandoffNotice]=useState<string|null>(null);
 const [offeredObjective,setOfferedObjective]=useState<string|null>(null);const edited=useRef(false);
 const [draftNotice,setDraftNotice]=useState<string|null>(null);
 // Defer tab storage until after hydration. Cleanup prevents consuming twice in Strict Mode.
 useEffect(()=>{
  const timer=setTimeout(()=>{
   try {
    const draft=readDevelopmentDraft(sessionStorage,workspaceId);
    if(draft.status==="ready"&&canRestoreDevelopmentDraft({edited:edited.current,frozen:payload.current!==null,busy:lock.current})){
     edited.current=Object.values(draft.values).some(value=>!!value);
     setState(prev=>({...prev,values:draft.values}));
     setDraftNotice("Brouillon non envoyé restauré dans cet onglet. Vérifie les champs avant d’enregistrer.");
    }else if(draft.status==="unavailable")setDraftNotice("Conservation du brouillon indisponible. Garde cet écran ouvert pour ne pas perdre ta saisie.");
    else if(draft.status==="invalid")setDraftNotice("L’ancien brouillon a expiré ou est illisible.");
    const handoff=consumeDevelopmentHandoff(sessionStorage,workspaceId);
    if(handoff.status==="absent")return;
    if(handoff.status==="ready"){
     const objective=handoff.objective;
     if(!canRestoreDevelopmentDraft({edited:edited.current,frozen:payload.current!==null,busy:lock.current})){setOfferedObjective(objective);setHandoffNotice("Une demande de HQ est disponible. Ta saisie actuelle est conservée.");return;}
     setState(prev=>({...prev,values:{...EMPTY,objective}}));
     if(!saveDevelopmentDraft(sessionStorage,workspaceId,{...EMPTY,objective}))setDraftNotice("Conservation du brouillon indisponible. Garde cet écran ouvert pour ne pas perdre ta saisie.");
     setHandoffNotice("Objectif reçu depuis HQ. Vérifie-le et complète les autres champs avant d’enregistrer. Aucune mission n’a été créée par ce transfert.");
    }else setHandoffNotice("Le transfert depuis HQ a expiré ou est illisible. Saisis ton objectif ci-dessous.");
   }catch{setHandoffNotice("Le transfert depuis HQ est indisponible dans cet onglet. Saisis ton objectif ci-dessous.");}
  },0);
  return ()=>clearTimeout(timer);
 },[workspaceId]);
 const patch=(next:Partial<FormState>)=>setState(prev=>({...prev,...next}));
 function editValues(values:typeof EMPTY){
  if(lock.current||payload.current)return;
  edited.current=true;patch({values});
  try{setDraftNotice(saveDevelopmentDraft(sessionStorage,workspaceId,values)?null:"Conservation du brouillon indisponible. Garde cet écran ouvert pour ne pas perdre ta saisie.");}
  catch{setDraftNotice("Conservation du brouillon indisponible. Garde cet écran ouvert pour ne pas perdre ta saisie.");}
 }
 /**
  * Nettoyage seul : aucune écriture d’état, donc aucun rendu en cascade.
  *
  * Au démontage — changement de projet inclus — la requête en vol est annulée
  * et son ticket invalidé : une réponse tardive n’applique plus rien et ne
  * déclenche aucun rafraîchissement.
  */
 useEffect(()=>()=>{generation.current+=1;inflight.current?.abort();inflight.current=null;},[]);
 /**
  * Le suivi de session est lu au moment de l’action, jamais au rendu — même
  * motif que `openhands-launch.tsx`. Rien ne dépend donc du stockage pendant
  * l’hydratation, et une demande résiduelle est découverte avant tout envoi
  * plutôt que de détourner celui-ci.
  */
 async function act(intent:Intent){
  if(lock.current)return;
  let raw:string|null;
  try{raw=sessionStorage.getItem(key);}catch{patch({tracking:"unavailable",pendingRequestId:null,refusal:REFUSAL_MESSAGES["tracking-unavailable"]});return;}
  const kind=classifyTrackingValue(raw);const tracking:TrackingState=kind==="corrupt"?"corrupt":"ok";
  // Résiduelle : un identifiant stocké que cette instance ne possède pas et que
  // l’opérateur n’a pas déjà mis de côté.
  const pendingRequestId=kind==="resumable"&&raw!==s.activeRequestId&&raw!==s.releasedRequestId?raw:null;
  const plan=planIntent({tracking,activeRequestId:s.activeRequestId,pendingRequestId,releasedRequestId:s.releasedRequestId,hasFrozenPayload:payload.current!==null,inputComplete:fields.every(field=>s.values[field.key].trim()!=="")},intent);
  if(plan.kind==="refused"){patch({tracking,pendingRequestId,refusal:REFUSAL_MESSAGES[plan.reason]});return;}
  if(plan.kind==="read-empty"){patch({tracking,pendingRequestId,refusal:null,result:{status:"not_found"},origin:"read"});return;}
  const method=requestMethodFor(plan);if(method===null)return;
  // Retire the unsent copy before a POST. The existing receipt remains the only
  // recovery mechanism after submission, including an unknown network outcome.
  if(method==="POST"){
   try{clearDevelopmentDraft(sessionStorage,workspaceId);}catch{patch({tracking:"unavailable",refusal:REFUSAL_MESSAGES["tracking-unavailable"]});return;}
  }
  let id:string;
  if(plan.kind==="create"){
   id=crypto.randomUUID();
   try{sessionStorage.setItem(key,id);}catch{patch({tracking:"unavailable",refusal:REFUSAL_MESSAGES["tracking-unavailable"]});return;}
  }else id=plan.requestId;
  // Même identifiant et même charge pour tout renvoi : la charge est figée au
  // premier envoi. `frozen` en est le reflet pour le rendu ; la ref reste aux actions.
  if(method==="POST"&&!payload.current)payload.current={requestId:id,...s.values};
  const adopting=intent==="read-pending";
  patch({tracking,refusal:null,busy:true,frozen:payload.current!==null,
   activeRequestId:plan.kind==="create"||adopting?id:s.activeRequestId,
   pendingRequestId:plan.kind==="create"||adopting?null:pendingRequestId,
   releasedRequestId:plan.kind==="create"?null:s.releasedRequestId});
  const nextOrigin:ReceiptOrigin=method==="GET"?"read":plan.kind==="retry"?"retried":"created";
  const ticket={generation:generation.current,trackingKey:key};
  lock.current=true;
  const controller=new AbortController();inflight.current=controller;const timer=setTimeout(()=>controller.abort(),15000);
  try{
   const outcome=await performDevelopmentRequest({method,requestId:id,payload:payload.current,fetchImpl:fetch,signal:controller.signal});
   // Le projet a pu changer pendant l’appel : une réponse obsolète est ignorée.
   if(!isResponseApplicable(ticket,{generation:generation.current,trackingKey:key}))return;
   patch({origin:nextOrigin,result:outcome});if(outcome.status==="saved")router.refresh();
  }finally{
   clearTimeout(timer);if(inflight.current===controller)inflight.current=null;controller.abort();
   if(isResponseApplicable(ticket,{generation:generation.current,trackingKey:key})){lock.current=false;patch({busy:false});}
  }
 }
 function reset(){
  try{clearDevelopmentDraft(sessionStorage,workspaceId);sessionStorage.removeItem(key);}catch{patch({tracking:"unavailable"});return;}
  payload.current=null;edited.current=false;setDraftNotice(null);setState(fresh());
 }
 const canSubmit=!s.activeRequestId&&!s.pendingRequestId&&s.tracking==="ok";
 const incomplete=fields.some(field=>!s.values[field.key].trim());
 return <section id="development-mission" className="rounded-2xl border border-amber-500/20 bg-neutral-950/50 p-5" aria-labelledby="development-title"><h2 id="development-title" className="text-lg font-semibold text-white">Créer une mission de développement</h2><p className="mt-2 text-sm text-neutral-400">Enregistre un brouillon durable, sans lancer d’agent. Le périmètre et les critères servent ensuite à préparer puis à confirmer explicitement une exécution OpenHands.</p>
 {handoffNotice&&<p role="status" className="mt-3 text-sm text-amber-200">{handoffNotice}</p>}
 {draftNotice&&<p role="status" className="mt-3 text-sm text-amber-200">{draftNotice}</p>}
 {offeredObjective&&<div className="mt-3 rounded-lg border border-amber-500/30 p-3"><p className="whitespace-pre-wrap break-words text-sm text-neutral-300">{offeredObjective}</p><button type="button" disabled={s.busy||s.frozen} onClick={()=>{editValues({...s.values,objective:offeredObjective});setOfferedObjective(null);setHandoffNotice("Objectif de HQ repris. Vérifie les autres champs avant d’enregistrer.");}} className="mt-2 min-h-11 px-3 text-sm text-amber-200 disabled:opacity-50">Remplacer seulement l’objectif par cette demande</button><button type="button" onClick={()=>setOfferedObjective(null)} className="min-h-11 px-3 text-sm text-neutral-300">Garder ma saisie</button></div>}
 {s.pendingRequestId&&!s.activeRequestId&&<div role="group" aria-label="Reprise d’une demande précédente" className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3"><p className="text-sm text-amber-100">Une demande de cette session n’est pas clôturée. Ta saisie n’a pas été envoyée : choisis explicitement.</p><p className="mt-1 break-all text-xs text-neutral-400">Demande précédente : {s.pendingRequestId}</p>
  <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={s.busy} onClick={()=>void act("read-pending")} className="min-h-11 rounded-lg bg-amber-400 px-4 text-sm font-semibold text-neutral-950 disabled:opacity-50">Reprendre cette demande</button>
  <button type="button" disabled={s.busy} onClick={()=>patch({releasedRequestId:s.pendingRequestId,pendingRequestId:null,result:null,origin:null,refusal:null})} className="min-h-11 rounded-lg border border-neutral-700 px-4 text-sm text-amber-200 disabled:opacity-50">Commencer une nouvelle mission</button></div></div>}
 {s.tracking==="corrupt"&&<div role="group" aria-label="Suivi de session illisible" className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3"><p role="alert" className="text-sm text-amber-100">{REFUSAL_MESSAGES["tracking-corrupt"]}</p><button type="button" disabled={s.busy} onClick={reset} className="mt-3 min-h-11 rounded-lg border border-neutral-700 px-4 text-sm text-amber-200 disabled:opacity-50">Écarter ce suivi illisible</button></div>}
 {s.tracking==="unavailable"&&<p role="alert" className="mt-4 text-sm text-amber-200">{REFUSAL_MESSAGES["tracking-unavailable"]}</p>}
 <form className="mt-4 space-y-3" onSubmit={e=>{e.preventDefault();void act("create");}}>{fields.map(field=><label key={field.key} className="block text-sm text-neutral-300">{field.label}<textarea required maxLength={field.max} rows={field.key==="title"?1:3} disabled={s.busy||s.frozen} value={s.values[field.key]} onChange={e=>editValues({...s.values,[field.key]:e.target.value})} className="mt-2 block w-full rounded-lg border border-neutral-700 bg-neutral-900 p-3 disabled:opacity-60" /></label>)}{canSubmit&&<button disabled={s.busy||incomplete} className="min-h-11 rounded-lg bg-amber-400 px-4 font-semibold text-neutral-950 disabled:opacity-50">Enregistrer le brouillon</button>}</form>
 <p role="status" className="mt-3 text-sm text-neutral-300">{s.busy?"Vérification…":s.result?.status==="saved"&&s.origin?describeReceipt(s.origin,s.result.title):s.result?OUTCOME_MESSAGES[s.result.status]:""}</p>{s.refusal&&<p role="alert" className="text-sm text-amber-200">{s.refusal}</p>}
 <button type="button" disabled={s.busy} onClick={()=>void act("read-active")} className="mt-3 min-h-11 rounded-lg border border-neutral-700 px-4 text-sm text-amber-200">Vérifier le dernier reçu</button>{s.activeRequestId&&<p className="mt-2 break-all text-xs text-neutral-500">Identifiant de demande : {s.activeRequestId}</p>}
 {s.releasedRequestId&&<p className="mt-2 break-all text-xs text-neutral-500">Demande mise de côté, hors suivi de session : {s.releasedRequestId} <button type="button" disabled={s.busy} onClick={()=>void act("read-released")} className="underline text-amber-200">Vérifier ce reçu</button></p>}
 {s.activeRequestId&&RETRYABLE_STATUSES.includes(s.result?.status??"")&&<button type="button" disabled={s.busy||(!s.frozen&&incomplete)||s.tracking!=="ok"} onClick={()=>void act("retry")} className="mt-3 min-h-11 rounded-lg border border-neutral-700 px-4 text-sm text-amber-200 disabled:opacity-50">Réessayer avec le même identifiant</button>}
 {s.result?.status==="saved"&&<div className="mt-3"><p className="break-all text-xs text-neutral-500">Mission : {s.result.missionId}</p>{missionDossierHref(s.result.missionId)&&<Link href={missionDossierHref(s.result.missionId)!} className="mt-3 inline-flex min-h-11 items-center text-amber-200 underline">Ouvrir le dossier enregistré</Link>}<button type="button" disabled={s.busy} onClick={reset} className="mt-3 min-h-11 text-amber-200">Préparer une autre mission</button></div>}
 <p className="mt-3 text-xs text-neutral-500">Le brouillon non envoyé reste dans cet onglet, par projet, pendant 24 heures après la dernière modification. Il est retiré avant un envoi. Le suivi du reçu conserve séparément son identifiant. L’objectif transféré depuis HQ est stocké dans cet onglet jusqu’à sa lecture ; il n’est plus accepté après 15 minutes. Après actualisation, la reprise et la nouvelle mission sont deux choix explicites : aucune saisie n’est envoyée sous un identifiant précédent sans ton accord.</p></section>;
}
