-- LOCAL REVIEW DRAFT, NOT APPLIED. Depends on 0010,0024,0033. No migration
-- number allocated. No runtime caller mounted. No change to consume0033.
-- Trust boundary: service_role server has verified a real human owner session
-- and the CURRENT existing licence + governed-action policy. DB membership is
-- config-first, NOT inferred from user_id, auth.users or intent creator.
-- payload_json is stableStringify v1 from the existing TS canonicalizer. SQL
-- verifies those bytes' digest AND JSONB equality, not a second canonicalizer.
-- Recording a human decision does not claim/consume/execute/write an action
-- ledger. Four0010 safety flags retain their original literaltrue meaning.
begin;

create function public.classify_approval_decision(
 p_workspace_id text,p_actor_id uuid,p_intent_id text,p_request_id uuid,p_payload_hash text
) returns jsonb language plpgsql volatile security invoker set search_path=public,pg_temp as $$
declare d public.agent_review_approval_events%rowtype; i public.agent_execution_intents%rowtype;
 snapshot jsonb; state text; payload_json text;
begin
 if p_actor_id is null or p_request_id is null or coalesce(p_workspace_id,'')='' or coalesce(p_intent_id,'')=''
  or coalesce(p_payload_hash,'') !~ '^[a-f0-9]{64}$' then return jsonb_build_object('state','invalid'); end if;
 select * into d from public.agent_review_approval_events where id=p_request_id
  and workspace_id=p_workspace_id and intent_id=p_intent_id and user_id=p_actor_id and payload_hash=p_payload_hash;
 if not found then return jsonb_build_object('state','missing'); end if;
 select * into i from public.agent_execution_intents where workspace_id=p_workspace_id and intent_id=p_intent_id;
 if not found then return jsonb_build_object('state','invalid'); end if;
 snapshot:=jsonb_build_object('agentId',i.agent_id,'skillId',i.skill_id,'toolName',i.tool_name,'autonomyLevel',i.autonomy_level,'payload',i.payload);
 payload_json:=d.metadata->>'payloadJson';
 if d.reviewer_id is distinct from p_actor_id::text or d.reviewer_role is distinct from 'owner'
  or d.decision is distinct from 'approved' or d.human_approved is distinct from true
  or d.ledger_required_before_execution is distinct from true or d.no_runtime_execution_authorized is distinct from true
  or d.no_auto_approval is distinct from true or d.approval_event_only is distinct from true
  or d.metadata->>'producer' is distinct from 'execution-intent-approval/v1'
  or d.metadata->>'requestId' is distinct from p_request_id::text or d.metadata->'confirmed' is distinct from 'true'::jsonb
  or d.metadata->'intentSnapshot' is distinct from snapshot or payload_json is null
  or octet_length(payload_json)>64000 or encode(sha256(convert_to(payload_json,'UTF8')),'hex') is distinct from p_payload_hash
  or d.source_packet_id is distinct from 'intent-review:'||p_request_id::text
  or d.source_queue_item_id is distinct from p_intent_id or d.agent_id is distinct from i.agent_id
  or d.outcome_id is distinct from 'intent:'||p_intent_id
  or d.approved_scope is distinct from jsonb_build_object('intentId',p_intent_id,'toolName',i.tool_name,'agentId',i.agent_id,'skillId',i.skill_id,'payloadHash',p_payload_hash)
  or d.constraints is distinct from '[]'::jsonb or d.guardrails is distinct from '[]'::jsonb
  or d.decision_rationale is null or char_length(btrim(d.decision_rationale)) not between 1 and 2000
  or d.expires_at is null or d.expires_at<=d.created_at or d.expires_at>d.created_at+interval '10 minutes'
  or d.status not in ('approved','consumed','revoked','expired') then return jsonb_build_object('state','invalid'); end if;
 begin
  if payload_json::jsonb is distinct from i.payload then return jsonb_build_object('state','invalid'); end if;
 exception when invalid_text_representation then return jsonb_build_object('state','invalid'); end;
 if d.revoked_at is not null or d.status='revoked' then state:='revoked';
 elsif d.status='consumed' and d.consumed_at is not null then state:='consumed';
 elsif d.expires_at<=clock_timestamp() or d.status='expired' then state:='expired';
 elsif d.status='approved' and d.consumed_at is null and i.status='pending' and i.requires_ceo_approval then state:='approved';
 else return jsonb_build_object('state','invalid'); end if;
 return jsonb_build_object('state',state,'decisionId',d.id::text,'requestId',p_request_id::text,
  'workspaceId',p_workspace_id,'actorId',p_actor_id::text,'intentId',p_intent_id,'payloadHash',p_payload_hash,
  'createdAt',d.created_at,'expiresAt',d.expires_at,'rationale',d.decision_rationale,'intentSnapshot',snapshot,
  'payloadJson',payload_json,'executionAuthorized',false);
end $$;

create function public.create_approval_decision(
 p_workspace_id text,p_actor_id uuid,p_intent_id text,p_request_id uuid,p_payload_hash text,
 p_payload_json text,p_expected_snapshot jsonb,p_confirmed boolean,p_rationale text,p_expires_at timestamptz
) returns jsonb language plpgsql volatile security invoker set search_path=public,pg_temp as $$
declare i public.agent_execution_intents%rowtype; d public.agent_review_approval_events%rowtype;
 snapshot jsonb; observed jsonb; at_time timestamptz;
