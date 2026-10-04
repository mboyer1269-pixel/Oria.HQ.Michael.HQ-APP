import "server-only";
import {constants} from "node:fs";
import {open} from "node:fs/promises";
import {z} from "zod";
import {createOpenHandsLaunchStore} from "./openhands-launch-store";
import {launchClaimSchema} from "./openhands-launch";

const state=z.enum(['unknown','absent','identity_mismatch','created','running','paused','restarting','removing','exited','dead']);
const reportSchema=z.object({version:z.literal(1),launchId:z.uuid(),missionId:z.uuid(),workspaceId:z.string(),runnerId:z.string(),observedAt:z.iso.datetime({offset:true}),canonicalState:z.string(),canonicalObservationStable:z.boolean(),status:z.enum(['observed','changed_during_inspection']),gateway:z.object({containerState:state,networkState:z.enum(['unknown','absent','identity_mismatch','present']),inspectionIncomplete:z.boolean().optional()}).passthrough().nullable(),automaticRetry:z.literal(false),resourcesModified:z.literal(false),resumeAuthorized:z.literal(false),independentValidationPassed:z.literal(false)});

async function readReport(launchId:string){
  const file=await open(`/run/oria-hq-reports/${launchId}.json`,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{
    const info=await file.stat();
    if(!info.isFile()||info.uid!==0||(info.mode&0o022)!==0||info.size>16384)throw Error('invalid_report');
    const buffer=Buffer.alloc(16385);const {bytesRead}=await file.read(buffer,0,buffer.length,0);
    if(bytesRead>16384)throw Error('oversized_report');
    return JSON.parse(buffer.subarray(0,bytesRead).toString('utf8'));
  }finally{await file.close();}
}

export function createOpenHandsRecoveryReader(deps={store:createOpenHandsLaunchStore,read:readReport,now:Date.now}){
  return async(owner:{actorId:string;workspaceId:string},missionId:string)=>{
    const store=deps.store();if(!store)return {status:'unavailable' as const};
    const mission=await store.load(owner.workspaceId,z.uuid().parse(missionId));
    const claim=launchClaimSchema.safeParse(mission?.input._openhandsLaunch);
    if(!claim.success||claim.data.actorId!==owner.actorId||claim.data.workspaceId!==owner.workspaceId||claim.data.missionId!==missionId)return {status:'not_found' as const};
    try{
      const report=reportSchema.parse(await deps.read(claim.data.launchId));
      if(report.launchId!==claim.data.launchId||report.missionId!==missionId||report.workspaceId!==owner.workspaceId||report.runnerId!==claim.data.runnerId)return {status:'unavailable' as const};
      const age=deps.now()-Date.parse(report.observedAt);
      const stale=age<0||age>60000||!report.canonicalObservationStable||report.canonicalState!==claim.data.state;
      return {status:'ready' as const,stale,observedAt:report.observedAt,canonicalState:claim.data.state,
        containerState:report.gateway?.containerState??'not_applicable',networkState:report.gateway?.networkState??'not_applicable',inspectionIncomplete:report.gateway?.inspectionIncomplete??false};
    }catch{return {status:'unavailable' as const};}
  };
}
