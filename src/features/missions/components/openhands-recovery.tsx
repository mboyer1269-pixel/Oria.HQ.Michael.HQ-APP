"use client";
import {useState} from "react";
const labels:Record<string,string>={absent:'Absent',unknown:'Inconnu',identity_mismatch:'Identité incohérente',created:'Créé',running:'En fonctionnement',paused:'En pause',restarting:'Redémarrage',removing:'Suppression en cours',exited:'Arrêté',dead:'Arrêt anormal',present:'Présent',not_applicable:'Sans fournisseur réseau'};
export function OpenHandsRecovery({missionId}:{missionId:string}){
  const [busy,setBusy]=useState(false),[text,setText]=useState('Consultez le dernier diagnostic publié par le serveur.');
  async function inspect(){
    setBusy(true);
    try{
      const response=await fetch(`/api/orchestration/openhands/recovery/${encodeURIComponent(missionId)}`,{cache:'no-store'});
      const data=await response.json();
      if(!response.ok||data.status!=='ready')throw Error();
      setText(`${data.stale?'Observation périmée ou état modifié — vérification nécessaire.':'Observation récente.'} Proxy : ${labels[data.containerState]??'Inconnu'}. Réseau : ${labels[data.networkState]??'Inconnu'}. Relevé : ${data.observedAt}.${data.inspectionIncomplete?' Inspection incomplète.':''}`);
    }catch{setText('Diagnostic indisponible. Cela ne prouve ni un arrêt ni une réussite.');}
    finally{setBusy(false);}
  }
  return <section className="mt-4 space-y-2 rounded-lg border border-neutral-700 p-3 text-sm" aria-label="Diagnostic de l’exécution" aria-busy={busy}>
    <h4 className="font-semibold">Diagnostic de l’exécution</h4>
    <p role="status" aria-live="polite">{busy?'Lecture du diagnostic…':text}</p>
    <button className="min-h-11 rounded-lg border border-neutral-700 px-4 disabled:opacity-50" disabled={busy} onClick={()=>void inspect()}>Consulter le diagnostic</button>
    <p className="text-xs text-neutral-400">Cette consultation ne relance rien. Un proxy arrêté ne signifie pas que le travail a été validé.</p>
  </section>;
}
