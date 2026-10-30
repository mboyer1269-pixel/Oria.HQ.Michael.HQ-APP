-- DRAFT ONLY — NOT NUMBERED, NOT APPLIED. Depends on PR457 G1 head
-- b79e1cef590a071caa271b514b18abe24563b92a / 0033_approval_decision_consume.sql.
-- Does not create approvals, grant agents powers, start a process, or change RLS.
-- Also requires 0022/0023 sealed-ledger columns, unique indexes and append-only trigger.
-- No live caller may be wired before actual DB concurrency/rollback proofs.
begin;
do $$ begin
  if to_regprocedure('public.consume_approval_decision(text,uuid,text,text)') is null then
    raise exception 'g1_0033_prerequisite_missing';
  end if;
  if to_regclass('public.action_ledger_genesis_unique') is null
    or to_regclass('public.action_ledger_prev_hash_unique') is null
    or to_regclass('public.action_ledger_entry_hash_unique') is null then
    raise exception 'sealed_ledger_0022_0023_prerequisite_missing';
  end if;
end $$;

-- Read-only preparation. The claim transaction rechecks this head under its
-- workspace lock; other writers remain fenced by the existing unique indexes.
create or replace function public.read_atelier_ledger_tail(p_workspace_id text)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare tails jsonb;
begin
  if p_workspace_id is null or p_workspace_id = '' then raise exception 'invalid_workspace'; end if;
  if exists(select 1 from public.action_ledger where workspace_id=p_workspace_id
    and (entry_hash is null or entry_hash !~ '^[a-f0-9]{64}$'
      or (prev_hash is not null and prev_hash !~ '^[a-f0-9]{64}$')
      or hmac is null or hmac !~ '^[a-f0-9]{64}$' or canonical_version is distinct from 1)) then
    return jsonb_build_object('status','ledger_unavailable');
  end if;
  if not exists(select 1 from public.action_ledger where workspace_id=p_workspace_id) then
    return jsonb_build_object('status','ready','tail',null);
  end if;
  if (select count(*) from public.action_ledger where workspace_id=p_workspace_id and prev_hash is null) <> 1
    or exists(select 1 from public.action_ledger n where n.workspace_id=p_workspace_id and n.prev_hash is not null
      and not exists(select 1 from public.action_ledger p where p.workspace_id=p_workspace_id and p.entry_hash=n.prev_hash)) then
    return jsonb_build_object('status','ledger_unavailable');
  end if;
  select jsonb_agg(to_jsonb(l)) into tails from public.action_ledger l
    where l.workspace_id=p_workspace_id and not exists(select 1 from public.action_ledger n
      where n.workspace_id=p_workspace_id and n.prev_hash=l.entry_hash);
  if coalesce(jsonb_array_length(tails),0) <> 1 then return jsonb_build_object('status','ledger_unavailable'); end if;
  return jsonb_build_object('status','ready','tail',tails->0);
end $$;
revoke all on function public.read_atelier_ledger_tail(text) from public,anon,authenticated;
grant execute on function public.read_atelier_ledger_tail(text) to service_role;

create or replace function public.claim_atelier_execution(
  p_workspace_id text, p_actor_id uuid, p_mission_id text,
  p_expected_updated_at timestamptz, p_expected_snapshot jsonb,
  p_payload_json text, p_decision_id uuid, p_attempt_id uuid, p_ledger jsonb
) returns jsonb language plpgsql volatile security invoker set search_path = public, pg_temp as $$
declare
  m public.missions%rowtype;
  decision public.agent_review_approval_events%rowtype;
  consumed public.agent_review_approval_events%rowtype;
  payload jsonb; reservation jsonb; binding jsonb; prior jsonb; claim jsonb;
  source_snapshot jsonb; payload_hash text; intent_id text; at_time timestamptz;
  head jsonb; ledger_content jsonb; expected_ledger jsonb; ledger_created_at timestamptz;
