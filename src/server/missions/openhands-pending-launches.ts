import "server-only";
import { z } from "zod";
import { createOptionalSupabaseAdminClient } from "@/server/supabase/admin";
import { createOpenHandsLaunchStore } from "./openhands-launch-store";
import { createOpenHandsLifecycleService } from "./openhands-lifecycle";
import { launchConfigSchema, launchClaimSchema, type LaunchStore } from "./openhands-launch";

export const pendingLaunchProfileSchema=z.object({
  context:z.object({workspaceId:z.string().min(1).max(160),actorId:z.string().min(1).max(160),runnerId:z.string().min(1).max(160)}).strict(),
  config:launchConfigSchema,
}).strict().refine(p=>p.context.runnerId===p.config.runnerId);
type Profile=z.infer<typeof pendingLaunchProfileSchema>;
type Candidate={id:string;input:unknown};
const BATCH_SIZE=20;

async function scanCandidates(profile:Profile,after?:string):Promise<Candidate[]>{
  const client=createOptionalSupabaseAdminClient();if(!client)throw Error('unavailable');
  let query=client.from('missions').select('id,input').eq('workspace_id',profile.context.workspaceId)
    .eq('input->_openhandsLaunch->>state','claimed')
    .eq('input->_openhandsLaunch->>actorId',profile.context.actorId)
    .eq('input->_openhandsLaunch->>runnerId',profile.context.runnerId)
    .order('id',{ascending:true}).limit(BATCH_SIZE);
  if(after)query=query.gt('id',after);
  const {data,error}=await query;if(error)throw Error('unavailable');return data??[];
}

/** Private host discovery only. Canonical missions remain the queue; discovery
 * neither renews authority nor acquires work. Dispatch CAS decides the winner. */
export function createPendingOpenHandsLaunchReader(deps:{
  scan?:(profile:Profile,after?:string)=>Promise<Candidate[]>;store?:()=>LaunchStore|null;now?:()=>number;
}={}){
  const lifecycle=createOpenHandsLifecycleService({store:deps.store??createOpenHandsLaunchStore,now:deps.now});
  return async(rawProfile:unknown,after?:string)=>{
    const profile=pendingLaunchProfileSchema.safeParse(rawProfile);
    if(!profile.success||(after!==undefined&&!z.uuid().safeParse(after).success))return {status:'invalid_request' as const};
    try{
      const rows=await(deps.scan??scanCandidates)(profile.data,after);
      if(rows.length>BATCH_SIZE||rows.some(row=>!z.uuid().safeParse(row.id).success))return {status:'unavailable' as const};
      const jobs:{missionId:string;launchId:string;payloadHash:string;authorizationExpiresAt:string}[]=[];
      let rejected=0;
      // Bound concurrent canonical rechecks rather than issuing an unbounded fan-out.
      for(let start=0;start<rows.length;start+=4){
        const results=await Promise.all(rows.slice(start,start+4).map(async row=>{
          const input=row.input as Record<string,unknown>|null;
          const claim=launchClaimSchema.safeParse(input?._openhandsLaunch);
          if(!claim.success||claim.data.missionId!==row.id||claim.data.state!=='claimed'
            ||claim.data.workspaceId!==profile.data.context.workspaceId||claim.data.actorId!==profile.data.context.actorId
            ||claim.data.runnerId!==profile.data.context.runnerId)return null;
          const observed=await lifecycle(profile.data.context,{missionId:row.id,launchId:claim.data.launchId,config:profile.data.config,transition:{next:'prepare'}});
          if(observed.status==='unavailable'||observed.status==='reconciliation_required')throw Error('canonical_read_unavailable');
          if(observed.status!=='observed'||!observed.claim)return null;
          return {missionId:row.id,launchId:observed.claim.launchId,payloadHash:observed.claim.payloadHash,authorizationExpiresAt:observed.claim.authorizationExpiresAt};
        }));
        for(const result of results){if(result)jobs.push(result);else rejected++;}
      }
      return {status:'ready' as const,jobs,rejected,scanned:rows.length,nextAfterMissionId:rows.length===BATCH_SIZE?rows[rows.length-1].id:null};
    }catch{return {status:'unavailable' as const};}
  };
}