begin
 if p_actor_id is null or p_request_id is null or p_confirmed is distinct from true
  or char_length(coalesce(p_workspace_id,'')) not between 1 and 200
  or char_length(coalesce(p_intent_id,'')) not between 1 and 200
  or coalesce(p_payload_hash,'') !~ '^[a-f0-9]{64}$' or p_payload_json is null
  or octet_length(p_payload_json) not between 1 and 64000
  or char_length(btrim(coalesce(p_rationale,''))) not between 1 and 2000
  or p_rationale is distinct from btrim(p_rationale) or p_expires_at is null
  or encode(sha256(convert_to(p_payload_json,'UTF8')),'hex') is distinct from p_payload_hash
  then return jsonb_build_object('status','invalid_request'); end if;
 -- Serializes all producers for this persisted intent, including differing request UUIDs.
 select * into i from public.agent_execution_intents where workspace_id = p_workspace_id and intent_id = p_intent_id for update;
 if not found then return jsonb_build_object('status','not_found'); end if;
 snapshot:=jsonb_build_object('agentId',i.agent_id,'skillId',i.skill_id,'toolName',i.tool_name,'autonomyLevel',i.autonomy_level,'payload',i.payload);
 if p_expected_snapshot is distinct from snapshot or i.requires_ceo_approval is distinct from true
  then return jsonb_build_object('status','conflict'); end if;
 begin
  if i.payload is distinct from p_payload_json::jsonb or jsonb_typeof(i.payload) is distinct from 'object'
   or i.payload->>'agentId' is distinct from i.agent_id or i.payload->>'skillId' is distinct from i.skill_id
   then return jsonb_build_object('status','conflict'); end if;
 exception when invalid_text_representation then return jsonb_build_object('status','invalid_request'); end;
 -- A duplicate UUID is observation ONLY. Never renew, change or re-approve it.
 select * into d from public.agent_review_approval_events where id=p_request_id;
 if found then
  if d.workspace_id is distinct from p_workspace_id or d.intent_id is distinct from p_intent_id
   or d.user_id is distinct from p_actor_id or d.payload_hash is distinct from p_payload_hash
   or d.metadata->>'payloadJson' is distinct from p_payload_json or d.metadata->'intentSnapshot' is distinct from snapshot
   or d.decision_rationale is distinct from p_rationale or d.expires_at is distinct from p_expires_at
   then return jsonb_build_object('status','conflict'); end if;
  observed:=public.classify_approval_decision(p_workspace_id,p_actor_id,p_intent_id,p_request_id,p_payload_hash);
  if observed->>'state' in ('missing','invalid') then return jsonb_build_object('status','conflict'); end if;
  return jsonb_build_object('status','existing','decision',observed);
 end if;
 if i.status is distinct from 'pending' then return jsonb_build_object('status','conflict'); end if;
 -- Conservative first-issuance contract: even an expired/revoked/consumed prior
 -- decision refuses reissuance. A future re-approval policy is NOT inferred here.
 if exists(select 1 from public.agent_review_approval_events where workspace_id=p_workspace_id and intent_id=p_intent_id)
  then return jsonb_build_object('status','already_decided'); end if;
 at_time:=clock_timestamp();
 if p_expires_at<=at_time or p_expires_at>at_time+interval '10 minutes' then return jsonb_build_object('status','invalid_request'); end if;
 insert into public.agent_review_approval_events(id,user_id,workspace_id,intent_id,payload_hash,
  source_packet_id,source_queue_item_id,agent_id,outcome_id,reviewer_id,reviewer_role,decision,decision_rationale,
  approved_scope,constraints,guardrails,human_approved,status,created_at,expires_at,metadata)
 values(p_request_id,p_actor_id,p_workspace_id,p_intent_id,p_payload_hash,'intent-review:'||p_request_id::text,
  p_intent_id,i.agent_id,'intent:'||p_intent_id,p_actor_id::text,'owner','approved',p_rationale,
  jsonb_build_object('intentId',p_intent_id,'toolName',i.tool_name,'agentId',i.agent_id,'skillId',i.skill_id,'payloadHash',p_payload_hash),
  '[]','[]',true,'approved',at_time,p_expires_at,
  jsonb_build_object('producer','execution-intent-approval/v1','requestId',p_request_id::text,'confirmed',true,'payloadJson',p_payload_json,'intentSnapshot',snapshot));
 observed:=public.classify_approval_decision(p_workspace_id,p_actor_id,p_intent_id,p_request_id,p_payload_hash);
 if observed->>'state' is distinct from 'approved' then raise exception 'approval_producer_postcondition_failed'; end if;
 return jsonb_build_object('status','created','decision',observed);
end $$;

revoke all on function public.classify_approval_decision(text,uuid,text,uuid,text) from public, anon, authenticated;
grant execute on function public.classify_approval_decision(text,uuid,text,uuid,text) to service_role;
revoke all on function public.create_approval_decision(text,uuid,text,uuid,text,text,jsonb,boolean,text,timestamptz) from public, anon, authenticated;
grant execute on function public.create_approval_decision(text,uuid,text,uuid,text,text,jsonb,boolean,text,timestamptz) to service_role;
commit;
