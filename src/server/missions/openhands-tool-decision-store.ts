import "server-only";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { createOptionalSupabaseAdminClient } from "@/server/supabase/admin";
import type { Json } from "@/server/db/types";
import { bindToolPermission, matchToolDecision } from "./openhands-tool-permission";

function key(kind:string,requestHash:string) {
  const bytes=createHash('sha256').update(`${kind}:${requestHash}`).digest().subarray(0,16);
  bytes[6]=(bytes[6]&15)|128;bytes[8]=(bytes[8]&63)|128;
  const h=bytes.toString('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

/** Low-level durable storage, not an authorization boundary. A trusted service
 * must authenticate the reviewer and validate the active launch/session before
 * invoking either operation. Never expose these methods directly to a browser.
 * Raw tool arguments are never persisted here. No local in-memory fallback.
 */
export function createOpenHandsToolDecisionStore(client=createOptionalSupabaseAdminClient()) {
  if(!client)return null;
  async function read(request:unknown,actorId:string,now:number) {
    const binding=bindToolPermission(request,now);if(!binding)return null;
    const {data,error}=await client!.from('action_ledger').select().eq('id',key('tool-decision-v1',binding.requestHash))
      .eq('workspace_id',binding.request.workspaceId).eq('user_id',actorId).maybeSingle();
    if(error)throw Error('tool_decision_read_unknown');
    if(!data || data.mission_id!==binding.request.missionId || data.action_type!=='mission.openhands_tool_decision'
      ||data.event_type!=='decision'||data.user_id!==actorId||data.workspace_id!==binding.request.workspaceId)return null;
    const matched=matchToolDecision(request,data.payload,actorId,now);
    return matched&&matched.decision.decisionId===data.id?matched:null;
  }
  return {
    read,
    async persist(request:unknown,actorId:string,optionId:string,now:number) {
      const binding=bindToolPermission(request,now);if(!binding)throw Error('invalid_tool_request');
      const id=key('tool-decision-v1',binding.requestHash);
      const decision={version:1,decisionId:id,requestHash:binding.requestHash,actorId,optionId,decidedAt:new Date(now).toISOString()};
      if(!matchToolDecision(request,decision,actorId,now))throw Error('invalid_tool_decision');
      const {error}=await client!.from('action_ledger').upsert({id,user_id:actorId,workspace_id:binding.request.workspaceId,
        mission_id:binding.request.missionId,action_type:'mission.openhands_tool_decision',event_type:'decision',
        summary:'Exact per-call tool decision recorded; tool not executed',autonomy_level:0,requires_confirmation:true,
        payload:decision as unknown as Json,metadata:{},model_id:null,cost_mode:null,skill_id:null,agent_id:null},
        {onConflict:'id',ignoreDuplicates:true});
      if(error)throw Error('tool_decision_write_unknown');
      const canonical=await read(request,actorId,now);
      if(!canonical||canonical.decision.optionId!==optionId)throw Error('tool_decision_conflict');
      return canonical;
    },
    async consume(request:unknown,actorId:string,now:number) {
      const canonical=await read(request,actorId,now);if(!canonical)return null;
      const id=key('tool-consumption-v1',canonical.requestHash);
      const payload={requestHash:canonical.requestHash,decisionId:canonical.decision.decisionId,optionId:canonical.option.optionId};
      const {data,error}=await client!.from('action_ledger').upsert({id,user_id:actorId,workspace_id:canonical.request.workspaceId,
        mission_id:canonical.request.missionId,action_type:'mission.openhands_tool_consumption',event_type:'decision',
        summary:'Per-call decision consumed; execution result remains separate',autonomy_level:0,requires_confirmation:true,
        payload:payload as unknown as Json,metadata:{},model_id:null,cost_mode:null,skill_id:null,agent_id:null},
        {onConflict:'id',ignoreDuplicates:true}).select().maybeSingle();
      if(error)throw Error('tool_consumption_unknown');
      // Read-after-write cannot prove THIS consumer won. Only inserted returning
      // row grants a response; duplicate or ambiguous results remain denied.
      if(!data)return null;
      if(data.id!==id||!isDeepStrictEqual(data.payload,payload))throw Error('tool_consumption_unknown');
      return canonical;
    },
  };
}
