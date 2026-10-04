-- Owner decisions are server-only. Existing unbound records remain readable,
-- but the launch gate no longer treats them as an exact execution approval.
begin;
alter table public.mission_approvals add column if not exists binding jsonb;
alter table public.mission_approvals add column if not exists decision_sequence bigserial;
create index if not exists mission_approvals_latest_decision_idx
  on public.mission_approvals(mission_id, decision_sequence desc);

create or replace function public.commit_mission_approval_decision(
  p_workspace_id text, p_mission_id text, p_expected_updated_at timestamptz,
  p_previous_id text, p_record jsonb
) returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  current_id text;
  decision_time timestamptz := clock_timestamp();
begin
  -- Serialize owner decisions for this mission and prevent a changed plan from
  -- being approved by a browser holding an older preview.
  perform 1 from public.missions where id = p_mission_id and workspace_id = p_workspace_id
    and updated_at = p_expected_updated_at for update;
  if not found then return false; end if;
  select id into current_id from public.mission_approvals where mission_id = p_mission_id
    order by decision_sequence desc limit 1;
  if current_id is distinct from p_previous_id then return false; end if;
  if p_record->>'missionId' is distinct from p_mission_id
    or p_record->>'status' not in ('approved','rejected','revoked')
    or nullif(p_record->>'approvedBy','') is null
    or (p_record->>'status' = 'approved' and (
      p_record->'binding'->'access'->>'workspaceId' is distinct from p_workspace_id
      or p_record->'binding'->'launch'->>'missionId' is distinct from p_mission_id
      or (p_record->'binding'->>'missionVersion')::timestamptz is distinct from p_expected_updated_at
      or (p_record->>'expiresAt')::timestamptz <= decision_time
      or p_record->>'expiresAt' is null)) then
    raise exception 'invalid_mission_approval_decision';
  end if;
  insert into public.mission_approvals(id,mission_id,status,approval_scope,approved_by,approved_at,expires_at,created_at,reason,binding)
    values(p_record->>'id',p_mission_id,p_record->>'status',array['transition_to_running'],p_record->>'approvedBy',
      decision_time,(p_record->>'expiresAt')::timestamptz,decision_time,p_record->>'reason',p_record->'binding');
  insert into public.action_ledger(id,user_id,workspace_id,mission_id,action_type,event_type,summary,
    autonomy_level,requires_confirmation,payload,metadata,model_id,cost_mode)
    values((p_record->>'id')::uuid,(p_record->>'approvedBy')::uuid,p_workspace_id,p_mission_id,
      'mission.execution_approval','decision','Owner mission decision: ' || (p_record->>'status'),0,true,
      p_record,jsonb_build_object('approvalRecordId',p_record->>'id','decisionSequenceSource','mission_approvals'),
      p_record->'binding'->'access'->>'modelId','subscription');
  -- Withdrawal invalidates older mission CAS snapshots. This does not claim
  -- that a running container was stopped, and does not remove result evidence.
  if p_record->>'status' <> 'approved' then
    update public.missions set updated_at = decision_time where id = p_mission_id and workspace_id = p_workspace_id;
  end if;
  return true;
end $$;
revoke all on function public.commit_mission_approval_decision(text,text,timestamptz,text,jsonb) from public,anon,authenticated;
grant execute on function public.commit_mission_approval_decision(text,text,timestamptz,text,jsonb) to service_role;
grant usage,select on sequence public.mission_approvals_decision_sequence_seq to service_role;

-- Mission UPDATE already holds the row lock used above. Therefore a revocation
-- that commits first cannot be crossed by a stale dispatch CAS. If the dispatch
-- committed first, an external start may already be in flight; revocation does
-- not pretend to cancel that effect, but denies the next effectful transition.
create or replace function public.guard_mission_execution_approval()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
declare claim jsonb; decision public.mission_approvals%rowtype;
begin
  claim := new.input->'_openhandsLaunch';
  if claim is not null and claim is distinct from old.input->'_openhandsLaunch'
    and claim->>'state' in ('claimed','creation_requested','start_requested') then
    select * into decision from public.mission_approvals where mission_id = new.id
      order by decision_sequence desc limit 1;
    if not found or decision.status <> 'approved'
      or decision.id is distinct from claim->>'approvalRecordId'
      or decision.approved_by is distinct from claim->>'actorId'
      or decision.expires_at is null or decision.expires_at <= clock_timestamp()
      or not ('transition_to_running' = any(decision.approval_scope))
      or decision.binding->'launch'->>'launchHash' is distinct from claim->>'launchHash'
      or decision.binding->'launch'->>'missionId' is distinct from new.id
      or decision.binding->'launch'->>'workspaceId' is distinct from new.workspace_id then
      raise exception 'mission_execution_approval_changed';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_mission_execution_approval() from public,anon,authenticated;
drop trigger if exists mission_execution_approval_guard on public.missions;
create trigger mission_execution_approval_guard before update on public.missions
  for each row execute function public.guard_mission_execution_approval();
commit;
