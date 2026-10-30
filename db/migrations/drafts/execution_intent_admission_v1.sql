-- LOCAL REVIEW DRAFT, NOT APPLIED. No route activation or new tables.
-- Requires producer v1, consume0033 and the sealed owner-spec ledger writer.
-- Service-role caller establishes owner identity and current policy. SQL binds
-- exact TS stableStringify source/payload bytes to the current locked row.
-- TS is the trusted HMAC sealer. SQL checks content/hash shape, NOT the HMAC key.
-- Other ledger writers may lack this mutex: uniqueness failures propagate and
-- roll back the entire transaction. No collision retry or partial receipt.
begin;
do $$ begin
 if to_regprocedure('public.classify_approval_decision(text,uuid,text,uuid,text)') is null
  or to_regprocedure('public.consume_approval_decision(text,uuid,text,text)') is null
  or to_regprocedure('public.append_atelier_owner_spec_ledger_v2(text,jsonb,jsonb)') is null
  or to_regprocedure('public.read_atelier_ledger_tail(text)') is null
  or to_regclass('public.action_ledger_genesis_unique') is null
  or to_regclass('public.action_ledger_prev_hash_unique') is null
  or to_regclass('public.action_ledger_entry_hash_unique') is null
  or not exists(select 1 from pg_trigger where tgrelid='public.action_ledger'::regclass
    and tgname='action_ledger_immutable' and tgenabled<>'D')
 then raise exception 'execution_intent_admission_prerequisite_missing'; end if;
end $$;

-- Observation only: no locks or writes; does not promise atomicity with a later network call.
create function public.check_execution_intent_admission_v1(
 p_workspace_id text,p_actor_id uuid,p_intent_id text,p_decision_id uuid,p_attempt_id uuid,
 p_source_json text,p_payload_json text
) returns jsonb language plpgsql volatile security invoker set search_path=public,pg_temp as $$
declare i public.agent_execution_intents%rowtype; d public.agent_review_approval_events%rowtype;
 l public.action_ledger%rowtype; source jsonb; payload jsonb; expected_source jsonb; expected_ledger jsonb;
 observed jsonb; actual_ledger jsonb; receipt jsonb; payload_hash text; source_hash text;
