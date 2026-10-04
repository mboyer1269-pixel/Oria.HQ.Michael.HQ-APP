"use client";
import {useEffect,useRef,useState} from "react";
import {z} from "zod";

const itemSchema=z.object({requestId:z.uuid(),requestHash:z.string().regex(/^[a-f0-9]{64}$/),missionId:z.uuid(),
  toolCallId:z.string().max(160),inputJson:z.string().max(16384),expiresAt:z.iso.datetime({offset:true}),
  options:z.array(z.object({optionId:z.string().min(1).max(160),kind:z.enum(['allow_once','reject_once'])}).strict()).max(8)}).strict();
type Item=z.infer<typeof itemSchema>;
const button='min-h-11 rounded-lg border border-neutral-700 px-4 text-sm hover:bg-neutral-800 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-amber-300';

export function OpenHandsToolReview({launchId,missionId}:{launchId:string;missionId:string}){
  const [items,setItems]=useState<Item[]>([]);
  const [message,setMessage]=useState('Recherche des demandes en attente…');
  const [decisionMessage,setDecisionMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [now,setNow]=useState(()=>Date.now());
  const locked=useRef(false);
  const attempted=useRef(new Set<string>());
  const endpoint=`/api/orchestration/openhands/tools/${encodeURIComponent(launchId)}`;
  useEffect(()=>{
    let stopped=false;let timer:ReturnType<typeof setTimeout>;
    const clock=setInterval(()=>setNow(Date.now()),1000);
    async function refresh(){
      try{
        const response=await fetch(endpoint,{cache:'no-store',signal:AbortSignal.timeout(5000)});
        if(!response.ok)throw Error();
        const data=z.object({status:z.literal('ready'),items:z.array(itemSchema).max(1)}).strict().parse(await response.json());
        if(data.items.some(item=>item.missionId!==missionId))throw Error();
        if(!stopped){const available=data.items.filter(item=>!attempted.current.has(item.requestId));setItems(available);if(!locked.current)setMessage(available.length?'Vérifiez l’action avant de décider.':'Aucune nouvelle demande active.');}
      }catch{if(!stopped){setItems([]);if(!locked.current)setMessage('Demandes indisponibles. Aucune autorisation automatique.');}}
      finally{if(!stopped)timer=setTimeout(refresh,3000);}
    }
    void refresh();
    return()=>{stopped=true;clearTimeout(timer);clearInterval(clock);};
  },[endpoint,missionId]);
  async function decide(item:Item,optionId:string){
    if(locked.current||attempted.current.has(item.requestId)||now>=Date.parse(item.expiresAt))return;
    attempted.current.add(item.requestId);
    locked.current=true;setBusy(true);
    try{
      const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({requestId:item.requestId,expectedRequestHash:item.requestHash,optionId}),signal:AbortSignal.timeout(7000)});
      const result=await response.json();
      if(!response.ok||result.status!=='recorded')throw Error();
      setItems([]);setDecisionMessage(result.notified?'Décision enregistrée et transmise. L’exécution reste à vérifier.':'Décision enregistrée ; réception par le worker non confirmée.');
    }catch{setItems([]);setDecisionMessage('Décision non confirmée. Cette demande ne sera pas renvoyée depuis ce panneau. Vérifiez son état dans le journal.');}
    finally{setBusy(false);locked.current=false;}
  }
  return <section aria-label="Permissions des outils" className="mt-5 rounded-xl border border-amber-500/30 p-4 text-sm text-neutral-200">
    <h4 className="font-semibold text-white">Action à autoriser</h4>
    <p className="mt-2 text-neutral-400">Votre choix concerne uniquement cette demande. Il n’autorise pas les actions suivantes.</p>
    <p role="status" className="mt-3">{message}</p>
    {decisionMessage&&<p role="status" className="mt-3 rounded-lg border border-amber-500/30 p-3">{decisionMessage}</p>}
    {items.map(item=><article key={item.requestId} className="mt-3 space-y-3">
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-neutral-950 p-3">{item.inputJson}</pre>
      <p>{now>=Date.parse(item.expiresAt)?'Demande expirée.':`Temps restant : ${Math.max(0,Math.ceil((Date.parse(item.expiresAt)-now)/1000))} s`}</p>
      <div className="flex flex-wrap gap-2">{item.options.map(option=><button type="button" className={button} key={option.optionId}
        disabled={busy||now>=Date.parse(item.expiresAt)} onClick={()=>void decide(item,option.optionId)}>
        {option.kind==='allow_once'?'Autoriser cette fois':'Refuser cette fois'}</button>)}</div>
    </article>)}
  </section>;
}
