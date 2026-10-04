import { z } from "zod";
import { launchBindingSchema, type LaunchBinding } from "@/core/openhands-launch-contract";

export type LaunchResult = {kind:"prepared";binding:LaunchBinding} | {kind:"claimed";launchId:string}
  | {kind:"blocked"|"uncertain";message:string};
export async function requestLaunch(context:{workspaceId:string;missionId:string}, binding?:LaunchBinding,
  fetcher:typeof fetch=fetch):Promise<LaunchResult> {
  const uncertain=():LaunchResult=>({kind:binding?"uncertain":"blocked",message:binding
    ?"Confirmation non vérifiée. Actualisez la mission ; ne renvoyez pas la demande."
    :"La configuration n’a pas pu être vérifiée. Aucun lancement demandé."});
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15000);
  let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
  try {
    if(binding&&(binding.workspaceId!==context.workspaceId||binding.missionId!==context.missionId))return uncertain();
    const response=await fetcher('/api/orchestration/openhands',{method:'POST',credentials:'same-origin',redirect:'error',signal:controller.signal,
      headers:{'Content-Type':'application/json'},body:JSON.stringify({action:binding?'confirm_launch':'prepare_launch',missionId:context.missionId,
        ...(binding?{confirm:true,expectedLaunchHash:binding.launchHash}:{})})});
    if(!response.body||!response.headers.get('content-type')?.includes('application/json'))return uncertain();
    reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
    while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>16384)return uncertain();chunks.push(part.value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    const raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    if(!raw||raw.externalEffectAllowed!==false)return uncertain();
    if(!binding&&response.ok&&raw.status==='prepared'){
      const parsed=launchBindingSchema.safeParse(raw.binding);
      if(!parsed.success||parsed.data.workspaceId!==context.workspaceId||parsed.data.missionId!==context.missionId)return uncertain();
      Object.freeze(parsed.data.config);return {kind:'prepared',binding:Object.freeze(parsed.data)};
    }
    if(binding&&response.ok&&raw.status==='claimed'){
      const c=raw.claim;
      if(!c||!z.uuid().safeParse(c.launchId).success||c.state!=='claimed'||c.workspaceId!==context.workspaceId||c.missionId!==context.missionId
        ||c.launchHash!==binding.launchHash||c.payloadHash!==binding.payloadHash||c.reservationId!==binding.reservationId
        ||c.imageDigest!==binding.config.imageDigest||c.runnerId!==binding.config.runnerId||c.commitSha!==binding.commitSha)return uncertain();
      return {kind:'claimed',launchId:c.launchId};
    }
    const messages:Record<string,string>={disabled:'La confirmation du lancement est désactivée.',dossier_changed:'La configuration a changé. Actualisez et relisez la mission.',
      ineligible_mission:'Réservez d’abord un dossier compatible avec la configuration du serveur.',not_found:'Mission indisponible dans cet espace.',
      unauthenticated:'Reconnectez-vous pour poursuivre.',forbidden:'Cette confirmation est réservée au propriétaire.'};
    if(!binding&&typeof raw.status==='string'&&messages[raw.status])return {kind:'blocked',message:messages[raw.status]};
    return uncertain();
  }catch{return uncertain();}
  finally{clearTimeout(timer);controller.abort();if(reader)void reader.cancel().catch(()=>{});}
}