begin
 if p_actor_id is null or p_decision_id is null or p_attempt_id is null
  or char_length(coalesce(p_workspace_id,'')) not between 1 and 200
  or char_length(coalesce(p_intent_id,'')) not between 1 and 200
  or p_payload_json is null or octet_length(p_payload_json) not between 1 and 64000
  or p_source_json is null or octet_length(p_source_json) not between 1 and 70000
  then return jsonb_build_object('status','invalid_request'); end if;
 begin
  source:=p_source_json::jsonb; payload:=p_payload_json::jsonb;
 exception when invalid_text_representation then return jsonb_build_object('status','invalid_request'); end;
 payload_hash:=encode(sha256(convert_to(p_payload_json,'UTF8')),'hex');
 source_hash:=encode(sha256(convert_to(p_source_json,'UTF8')),'hex');
 select * into i from public.agent_execution_intents where workspace_id=p_workspace_id and intent_id=p_intent_id;
 if not found then return jsonb_build_object('status','not_found'); end if;
 expected_source:=jsonb_build_object('workspaceId',p_workspace_id,'actorId',p_actor_id::text,
  'intentId',p_intent_id,'agentId',i.agent_id,'skillId',i.skill_id,'toolName',i.tool_name,
  'autonomyLevel',i.autonomy_level,'payload',i.payload,'requiresCeoApproval',true);
 if source is distinct from expected_source or payload is distinct from i.payload
  or jsonb_typeof(payload) is distinct from 'object' or payload->>'agentId' is distinct from i.agent_id
  or payload->>'skillId' is distinct from i.skill_id or i.requires_ceo_approval is distinct from true
  then return jsonb_build_object('status','conflict'); end if;
 if i.status is distinct from 'executing' or i.action_ref is distinct from 'attempt:'||p_attempt_id::text
  then return jsonb_build_object('status','conflict'); end if;
 select * into d from public.agent_review_approval_events where id=p_decision_id
  and workspace_id=p_workspace_id and intent_id=p_intent_id;
 if not found then return jsonb_build_object('status','approval_required'); end if;
 observed:=public.classify_approval_decision(p_workspace_id,p_actor_id,p_intent_id,p_decision_id,payload_hash);
 if observed->>'state' is distinct from 'consumed' or d.status is distinct from 'consumed'
  or d.consumed_at is null or d.revoked_at is not null or d.expires_at is null
  or d.expires_at<=clock_timestamp() or d.consumed_at>clock_timestamp()
  or d.metadata->>'payloadJson' is distinct from p_payload_json
  then return jsonb_build_object('status','approval_required'); end if;
 expected_ledger:=jsonb_build_object('v',1,'id',p_attempt_id::text,'workspace_id',p_workspace_id,
  'user_id',p_actor_id::text,'agent_id',null,'skill_id',null,'mission_id',null,
  'action_type','execution_intent.owner_admitted','event_type','action','autonomy_level',0,
  'requires_confirmation',true,'summary','Explicit owner admission recorded before one execution attempt',
  'payload','{}'::jsonb,'metadata',jsonb_build_object('version',1,'principal','workspace_owner','phase','attempt',
    'intentId',p_intent_id,'decisionId',p_decision_id::text,'attemptId',p_attempt_id::text,
    'approvedDigest',payload_hash,'sourceHash',source_hash,'actualAgentId',i.agent_id,
    'actualSkillId',i.skill_id,'toolName',i.tool_name));
 select * into l from public.action_ledger where id=p_attempt_id and workspace_id=p_workspace_id;
 if not found then return jsonb_build_object('status','conflict'); end if;
 -- Project complete canonical content except created_at; nested metadata is
 -- compared as one exact JSONB value, not containment (extra keys are refused).
 -- Older ledger schemas may omit attribution columns. Default only missing keys;
 -- right-hand physical values always win, so a nonnull agent/skill is refused.
 select jsonb_object_agg(key,value) into actual_ledger from jsonb_each(jsonb_build_object('agent_id',null,'skill_id',null)||to_jsonb(l))
  where key in (select jsonb_object_keys(expected_ledger-'v'));
 if actual_ledger is distinct from expected_ledger-'v' or l.created_at is null
  or l.canonical_version is distinct from 1 or coalesce(l.entry_hash,'') !~ '^[a-f0-9]{64}$'
  or coalesce(l.hmac,'') !~ '^[a-f0-9]{64}$'
  or (l.prev_hash is not null and l.prev_hash !~ '^[a-f0-9]{64}$')
  then return jsonb_build_object('status','conflict'); end if;
 -- Re-read at the final observation boundary; expiry cannot be masked by consumed status.
 select * into d from public.agent_review_approval_events where id=p_decision_id
  and workspace_id=p_workspace_id and intent_id=p_intent_id;
 observed:=public.classify_approval_decision(p_workspace_id,p_actor_id,p_intent_id,p_decision_id,payload_hash);
 if observed->>'state' is distinct from 'consumed' or d.revoked_at is not null
  or d.expires_at is null or d.expires_at<=clock_timestamp() or d.consumed_at is null
  then return jsonb_build_object('status','approval_required'); end if;
 receipt:=jsonb_build_object('version',1,'workspaceId',p_workspace_id,'actorId',p_actor_id::text,
  'intentId',p_intent_id,'decisionId',p_decision_id::text,'attemptId',p_attempt_id::text,
  'payloadHash',payload_hash,'sourceHash',source_hash,'ledgerId',p_attempt_id::text,
  'ledgerHash',l.entry_hash,'admittedAt',d.consumed_at);
 return jsonb_build_object('status','current','receipt',receipt,'ledger',to_jsonb(l));
end $$;

create function public.admit_execution_intent_v1(
 p_workspace_id text,p_actor_id uuid,p_intent_id text,p_decision_id uuid,p_attempt_id uuid,
 p_source_json text,p_payload_json text,p_seal jsonb
) returns jsonb language plpgsql volatile security invoker set search_path=public,pg_temp as $$
declare i public.agent_execution_intents%rowtype; d public.agent_review_approval_events%rowtype;
 consumed public.agent_review_approval_events%rowtype; source jsonb; payload jsonb; expected_source jsonb;
 expected_ledger jsonb; observed jsonb; final_check jsonb; payload_hash text; source_hash text;
