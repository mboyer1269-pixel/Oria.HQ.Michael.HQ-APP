import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Mission } from "@/core/types";
import { persistMissionDraftDurable } from "./mission-draft-durable-repository";
import { createOptionalSupabaseAdminClient } from "@/server/supabase/admin";
import { mapMissionRow } from "./mission-row";
import { isDurableMissionDraftEnabled } from "./mission-persistence-flag";
export const developmentInputSchema=z.object({requestId:z.string().uuid(),title:z.string().trim().min(1).max(200),objective:z.string().trim().min(1).max(4000),scope:z.string().trim().min(1).max(1000),acceptanceCriteria:z.string().trim().min(1).max(2000)}).strict();
export type DevelopmentInput=z.infer<typeof developmentInputSchema>;
export type DevelopmentReceipt={status:"saved";missionId:string;title:string;missionStatus:Mission["status"];updatedAt:string;executionRequested:false}|{status:"disabled"|"unavailable"|"outcome_unknown"|"not_found"|"conflict"|"invalid_request"};
export type DevelopmentStore={save:(mission:Mission)=>Promise<Mission>;load:(workspaceId:string,missionId:string)=>Promise<Mission|null>};
/** RFC 9562 UUIDv5, fixed DNS namespace and an application-qualified scoped name. */
export function developmentMissionId(workspaceId:string,requestId:string):string {
 const namespace=Buffer.from("6ba7b8109dad11d180b400c04fd430c8","hex");
 const bytes=createHash("sha1").update(namespace).update(JSON.stringify(["oria.hq.development",workspaceId,requestId.toLowerCase()])).digest().subarray(0,16);
 bytes[6]=(bytes[6]&15)|80;bytes[8]=(bytes[8]&63)|128;const hex=bytes.toString("hex");return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export function createDevelopmentStore():DevelopmentStore|null {
 const db=createOptionalSupabaseAdminClient();if(!db)return null;
 return {save:mission=>persistMissionDraftDurable(mission,db),load:async(workspaceId,missionId)=>{
  const {data,error}=await db.from("missions").select().eq("id",missionId).eq("workspace_id",workspaceId).maybeSingle();
  if(error)throw Error("read unavailable");return data?mapMissionRow(data):null;
 }};
}
const receipt=(mission:Mission):DevelopmentReceipt=>({status:"saved",missionId:mission.id,title:mission.title,missionStatus:mission.status,updatedAt:mission.updatedAt,executionRequested:false});
export function createDevelopmentService(deps:{enabled?:()=>boolean;store?:()=>DevelopmentStore|null}={}) {
 return {
  async create(input:DevelopmentInput,context:{workspaceId:string;modeId:string;actorId:string}):Promise<DevelopmentReceipt>{
   if(!(deps.enabled??isDurableMissionDraftEnabled)())return {status:"disabled"};
   const store=(deps.store??createDevelopmentStore)();if(!store)return {status:"unavailable"};
   const parsedRes=developmentInputSchema.safeParse(input);
   if(!parsedRes.success)return {status:"invalid_request"};
   const parsed=parsedRes.data;
   const payloadHash=createHash("sha256").update(JSON.stringify([parsed.title,parsed.objective,parsed.scope,parsed.acceptanceCriteria,context.modeId,context.actorId])).digest("hex");
   const now=new Date().toISOString();const mission:Mission={id:developmentMissionId(context.workspaceId,parsed.requestId),workspaceId:context.workspaceId,modeId:context.modeId,title:parsed.title,objective:parsed.objective,assignedAgentId:"",autonomyLevel:0,status:"draft",riskLevel:"medium",requiresApproval:true,
    input:{development:{version:1,requestId:parsed.requestId.toLowerCase(),scope:parsed.scope,acceptanceCriteria:parsed.acceptanceCriteria,createdBy:context.actorId,payloadHash}},expectedOutput:`Périmètre autorisé :\n${parsed.scope}\n\nCritères d’acceptation :\n${parsed.acceptanceCriteria}\n\nLivrer les changements et les preuves de validation. Aucun déploiement automatique.`,createdAt:now,updatedAt:now};
   try{const stored=await store.save(mission);const meta=stored.input.development as Record<string,unknown>|undefined;
    if(stored.workspaceId!==context.workspaceId||stored.modeId!==context.modeId||stored.id!==mission.id||meta?.version!==1||meta.payloadHash!==payloadHash)return {status:"conflict"};
    return receipt(stored);
   }catch{return {status:"outcome_unknown"};}
  },
  async lookup(requestId:string,workspaceId:string):Promise<DevelopmentReceipt>{
   if(!(deps.enabled??isDurableMissionDraftEnabled)())return {status:"disabled"};
   const store=(deps.store??createDevelopmentStore)();if(!store)return {status:"unavailable"};
   const uuidRes=z.string().uuid().safeParse(requestId);
   if(!uuidRes.success)return {status:"invalid_request"};
   try{const mission=await store.load(workspaceId,developmentMissionId(workspaceId,requestId));if(!mission)return {status:"not_found"};
    const meta=mission.input.development as Record<string,unknown>|undefined;
    if(mission.workspaceId!==workspaceId||meta?.version!==1||meta.requestId!==requestId.toLowerCase())return {status:"conflict"};return receipt(mission);
   }catch{return {status:"unavailable"};}
  }
 };
}
