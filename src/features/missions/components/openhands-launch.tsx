"use client";
import { useRef, useState } from "react";
import type { Mission } from "@/core/types";
import type { LaunchBinding } from "@/core/openhands-launch-contract";
import { requestLaunch, type LaunchResult } from "../openhands-launch";
import {OpenHandsRecovery} from "./openhands-recovery";
const button="min-h-11 rounded-lg border border-neutral-700 px-4 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-amber-300";

type ConfirmationState={binding:LaunchBinding|null;checked:boolean;busy:boolean;attempted:boolean;existing:boolean};
/** Client duplicate/intent guard only. Account and execution authority remain server-owned. */
export function canConfirmOpenHandsLaunch(state:ConfirmationState){
  return !!state.binding&&state.checked&&!state.busy&&!state.attempted&&!state.existing;
}

export function OpenHandsLaunchConfiguration({binding,checked,busy,attempted,existing,onChecked,onConfirm}:
  ConfirmationState&{binding:LaunchBinding;onChecked:(checked:boolean)=>void;onConfirm:()=>void}){
  const profile=binding.config.providerProfile;
  const providerLabel=profile?.provider==='codex'?'Codex':'Claude';
  return <>
    <dl className="grid gap-3 sm:grid-cols-2">
      <div><dt>Moteur</dt><dd>OpenHands {binding.config.executorVersion}</dd></div>
      <div><dt>Exécutant</dt><dd className="break-all">{binding.config.runnerId}</dd></div>
      <div className="sm:col-span-2"><dt>Connexion au fournisseur</dt><dd>{profile
        ? `${providerLabel} par abonnement — profil ${profile.id}. Réseau restreint demandé, connecteurs du compte désactivés. La connexion et les autorisations seront vérifiées par le serveur à la confirmation.`
        : 'Qualification hors ligne — aucun compte fournisseur raccordé.'}</dd></div>
      {profile&&<div className="sm:col-span-2"><dt>Empreinte de la politique fournisseur</dt><dd className="break-all">{profile.policySha256}</dd></div>}
      <div className="sm:col-span-2"><dt>Modèle ACP demandé</dt><dd className="break-all">{binding.config.foundationModelId ?? "non spécifié"}</dd></div>
      <div><dt>Budget demandé (centimes)</dt><dd>{binding.config.maxCostCents}</dd></div>
      <div><dt>Tokens demandés</dt><dd>{binding.config.maxTokens}</dd></div>
      <div><dt>Itérations maximales</dt><dd>{binding.config.maxIterations}</dd></div>
      <div><dt>Durée maximale (secondes)</dt><dd>{binding.config.timeoutSeconds}</dd></div>
      <div className="sm:col-span-2"><dt>Commit</dt><dd className="break-all">{binding.commitSha}</dd></div>
    </dl>
    <p>Les outils sont refusés par défaut. Le plafond de tokens n’est pas un arrêt technique garanti ; les coûts réels restent à vérifier.</p>
    <details><summary className="min-h-11 cursor-pointer py-3">Voir les références exactes</summary><pre className="overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(binding,null,2)}</pre></details>
    <label className="flex items-start gap-3"><input type="checkbox" checked={checked} disabled={busy||attempted||existing} onChange={e=>onChecked(e.target.checked)} />Je confirme cette configuration et ces limites pour cette mission.</label>
    <button className={button} disabled={!canConfirmOpenHandsLaunch({binding,checked,busy,attempted,existing})} onClick={onConfirm}>Confirmer la tentative</button>
  </>;
}

export function OpenHandsLaunch({mission,onRefresh}:{mission:Mission;onRefresh:()=>void}){
  const [result,setResult]=useState<LaunchResult|null>(null),[busy,setBusy]=useState(false),[checked,setChecked]=useState(false);
  const [attempted,setAttempted]=useState(false);const lock=useRef(false);
  const key=`hq:openhands-launch:${mission.workspaceId}:${mission.id}`;
  const existing=Object.prototype.hasOwnProperty.call(mission.input,'_openhandsLaunch');
  const binding=result?.kind==='prepared'?result.binding:null;
  async function run(confirm:boolean){
    if(lock.current||existing||attempted||(confirm&&!canConfirmOpenHandsLaunch({binding,checked,busy,attempted,existing})))return;
    lock.current=true;setBusy(true);setChecked(false);
    try{
      if(sessionStorage.getItem(key)!==null){setAttempted(true);setResult({kind:'uncertain',message:'Une confirmation a déjà été tentée dans cet onglet. Vérifiez le suivi serveur avant toute nouvelle demande.'});return;}
      if(confirm){sessionStorage.setItem(key,binding!.launchHash);setAttempted(true);}
      setResult(await requestLaunch({workspaceId:mission.workspaceId,missionId:mission.id},confirm?binding!:undefined));
    }catch{setAttempted(true);setResult({kind:'uncertain',message:'Le suivi local est indisponible. Confirmation bloquée ; vérifiez la mission côté serveur.'});}
    finally{lock.current=false;setBusy(false);}
  }
  return <section aria-label="Configuration de lancement OpenHands" aria-busy={busy} className="mt-5 space-y-3 rounded-xl border border-neutral-700 p-4 text-sm text-neutral-300">
    <h4 className="font-semibold text-white">Préparer l’exécution</h4>
    <p>Le dossier est réservé. Vérifiez maintenant le moteur et ses limites avant de confirmer une tentative.</p>
    <p className="text-amber-200">Si le serveur l’accepte, cette confirmation enregistre une tentative en attente de prise en charge par le service hôte. Seul le suivi serveur peut confirmer son démarrage.</p>
    {existing?<p>Une tentative existe déjà. Consultez le suivi avant toute nouvelle action ; sa présence ne prouve pas une exécution réussie.</p>:<>
      {!binding&&!attempted&&<button className={button} disabled={busy} onClick={()=>void run(false)}>Voir la configuration du serveur</button>}
      {binding&&<OpenHandsLaunchConfiguration binding={binding} checked={checked} busy={busy} attempted={attempted} existing={existing}
        onChecked={setChecked} onConfirm={()=>void run(true)} />}
    </>}
    <div role="status" aria-live="polite">{busy?'Vérification en cours…':result?.kind==='claimed'?`Tentative enregistrée : ${result.launchId}. En attente de prise en charge ; aucun démarrage confirmé.`:result?.kind==='prepared'?'Configuration prête à relire.':result?.message}</div>
    <button className={button} disabled={busy} onClick={onRefresh}>Actualiser le suivi serveur</button>
    {existing&&<OpenHandsRecovery missionId={mission.id} />}
  </section>;
}
