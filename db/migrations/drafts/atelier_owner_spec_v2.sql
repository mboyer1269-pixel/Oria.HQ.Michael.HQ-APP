-- LOCAL VALIDATION CANDIDATE ONLY. No production application or mounted caller.
-- Depends on exact G1 0033 + reviewed LOT4 ledger-tail reader (PR462).
-- Owner decisions use G1, not an agent license. V1 receipts remain unchanged.
begin;
do $$ begin
  if to_regprocedure('public.consume_approval_decision(text,uuid,text,text)') is null
    or to_regprocedure('public.read_atelier_ledger_tail(text)') is null then
    raise exception 'owner_spec_prerequisite_missing';
  end if;
end $$;

create function public.owner_spec_source_v2(m public.missions) returns jsonb
language sql immutable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',m.id,'workspace_id',m.workspace_id,'mode_id',m.mode_id,
  'title',m.title,'objective',m.objective,'assigned_agent_id',m.assigned_agent_id,'autonomy_level',m.autonomy_level,
  'status',m.status,'risk_level',m.risk_level,'requires_approval',m.requires_approval,'cost_budget_cents',m.cost_budget_cents,
  'input',m.input-'_atelierOwnerSpecV2','expected_output',m.expected_output,'result',m.result);
$$;

create function public.valid_atelier_owner_spec_payload_v2(m public.missions,p_actor uuid,p_json text)
returns boolean language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare p jsonb; r jsonb; b jsonb; instructions text;
begin
 if p_actor is null or p_json is null or octet_length(p_json)>32000 then return false; end if;
 p:=p_json::jsonb; r:=m.input->'_atelierRun'; b:=r->'binding';
 instructions:='Owner-operated specification only. Write only SPEC.md. Do not commit, execute commands, contact external services, change code or tests.'
  ||E'\n\nTitle: '||m.title||E'\nObjective: '||m.objective||E'\nScope: '||(m.input#>>'{development,scope}')
  ||E'\nAcceptance criteria: '||(m.input#>>'{development,acceptanceCriteria}');
 if instructions is null or r->>'state' is distinct from 'reserved' or r->'version' is distinct from '1'::jsonb
  or r->'executionRequested' is distinct from 'false'::jsonb
  or b->>'workspaceId' is distinct from m.workspace_id or b->>'modeId' is distinct from m.mode_id
  or b->>'missionId' is distinct from m.id or b->>'actorId' is distinct from p_actor::text
  or m.input#>>'{development,createdBy}' is distinct from p_actor::text
  or m.status is distinct from 'draft' or m.autonomy_level is distinct from 0
  or m.assigned_agent_id is distinct from '' or m.requires_approval is distinct from true
  or b->>'missionRiskLevel' is distinct from m.risk_level
  or b#>'{limits,missionCostBudgetCents}' is distinct from coalesce(to_jsonb(m.cost_budget_cents),'null'::jsonb)
  or b#>'{limits,paidApiAllowed}' is distinct from 'false'::jsonb
  or b#>'{limits,externalEffectsAllowed}' is distinct from 'false'::jsonb
  or b#>'{limits,maxNewAgentSteps}' is distinct from '1'::jsonb
  or coalesce(b->>'bindingHash','') !~ '^[a-f0-9]{64}$'
  or p is distinct from jsonb_build_object('version',2,'operation','atelier.spec.start','workspaceId',m.workspace_id,
   'modeId',m.mode_id,'actorId',p_actor::text,'missionId',m.id,'runId',r->>'runId',
   'installationId',p->>'installationId','reviewId',p->>'reviewId','reviewExpiresAt',p->>'reviewExpiresAt','binding',b,
   'instructions',jsonb_build_object('version','owner-spec/v1','text',instructions,'sha256',encode(sha256(convert_to(instructions,'UTF8')),'hex')),
   'effects',jsonb_build_object('maxNewSteps',1,'output','SPEC.md','automaticCommitAllowed',false,'paidApiAllowed',false,'externalToolsAllowed',false))
  or coalesce(p->>'runId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  or coalesce(p->>'installationId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  or coalesce(p->>'reviewId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  or coalesce(p->>'reviewExpiresAt','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$' then return false; end if;
 -- Defense in depth for raw RPC calls: exact reservation shape and bounded primitives.
 -- Source/binding cryptographic derivation remains the existing trusted TS constructor;
 -- this SQL must never turn a malformed stored reservation into an approval.
 if b is distinct from jsonb_build_object('version',1,'workspaceId',m.workspace_id,'modeId',m.mode_id,'missionId',m.id,
   'actorId',p_actor::text,'missionVersion',b->>'missionVersion','developmentPayloadHash',m.input#>>'{development,payloadHash}',
   'missionRiskLevel',m.risk_level,'specialist',jsonb_build_object('agentId','builder','skillId','spec.draft','purpose','instruction_profile_only'),
   'repository',jsonb_build_object('relativePath',b#>>'{repository,relativePath}','baseSha',b#>>'{repository,baseSha}'),
   'selection',jsonb_build_object('runtimeId',b#>>'{selection,runtimeId}','modelId',b#>>'{selection,modelId}','catalogRevision',b#>>'{selection,catalogRevision}'),
   'limits',jsonb_build_object('timeoutMs',b#>'{limits,timeoutMs}','maxNewAgentSteps',1,'paidApiAllowed',false,
     'externalEffectsAllowed',false,'missionCostBudgetCents',coalesce(to_jsonb(m.cost_budget_cents),'null'::jsonb)),
   'output','SPEC.md','bindingHash',b->>'bindingHash')
  or coalesce(b#>>'{selection,runtimeId}','') not in ('codex','claude-code')
  or coalesce(b#>>'{selection,modelId}','') !~ '^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,159}$'
  or coalesce(b#>>'{selection,catalogRevision}','') !~ '^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,159}$'
  or coalesce(b#>>'{repository,baseSha}','') !~ '^([a-f0-9]{40}|[a-f0-9]{64})$'
  or coalesce(b#>>'{repository,relativePath}','')='' or length(b#>>'{repository,relativePath}')>600
  or b#>>'{repository,relativePath}' is distinct from btrim(b#>>'{repository,relativePath}')
  or b#>>'{repository,relativePath}' ~ '[:\\[:cntrl:]]'
  or exists(select 1 from unnest(string_to_array(b#>>'{repository,relativePath}','/')) part where part in ('','.','..'))
  or coalesce(b->>'developmentPayloadHash','') !~ '^[a-f0-9]{64}$'
  or coalesce(b->>'missionVersion','') !~ '^\d{4}-\d{2}-\d{2}T'
  or jsonb_typeof(b#>'{limits,timeoutMs}') is distinct from 'number'
  or coalesce(b#>>'{limits,timeoutMs}','') !~ '^[0-9]+$'
  or (b#>>'{limits,timeoutMs}')::numeric not between 1000 and 900000 then return false; end if;
 return true;
end $$;

-- Internal sealed writer: same frozen TS v1 canonicalizer, key never reaches DB.
-- SQL verifies exact bytes and expected content, not a second canonicalization or HMAC.
create function public.append_atelier_owner_spec_ledger_v2(p_workspace text,p_expected jsonb,p_seal jsonb)
returns boolean language plpgsql volatile security invoker set search_path=public,pg_temp as $$
declare c jsonb; head jsonb; at_time timestamptz;
begin
 if p_workspace is null or p_expected is null or p_seal is null
  or p_seal->>'canonicalJson' is null or octet_length(p_seal->>'canonicalJson')>200000
  or p_seal->'canonicalVersion' is distinct from '1'::jsonb
  or coalesce(p_seal->>'entryHash','') !~ '^[a-f0-9]{64}$' or coalesce(p_seal->>'hmac','') !~ '^[a-f0-9]{64}$'
  or (p_seal->>'prevHash' is not null and p_seal->>'prevHash' !~ '^[a-f0-9]{64}$')
  or p_seal is distinct from jsonb_build_object('canonicalJson',p_seal->>'canonicalJson','prevHash',p_seal->'prevHash',
    'entryHash',p_seal->>'entryHash','hmac',p_seal->>'hmac','canonicalVersion',1) then return false; end if;
 c:=(p_seal->>'canonicalJson')::jsonb;
 if c is distinct from (p_expected||jsonb_build_object('created_at',c->>'created_at'))
  or c->>'workspace_id' is distinct from p_workspace
  or coalesce(c->>'created_at','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
  or encode(sha256(convert_to((p_seal->>'canonicalJson')||E'\n'||coalesce(p_seal->>'prevHash',''),'UTF8')),'hex')
    is distinct from p_seal->>'entryHash' then return false; end if;
 at_time:=(c->>'created_at')::timestamptz;
 perform pg_advisory_xact_lock(hashtextextended('atelier-ledger:'||p_workspace,0));
 head:=public.read_atelier_ledger_tail(p_workspace);
 if head->>'status' is distinct from 'ready' or head#>>'{tail,entry_hash}' is distinct from p_seal->>'prevHash'
  or (head->'tail'<>'null'::jsonb and at_time<=(head#>>'{tail,created_at}')::timestamptz) then return false; end if;
 insert into public.action_ledger(id,user_id,workspace_id,mission_id,action_type,event_type,summary,autonomy_level,
  requires_confirmation,payload,metadata,model_id,cost_mode,created_at,prev_hash,entry_hash,hmac,canonical_version)
 values((c->>'id')::uuid,(c->>'user_id')::uuid,p_workspace,c->>'mission_id',c->>'action_type',c->>'event_type',c->>'summary',
  0,true,c->'payload',c->'metadata',null,'subscription',at_time,p_seal->>'prevHash',p_seal->>'entryHash',p_seal->>'hmac',1);
 return true;
end $$;

create function public.prepare_atelier_owner_spec_v2(p_workspace_id text,p_actor_id uuid,p_mission_id text,
 p_expected_updated_at timestamptz,p_expected_snapshot jsonb,p_payload_json text)
returns jsonb language plpgsql volatile security invoker set search_path=public,pg_temp as $$
declare m public.missions%rowtype; p jsonb; review jsonb;
begin
 select * into m from public.missions where id=p_mission_id and workspace_id=p_workspace_id for update;
 if not found then return jsonb_build_object('status','not_found'); end if;
 if m.input#>'{_atelierOwnerSpecV2,admission}' is not null then return jsonb_build_object('status','already_admitted'); end if;
 if p_expected_updated_at is null or m.updated_at is distinct from p_expected_updated_at
  or p_expected_snapshot is null or public.owner_spec_source_v2(m) is distinct from p_expected_snapshot
  or not public.valid_atelier_owner_spec_payload_v2(m,p_actor_id,p_payload_json) then return jsonb_build_object('status','conflict'); end if;
 p:=p_payload_json::jsonb;
 if (p->>'reviewExpiresAt')::timestamptz<=clock_timestamp()
  or (p->>'reviewExpiresAt')::timestamptz>clock_timestamp()+interval '10 minutes' then return jsonb_build_object('status','conflict'); end if;
 review:=jsonb_build_object('payloadJson',p_payload_json,'payloadHash',encode(sha256(convert_to(p_payload_json,'UTF8')),'hex'));
 update public.missions set input=jsonb_set(m.input,'{_atelierOwnerSpecV2}',jsonb_build_object('review',review,'sourceSnapshot',public.owner_spec_source_v2(m))),
  updated_at=greatest(clock_timestamp(),m.updated_at+interval '1 microsecond') where id=m.id and workspace_id=m.workspace_id;
 return jsonb_build_object('status','reviewed','review',review);
end $$;

create function public.owner_spec_ledger_content_v2(p jsonb,p_hash text,p_attempt uuid,p_decision uuid,p_id uuid,p_result jsonb)
returns jsonb language sql immutable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('v',1,'id',p_id::text,'workspace_id',p->>'workspaceId','user_id',p->>'actorId',
  'agent_id',null,'skill_id',null,'mission_id',p->>'missionId','autonomy_level',0,'requires_confirmation',true,
  'action_type',case when p_result is null then 'mission.atelier_owner_spec_admitted' else 'mission.atelier_owner_spec_result' end,
  'event_type',case when p_result is null then 'action' else 'result' end,
  'summary',case when p_result is null then 'Explicit owner command admitted for one bound spec step' else 'Observed owner spec result recorded; no new execution authorized' end,
  'payload',coalesce(p_result,p),'metadata',jsonb_build_object('version',2,'operation','atelier.spec.start','principal','workspace_owner',
    'runId',p->>'runId','attemptId',p_attempt::text,'decisionId',p_decision::text,'payloadHash',p_hash));
$$;

create function public.admit_atelier_owner_spec_v2(p_workspace_id text,p_actor_id uuid,p_mission_id text,
 p_review_hash text,p_decision_id uuid,p_attempt_id uuid,p_seal jsonb)
returns jsonb language plpgsql volatile security invoker set search_path=public,pg_temp as $$
declare m public.missions%rowtype; review jsonb; p jsonb; prior jsonb; receipt jsonb; intent text;
 consumed public.agent_review_approval_events%rowtype;
begin
 if p_actor_id is null or p_decision_id is null or p_attempt_id is null or coalesce(p_review_hash,'') !~ '^[a-f0-9]{64}$' then
  return jsonb_build_object('status','conflict'); end if;
 select * into m from public.missions where id=p_mission_id and workspace_id=p_workspace_id for update;
 if not found then return jsonb_build_object('status','not_found'); end if;
 review:=m.input#>'{_atelierOwnerSpecV2,review}';
 if review->>'payloadHash' is distinct from p_review_hash or review->>'payloadJson' is null
  or encode(sha256(convert_to(review->>'payloadJson','UTF8')),'hex') is distinct from p_review_hash then return jsonb_build_object('status','conflict'); end if;
 p:=(review->>'payloadJson')::jsonb;
 if p->>'actorId' is distinct from p_actor_id::text or p->>'workspaceId' is distinct from p_workspace_id
  or p->>'missionId' is distinct from p_mission_id then return jsonb_build_object('status','conflict'); end if;
 prior:=m.input#>'{_atelierOwnerSpecV2,admission}';
 if prior is not null then return jsonb_build_object('status','existing','receipt',prior); end if;
 if not public.valid_atelier_owner_spec_payload_v2(m,p_actor_id,review->>'payloadJson')
  or public.owner_spec_source_v2(m) is distinct from m.input#>'{_atelierOwnerSpecV2,sourceSnapshot}' then return jsonb_build_object('status','conflict'); end if;
 if (p->>'reviewExpiresAt')::timestamptz<=clock_timestamp() then return jsonb_build_object('status','approval_required'); end if;
 if not public.append_atelier_owner_spec_ledger_v2(p_workspace_id,
  public.owner_spec_ledger_content_v2(p,p_review_hash,p_attempt_id,p_decision_id,p_attempt_id,null),p_seal) then return jsonb_build_object('status','conflict'); end if;
 intent:='atelier2:'||p_workspace_id||':'||p_mission_id||':'||(p->>'runId')||':spec.start';
 -- This endpoint's trusted server caller has authenticated the explicit owner gesture.
 -- The four G1 flags retain their meaning: the event ALONE authorizes no execution.
 insert into public.agent_review_approval_events(id,user_id,workspace_id,intent_id,payload_hash,
  source_packet_id,source_queue_item_id,agent_id,outcome_id,reviewer_id,reviewer_role,decision,decision_rationale,
  approved_scope,constraints,guardrails,human_approved,status,expires_at,future_ledger_entry_id,metadata)
 values(p_decision_id,p_actor_id,p_workspace_id,intent,p_review_hash,'atelier-owner-review-v2:'||(p->>'reviewId'),
  'owner-command:'||(p->>'runId'),'owner-operated-atelier','requested-spec:'||(p->>'runId'),p_actor_id::text,'owner','approved',
  'Explicit authenticated owner confirmation of the exact specification snapshot',jsonb_build_object('allowedActionTypes',jsonb_build_array('atelier.spec.start')),
  '[]','[]',true,'approved',(p->>'reviewExpiresAt')::timestamptz,p_attempt_id,
  jsonb_build_object('principal','workspace_owner','reviewSnapshot',review,'sourceMissionId',m.id));
 select * into consumed from public.consume_approval_decision(p_workspace_id,p_decision_id,intent,p_review_hash);
 if not found or consumed.expires_at<=clock_timestamp() then raise exception 'owner_spec_consume_failed'; end if;
 receipt:=jsonb_build_object('version',2,'state','admitted','workspaceId',p_workspace_id,'actorId',p_actor_id::text,
  'missionId',m.id,'runId',p->>'runId','installationId',p->>'installationId','attemptId',p_attempt_id::text,
  'decisionId',p_decision_id::text,'payloadHash',p_review_hash,'bindingHash',p#>>'{binding,bindingHash}',
  'ledgerId',p_attempt_id::text,'admittedAt',clock_timestamp());
 update public.missions set input=jsonb_set(m.input,'{_atelierOwnerSpecV2,admission}',receipt),
  updated_at=greatest(clock_timestamp(),m.updated_at+interval '1 microsecond') where id=m.id and workspace_id=m.workspace_id;
 return jsonb_build_object('status','admitted','receipt',receipt);
end $$;

create function public.check_atelier_owner_spec_admission_v2(p_workspace_id text,p_actor_id uuid,p_mission_id text,p_attempt_id uuid,p_review_hash text)
returns jsonb language plpgsql volatile security invoker set search_path=public,pg_temp as $$
declare m public.missions%rowtype; a jsonb; d public.agent_review_approval_events%rowtype;
begin
 select * into m from public.missions where id=p_mission_id and workspace_id=p_workspace_id;
 if not found then return jsonb_build_object('status','not_found'); end if;
 a:=m.input#>'{_atelierOwnerSpecV2,admission}';
 if a is null or a->>'actorId' is distinct from p_actor_id::text or a->>'workspaceId' is distinct from p_workspace_id
  or a->>'missionId' is distinct from p_mission_id or a->>'attemptId' is distinct from p_attempt_id::text
  or a->>'payloadHash' is distinct from p_review_hash or m.input#>'{_atelierOwnerSpecV2,result}' is not null
  or public.owner_spec_source_v2(m) is distinct from m.input#>'{_atelierOwnerSpecV2,sourceSnapshot}' then return jsonb_build_object('status','refused'); end if;
 select * into d from public.agent_review_approval_events where id=(a->>'decisionId')::uuid;
 if not found or d.status is distinct from 'consumed' or d.consumed_at is null or d.revoked_at is not null
  or d.expires_at is null or d.expires_at<=clock_timestamp() or d.workspace_id is distinct from p_workspace_id
  or d.user_id is distinct from p_actor_id or d.reviewer_id is distinct from p_actor_id::text or d.reviewer_role is distinct from 'owner'
  or d.payload_hash is distinct from p_review_hash or d.future_ledger_entry_id is distinct from p_attempt_id
  or d.intent_id is distinct from ('atelier2:'||p_workspace_id||':'||p_mission_id||':'||(a->>'runId')||':spec.start')
  or d.agent_id is distinct from 'owner-operated-atelier' or d.decision is distinct from 'approved' or d.human_approved is distinct from true
  or d.metadata->'reviewSnapshot' is distinct from m.input#>'{_atelierOwnerSpecV2,review}'
  or not d.ledger_required_before_execution or not d.no_runtime_execution_authorized or not d.no_auto_approval or not d.approval_event_only
  or d.approved_scope is distinct from '{"allowedActionTypes":["atelier.spec.start"]}'::jsonb
  or d.constraints is distinct from '[]'::jsonb or d.guardrails is distinct from '[]'::jsonb then return jsonb_build_object('status','refused'); end if;
 return jsonb_build_object('status','current','receipt',a);
end $$;

create function public.record_atelier_owner_spec_result_v2(p_workspace_id text,p_actor_id uuid,p_mission_id text,
 p_attempt_id uuid,p_review_hash text,p_result jsonb,p_result_id uuid,p_seal jsonb)
returns jsonb language plpgsql volatile security invoker set search_path=public,pg_temp as $$
declare m public.missions%rowtype; a jsonb; p jsonb; prior jsonb; evidence jsonb; expected jsonb; spec text; bytes integer; digest text;
begin
 if p_actor_id is null or p_attempt_id is null or p_result_id is null or p_result is null
  or octet_length(p_result::text)>200000 or coalesce(p_result->>'status','') not in ('succeeded','failed','blocked','interrupted','reconciliation_required')
  or coalesce(jsonb_typeof(p_result->'sessionId'),'missing') not in ('string','null')
  or (jsonb_typeof(p_result->'sessionId')='string' and length(p_result->>'sessionId') not between 1 and 300)
  then return jsonb_build_object('status','conflict'); end if;
 select * into m from public.missions where id=p_mission_id and workspace_id=p_workspace_id for update;
 if not found then return jsonb_build_object('status','not_found'); end if;
 a:=m.input#>'{_atelierOwnerSpecV2,admission}';
 if a is null or a->>'actorId' is distinct from p_actor_id::text or a->>'workspaceId' is distinct from p_workspace_id
  or a->>'missionId' is distinct from p_mission_id or a->>'attemptId' is distinct from p_attempt_id::text
  or a->>'payloadHash' is distinct from p_review_hash then return jsonb_build_object('status','conflict'); end if;
 p:=(m.input#>>'{_atelierOwnerSpecV2,review,payloadJson}')::jsonb;
 if p is null then return jsonb_build_object('status','conflict'); end if;
 if p_result->>'status'='succeeded' then
  evidence:=p_result->'evidence'; spec:=evidence->>'specText'; bytes:=octet_length(spec);
  if spec is null or bytes not between 1 and 64000 or jsonb_typeof(evidence->'specText') is distinct from 'string'
   or jsonb_typeof(p_result->'sessionId') is distinct from 'string' then return jsonb_build_object('status','conflict'); end if;
  digest:=encode(sha256(convert_to(spec,'UTF8')),'hex');
  expected:=jsonb_build_object('status','succeeded','sessionId',p_result->'sessionId','evidence',jsonb_build_object(
   'specText',spec,'sha256',digest,'bytes',bytes,'manifest',jsonb_build_object('version',2,'workspaceId',p_workspace_id,
    'actorId',p_actor_id::text,'missionId',m.id,'runId',p->>'runId','installationId',p->>'installationId',
    'attemptId',p_attempt_id::text,'decisionId',a->>'decisionId','stepId',p_attempt_id::text,
    'instructionHash',p#>>'{instructions,sha256}','sessionId',p_result->'sessionId','payloadHash',p_review_hash,
    'bindingHash',p#>>'{binding,bindingHash}','baseSha',p#>>'{binding,repository,baseSha}',
    'headSha',p#>>'{binding,repository,baseSha}','artifact',jsonb_build_object('kind','spec','path','SPEC.md','sha256',digest,'bytes',bytes))));
 else expected:=jsonb_build_object('status',p_result->>'status','sessionId',p_result->'sessionId'); end if;
 if p_result is distinct from expected then return jsonb_build_object('status','conflict'); end if;
 prior:=m.input#>'{_atelierOwnerSpecV2,result}';
 if prior is not null then
  return jsonb_build_object('status',case when prior=p_result then 'existing' else 'conflict' end);
 end if;
 if not public.append_atelier_owner_spec_ledger_v2(p_workspace_id,
  public.owner_spec_ledger_content_v2(p,p_review_hash,p_attempt_id,(a->>'decisionId')::uuid,p_result_id,p_result),p_seal)
  then return jsonb_build_object('status','conflict'); end if;
 update public.missions set input=jsonb_set(m.input,'{_atelierOwnerSpecV2,result}',p_result),
  result=coalesce(m.result,'{}'::jsonb)||jsonb_build_object('atelierOwnerSpecV2',p_result),
  updated_at=greatest(clock_timestamp(),m.updated_at+interval '1 microsecond') where id=m.id and workspace_id=m.workspace_id;
 return jsonb_build_object('status','recorded');
end $$;

-- No new table or RLS bypass. Internal helpers remain service-role-only too.
revoke all on function public.owner_spec_source_v2(public.missions) from public,anon,authenticated;
revoke all on function public.valid_atelier_owner_spec_payload_v2(public.missions,uuid,text) from public,anon,authenticated;
revoke all on function public.append_atelier_owner_spec_ledger_v2(text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.owner_spec_ledger_content_v2(jsonb,text,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.prepare_atelier_owner_spec_v2(text,uuid,text,timestamptz,jsonb,text) from public,anon,authenticated;
revoke all on function public.admit_atelier_owner_spec_v2(text,uuid,text,text,uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.check_atelier_owner_spec_admission_v2(text,uuid,text,uuid,text) from public,anon,authenticated;
revoke all on function public.record_atelier_owner_spec_result_v2(text,uuid,text,uuid,text,jsonb,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.owner_spec_source_v2(public.missions),public.valid_atelier_owner_spec_payload_v2(public.missions,uuid,text),
 public.append_atelier_owner_spec_ledger_v2(text,jsonb,jsonb),public.owner_spec_ledger_content_v2(jsonb,text,uuid,uuid,uuid,jsonb),
 public.prepare_atelier_owner_spec_v2(text,uuid,text,timestamptz,jsonb,text),public.admit_atelier_owner_spec_v2(text,uuid,text,text,uuid,uuid,jsonb),
 public.check_atelier_owner_spec_admission_v2(text,uuid,text,uuid,text),public.record_atelier_owner_spec_result_v2(text,uuid,text,uuid,text,jsonb,uuid,jsonb) to service_role;
commit;