begin
 if p_actor_id is null or p_decision_id is null or p_attempt_id is null
  or char_length(coalesce(p_workspace_id,'')) not between 1 and 200
  or char_length(coalesce(p_intent_id,'')) not between 1 and 200
  or p_payload_json is null or octet_length(p_payload_json) not between 1 and 64000
  or p_source_json is null or octet_length(p_source_json) not between 1 and 70000
  then return jsonb_build_object('status','invalid_request'); end if;
 begin
  source:=p_source_json::jsonb; payload:=p_payload_json::jsonb;
 exception when invalid_text_representation then return jsonb_build_object('status','invalid_request'); end;
 payload_hash:=encode(sha256(convert_to(p_payload_json,'UTF8')),'hex');
 source_hash:=encode(sha256(convert_to(p_source_json,'UTF8')),'hex');
 if p_seal is null then return jsonb_build_object('status','invalid_request'); end if;
 -- Fixed lock order shared with owner-spec ledger writes; time is checked AFTER waits.
 select * into i from public.agent_execution_intents where workspace_id=p_workspace_id and intent_id=p_intent_id for update;
 if not found then return jsonb_build_object('status','not_found'); end if;
 expected_source:=jsonb_build_object('workspaceId',p_workspace_id,'actorId',p_actor_id::text,
  'intentId',p_intent_id,'agentId',i.agent_id,'skillId',i.skill_id,'toolName',i.tool_name,
  'autonomyLevel',i.autonomy_level,'payload',i.payload,'requiresCeoApproval',true);
 if source is distinct from expected_source or payload is distinct from i.payload
  or jsonb_typeof(payload) is distinct from 'object' or payload->>'agentId' is distinct from i.agent_id
  or payload->>'skillId' is distinct from i.skill_id or i.requires_ceo_approval is distinct from true
  then return jsonb_build_object('status','conflict'); end if;
 if i.status is distinct from 'pending' or i.action_ref is not null
  then return jsonb_build_object('status','conflict'); end if;
 perform pg_advisory_xact_lock(hashtextextended('atelier-ledger:'||p_workspace_id,0));
 select * into d from public.agent_review_approval_events where id=p_decision_id
  and workspace_id=p_workspace_id and intent_id=p_intent_id for update;
 if not found then return jsonb_build_object('status','approval_required'); end if;
 observed:=public.classify_approval_decision(p_workspace_id,p_actor_id,p_intent_id,p_decision_id,payload_hash);
 if observed->>'state' is distinct from 'approved' or d.status is distinct from 'approved'
  or d.consumed_at is not null or d.revoked_at is not null or d.expires_at is null
  or d.expires_at<=clock_timestamp() or d.metadata->>'payloadJson' is distinct from p_payload_json
  then return jsonb_build_object('status','approval_required'); end if;
 expected_ledger:=jsonb_build_object('v',1,'id',p_attempt_id::text,'workspace_id',p_workspace_id,
  'user_id',p_actor_id::text,'agent_id',null,'skill_id',null,'mission_id',null,
  'action_type','execution_intent.owner_admitted','event_type','action','autonomy_level',0,
  'requires_confirmation',true,'summary','Explicit owner admission recorded before one execution attempt',
  'payload','{}'::jsonb,'metadata',jsonb_build_object('version',1,'principal','workspace_owner','phase','attempt',
    'intentId',p_intent_id,'decisionId',p_decision_id::text,'attemptId',p_attempt_id::text,
    'approvedDigest',payload_hash,'sourceHash',source_hash,'actualAgentId',i.agent_id,
    'actualSkillId',i.skill_id,'toolName',i.tool_name));
 -- From the first effect onward, every failure must RAISE to roll back consume + ledger + claim.
 select * into consumed from public.consume_approval_decision(p_workspace_id,p_decision_id,p_intent_id,payload_hash);
 if not found or consumed.status is distinct from 'consumed' or consumed.consumed_at is null
  or consumed.revoked_at is not null or consumed.expires_at is null or consumed.expires_at<=clock_timestamp()
  then raise exception 'execution_intent_admission_consume_failed'; end if;
 if not public.append_atelier_owner_spec_ledger_v2(p_workspace_id,expected_ledger,p_seal)
  then raise exception 'execution_intent_admission_append_failed'; end if;
 update public.agent_execution_intents set status='executing',action_ref='attempt:'||p_attempt_id::text,
  failure_code=null,updated_at=greatest(clock_timestamp(),i.updated_at+interval '1 microsecond')
  where workspace_id=p_workspace_id and intent_id=p_intent_id and status='pending';
 if not found then raise exception 'execution_intent_admission_claim_failed'; end if;
 final_check:=public.check_execution_intent_admission_v1(p_workspace_id,p_actor_id,p_intent_id,p_decision_id,p_attempt_id,p_source_json,p_payload_json);
 if final_check->>'status' is distinct from 'current' or consumed.expires_at<=clock_timestamp()
  then raise exception 'execution_intent_admission_postcondition_failed'; end if;
 return jsonb_build_object('status','admitted','receipt',final_check->'receipt');
end $$;

revoke all on function public.admit_execution_intent_v1(text,uuid,text,uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.admit_execution_intent_v1(text,uuid,text,uuid,uuid,text,text,jsonb) to service_role;
revoke all on function public.check_execution_intent_admission_v1(text,uuid,text,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.check_execution_intent_admission_v1(text,uuid,text,uuid,uuid,text,text) to service_role;
commit;
