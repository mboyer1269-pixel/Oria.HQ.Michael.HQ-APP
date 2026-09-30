import "server-only";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { createOptionalSupabaseAdminClient } from "@/server/supabase/admin";
import type { Json } from "@/server/db/types";
import { mapMissionRow } from "./mission-row";
import { OPENHANDS_LAUNCH_KEY, launchAuthoritySchema, type LaunchBinding, type LaunchStore, type LaunchAuthority } from "./openhands-launch";
import { OPENHANDS_RESERVATION_KEY, openHandsReceiptSchema, validateOpenHandsAuthorization } from "./openhands-reservation";
import { openHandsAuthorizationId } from "./openhands-authority-store";
import type { OpenHandsSubmissionDossier } from "./openhands-submission";

function authorityId(binding: LaunchBinding, actor: string) {
  const bytes = createHash("sha256").update(JSON.stringify(["openhands.launch.v1", binding.launchHash, actor])).digest().subarray(0,16);
  bytes[6]=(bytes[6]&15)|128; bytes[8]=(bytes[8]&63)|128;
  const h=bytes.toString("hex"); return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
export function createOpenHandsLaunchStore(client = createOptionalSupabaseAdminClient()): LaunchStore | null {
  if (!client) return null;
  const readAuthority: LaunchStore["readAuthority"] = async (binding, actor) => {
    const key=authorityId(binding,actor);
    const {data,error}=await client.from("action_ledger").select().eq("id",key).eq("workspace_id",binding.workspaceId).eq("user_id",actor).maybeSingle();
    if(error) throw Error("launch_authority_unavailable");
    if(!data || data.id!==key || data.user_id!==actor || data.workspace_id!==binding.workspaceId || data.mission_id!==binding.missionId
      || data.action_type!=="mission.openhands_launch_authorization" || data.event_type!=="decision" || !isDeepStrictEqual(data.payload,binding)) return null;
    const authority=launchAuthoritySchema.safeParse((data.metadata as {authorization?:unknown}|null)?.authorization);
    return authority.success && authority.data.id===key ? authority.data : null;
  };
  return {
    async readSubmission(mission,actor) {
      const receipt=openHandsReceiptSchema.safeParse(mission.input[OPENHANDS_RESERVATION_KEY]);
      if(!receipt.success || receipt.data.actorId!==actor) return null;
      const {data,error}=await client.from("action_ledger").select().eq("id",receipt.data.authorizationId)
        .eq("workspace_id",mission.workspaceId).eq("user_id",actor).maybeSingle();
      if(error) throw Error("submission_authority_unavailable");
      if(!data || data.action_type!=="mission.openhands_authorization" || data.event_type!=="decision"
        || data.mission_id!==mission.id || data.workspace_id!==mission.workspaceId || data.user_id!==actor) return null;
      const dossier=data.payload as unknown as OpenHandsSubmissionDossier;
      const raw=(data.metadata as {authorization?:{approvedAt?:string}}|null)?.authorization;
      if(!raw || !raw.approvedAt || !dossier?.mission || !dossier?.source || !dossier?.budget) return null;
      // This proves the historical submission decision; launch gets its own fresh authority.
      const authority=validateOpenHandsAuthorization(raw,dossier,actor,Date.parse(raw.approvedAt));
      if(!authority || authority.id!==data.id || data.id!==receipt.data.authorizationId
        || openHandsAuthorizationId(dossier,actor)!==data.id) return null;
      return dossier;
    },
    async load(workspaceId,missionId) {
      const {data,error}=await client.from("missions").select().eq("workspace_id",workspaceId).eq("id",missionId).maybeSingle();
      if(error) throw Error("launch_store_unavailable"); return data ? mapMissionRow(data) : null;
    },
    async compareAndSwap(mission,claim) {
      const input={...mission.input,[OPENHANDS_LAUNCH_KEY]:claim};
      const {data,error}=await client.from("missions").update({input:input as unknown as Json,updated_at:new Date().toISOString()})
        .eq("workspace_id",mission.workspaceId).eq("id",mission.id).eq("status",mission.status)
        .eq("updated_at",mission.updatedAt).eq("input",JSON.stringify(mission.input)).select().maybeSingle();
      if(error) throw Error("launch_claim_unknown"); return data ? mapMissionRow(data) : null;
    },
    async persistAuthority(binding,actor,now) {
      const key=authorityId(binding,actor);
      const authorization:LaunchAuthority={version:1,id:key,scope:"openhands.launch",workspaceId:binding.workspaceId,
        missionId:binding.missionId,reservationId:binding.reservationId,payloadHash:binding.payloadHash,launchHash:binding.launchHash,
        actorId:actor,approvedAt:new Date(now).toISOString(),expiresAt:new Date(now+600000).toISOString()};
      const {error}=await client.from("action_ledger").upsert({id:key,user_id:actor,workspace_id:binding.workspaceId,mission_id:binding.missionId,
        action_type:"mission.openhands_launch_authorization",event_type:"decision",summary:"Owner confirmed exact launch configuration; dispatch remains disabled",
        autonomy_level:0,requires_confirmation:true,payload:binding as unknown as Json,metadata:{authorization} as unknown as Json,
        model_id:null,cost_mode:null,skill_id:null,agent_id:null},{onConflict:"id",ignoreDuplicates:true});
      if(error) throw Error("launch_authority_unknown"); return readAuthority(binding,actor);
    },readAuthority,
  };
}