begin
  -- Invalid server inputs cannot be silently coerced into an approval.
  if p_actor_id is null or p_decision_id is null or p_attempt_id is null
    or p_workspace_id is null or p_workspace_id = '' or p_mission_id is null
    or p_expected_updated_at is null or p_expected_snapshot is null
    or p_payload_json is null or octet_length(p_payload_json) > 32000 then
    raise exception 'invalid_atelier_execution_request';
  end if;
  payload := p_payload_json::jsonb;
  select * into m from public.missions where id = p_mission_id and workspace_id = p_workspace_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  reservation := m.input->'_atelierRun'; binding := reservation->'binding';
  if reservation is null or reservation->>'state' is distinct from 'reserved'
    or reservation->'version' is distinct from '1'::jsonb
    or reservation->'executionRequested' is distinct from 'false'::jsonb
    or binding->>'missionId' is distinct from m.id
    or binding->>'workspaceId' is distinct from m.workspace_id
    or binding->>'modeId' is distinct from m.mode_id
    or binding->>'actorId' is distinct from p_actor_id::text
    or m.input->'development'->>'createdBy' is distinct from p_actor_id::text
    or payload is distinct from jsonb_build_object('version',1,'operation','atelier.spec.start',
      'runId',reservation->>'runId','installationId',payload->>'installationId','binding',binding,
      'automaticCommitAllowed',false,'runtimeActivationAllowed',false)
    or coalesce(payload->>'runId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
    or coalesce(payload->>'installationId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
    or coalesce(binding->>'bindingHash','') !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('status','conflict');
  end if;
  payload_hash := encode(sha256(convert_to(p_payload_json,'UTF8')),'hex');
  intent_id := 'atelier1:' || m.workspace_id || ':' || m.id || ':' || (reservation->>'runId') || ':spec.start';
  prior := m.input->'_atelierExecution';
  if prior is not null then
    -- Replays only read the winning fact, never consume a second decision or start again.
    if prior->>'actorId' = p_actor_id::text and prior->>'workspaceId' = m.workspace_id
      and prior->>'missionId' = m.id and prior->>'runId' = reservation->>'runId'
      and prior->>'payloadHash' = payload_hash and prior->>'intentId' = intent_id
      and prior->>'bindingHash' = binding->>'bindingHash'
      and prior->>'installationId' = payload->>'installationId'
      and prior->>'state' = 'dispatch_requested' then
      return jsonb_build_object('status','existing','claim',prior);
    end if;
    return jsonb_build_object('status','reconciliation_required');
  end if;
  source_snapshot := jsonb_build_object('id',m.id,'workspace_id',m.workspace_id,'mode_id',m.mode_id,
    'title',m.title,'objective',m.objective,'assigned_agent_id',m.assigned_agent_id,'autonomy_level',m.autonomy_level,
    'status',m.status,'risk_level',m.risk_level,'requires_approval',m.requires_approval,'cost_budget_cents',m.cost_budget_cents,
    'input',m.input,'expected_output',m.expected_output,'result',m.result);
  if source_snapshot is distinct from p_expected_snapshot or m.updated_at is distinct from p_expected_updated_at
    or m.status <> 'draft' or m.assigned_agent_id <> '' or m.autonomy_level <> 0 or not m.requires_approval
    or binding->>'missionRiskLevel' is distinct from m.risk_level
    or binding->'limits'->'missionCostBudgetCents' is distinct from coalesce(to_jsonb(m.cost_budget_cents),'null'::jsonb)
    or binding->'limits'->'paidApiAllowed' is distinct from 'false'::jsonb
    or binding->'limits'->'externalEffectsAllowed' is distinct from 'false'::jsonb
    or binding->'limits'->'maxNewAgentSteps' is distinct from '1'::jsonb then
    return jsonb_build_object('status','conflict');
  end if;
  -- Keep the established TS v1 canonicalizer/HMAC sealer, never recreate it in SQL.
  -- service_role supplies the sealed envelope; the key itself is never sent here.
  -- SQL binds every content field to THIS operation and checks the exact byte hash.
  -- HMAC authenticity remains the existing trusted server writer's responsibility.
  if p_ledger is null or octet_length(p_ledger->>'canonicalJson') > 64000
    or p_ledger->'canonicalVersion' is distinct from '1'::jsonb
    or coalesce(p_ledger->>'entryHash','') !~ '^[a-f0-9]{64}$'
    or coalesce(p_ledger->>'hmac','') !~ '^[a-f0-9]{64}$'
    or (p_ledger->>'prevHash' is not null and p_ledger->>'prevHash' !~ '^[a-f0-9]{64}$')
    or p_ledger is distinct from jsonb_build_object('canonicalJson',p_ledger->>'canonicalJson',
      'prevHash',p_ledger->'prevHash','entryHash',p_ledger->>'entryHash','hmac',p_ledger->>'hmac','canonicalVersion',1) then
    return jsonb_build_object('status','conflict');
  end if;
  ledger_content := (p_ledger->>'canonicalJson')::jsonb;
  if coalesce(ledger_content->>'created_at','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$' then
    return jsonb_build_object('status','conflict');
  end if;
  ledger_created_at := (ledger_content->>'created_at')::timestamptz;
  expected_ledger := jsonb_build_object('v',1,'id',p_attempt_id::text,'workspace_id',m.workspace_id,
    'user_id',p_actor_id::text,'agent_id',null,'skill_id',null,'mission_id',m.id,
    'action_type','mission.atelier_dispatch_requested','event_type','action',
    'summary','Owner decision consumed for exact Atelier reservation; no runtime activated',
    'autonomy_level',0,'requires_confirmation',true,'payload',payload,
    'metadata',jsonb_build_object('attemptId',p_attempt_id::text,'decisionId',p_decision_id::text,'runId',reservation->>'runId',
      'intentId',intent_id,'payloadHash',payload_hash,'executionStarted',false),'created_at',ledger_content->>'created_at');
  if ledger_content is distinct from expected_ledger
    or encode(sha256(convert_to((p_ledger->>'canonicalJson') || E'\n' || coalesce(p_ledger->>'prevHash',''),'UTF8')),'hex')
      is distinct from p_ledger->>'entryHash' then return jsonb_build_object('status','conflict'); end if;
  -- Serialize this boundary's appends across missions, not just one mission row.
  -- Existing non-cooperating writers are still fenced by 0023: a fork/ledger
  -- conflict raises and rolls the ENTIRE transaction back; never auto-retry.
  perform pg_advisory_xact_lock(hashtextextended('atelier-ledger:' || m.workspace_id,0));
  head := public.read_atelier_ledger_tail(m.workspace_id);
  if head->>'status' is distinct from 'ready' then return jsonb_build_object('status','reconciliation_required'); end if;
  if head#>>'{tail,entry_hash}' is distinct from p_ledger->>'prevHash'
    or (head->'tail' <> 'null'::jsonb and ledger_created_at <= (head#>>'{tail,created_at}')::timestamptz) then
    return jsonb_build_object('status','conflict');
  end if;
  -- Lock the real G1 row BEFORE checking clock-time expiry/revocation. now() in G1
  -- is transaction-start time; this additional check closes a long lock-wait expiry.
  select * into decision from public.agent_review_approval_events where id = p_decision_id for update;
  if not found then return jsonb_build_object('status','approval_required'); end if;
  if decision.workspace_id is distinct from m.workspace_id or decision.intent_id is distinct from intent_id
    or decision.payload_hash is distinct from payload_hash or decision.user_id is distinct from p_actor_id
    or decision.reviewer_id is distinct from p_actor_id::text or decision.reviewer_role is distinct from 'owner'
    or decision.agent_id is distinct from 'builder'
    or decision.status is distinct from 'approved' or decision.decision is distinct from 'approved'
    or not decision.human_approved or decision.consumed_at is not null or decision.revoked_at is not null
    or decision.expires_at is null or decision.expires_at <= clock_timestamp()
    or decision.approved_scope->'allowedActionTypes' is distinct from '["atelier.spec.start"]'::jsonb
    or coalesce(decision.approved_scope->'deniedActionTypes', '[]'::jsonb) ? 'atelier.spec.start'
    or decision.constraints is distinct from '[]'::jsonb
    or decision.guardrails is distinct from '[]'::jsonb
    or decision.metadata->'atelierExecution' is distinct from payload
    or not decision.ledger_required_before_execution or not decision.no_runtime_execution_authorized
    or not decision.no_auto_approval or not decision.approval_event_only then
    return jsonb_build_object('status','approval_required');
  end if;
  select * into consumed from public.consume_approval_decision(m.workspace_id,p_decision_id,intent_id,payload_hash);
  if not found then return jsonb_build_object('status','approval_required'); end if;
  at_time := clock_timestamp();
  if decision.expires_at <= at_time then raise exception 'atelier_approval_expired_during_claim'; end if;
  claim := jsonb_build_object('version',1,'state','dispatch_requested',
    'missionId',m.id,'workspaceId',m.workspace_id,'actorId',p_actor_id::text,
    'runId',reservation->>'runId','attemptId',p_attempt_id::text,'installationId',payload->>'installationId',
    'decisionId',p_decision_id::text,'intentId',intent_id,'bindingHash',binding->>'bindingHash','payloadHash',payload_hash,
    'requestedAt',at_time,'consumedAt',consumed.consumed_at,'ledgerId',p_attempt_id::text,
    'executionStarted',false,'runtimeActivationAllowed',false);
  update public.missions set input = jsonb_set(m.input,'{_atelierExecution}',claim),
    updated_at = greatest(at_time,m.updated_at + interval '1 microsecond') where id = m.id and workspace_id = m.workspace_id;
  -- Any constraint/ledger error propagates: Postgres rolls back decision+claim+ledger
  -- together. Never ON CONFLICT DO NOTHING and never catch/return success after consumption.
  insert into public.action_ledger(id,user_id,workspace_id,mission_id,action_type,event_type,summary,
    autonomy_level,requires_confirmation,payload,metadata,model_id,cost_mode,created_at,
    prev_hash,entry_hash,hmac,canonical_version)
  values(p_attempt_id,p_actor_id,m.workspace_id,m.id,'mission.atelier_dispatch_requested','action',
    ledger_content->>'summary',0,true,payload,ledger_content->'metadata',
    binding->'selection'->>'modelId','subscription',ledger_created_at,
    p_ledger->>'prevHash',p_ledger->>'entryHash',p_ledger->>'hmac',1);
  return jsonb_build_object('status','claimed','claim',claim);
end $$;
revoke all on function public.claim_atelier_execution(text,uuid,text,timestamptz,jsonb,text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.claim_atelier_execution(text,uuid,text,timestamptz,jsonb,text,uuid,uuid,jsonb) to service_role;

-- A recovered claim is a historical fact, NEVER a permission to retry the external effect.
create or replace function public.lookup_atelier_execution(
  p_workspace_id text,p_actor_id uuid,p_mode_id text,p_mission_id text,p_run_id uuid
) returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare m public.missions%rowtype; claim jsonb;
begin
  select * into m from public.missions where id = p_mission_id and workspace_id = p_workspace_id and mode_id = p_mode_id;
  if not found or m.input->'_atelierRun'->'binding'->>'actorId' is distinct from p_actor_id::text
    or m.input->'_atelierRun'->>'runId' is distinct from p_run_id::text then
    return jsonb_build_object('status','not_found');
  end if;
  claim := m.input->'_atelierExecution';
  if claim is null then return jsonb_build_object('status','not_found'); end if;
  if claim->>'actorId' is distinct from p_actor_id::text or claim->>'workspaceId' is distinct from p_workspace_id
    or claim->>'missionId' is distinct from p_mission_id or claim->>'runId' is distinct from p_run_id::text then
    return jsonb_build_object('status','reconciliation_required');
  end if;
  return jsonb_build_object('status','existing','claim',claim);
end $$;
revoke all on function public.lookup_atelier_execution(text,uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.lookup_atelier_execution(text,uuid,text,text,uuid) to service_role;
commit;
