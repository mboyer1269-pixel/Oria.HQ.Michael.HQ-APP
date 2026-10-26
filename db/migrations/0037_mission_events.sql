-- Migration 0037: mission_events — append-only, per-mission ordered history.
-- Prepared only: NOT APPLIED to any remote database by this change. Idempotent.
-- Spec: docs/architecture/MISSION-EVENTS-SPEC.md
-- Requires 0032_workspace_members.sql (RLS membership). Does NOT require a
-- public.workspaces table (absent on main): workspace_id is text, like every
-- other durable table on main. Numbered 0037 to avoid colliding with PR #424
-- (0033_workspaces .. 0036_agent_display_names on feat/agent-display-names-v2).
begin;

create table if not exists public.mission_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null check (char_length(workspace_id) between 1 and 160),
  mission_id text not null check (char_length(mission_id) between 1 and 160),
  seq integer not null check (seq >= 1),
  intent_key text not null check (char_length(intent_key) between 1 and 200),
  event_type text not null check (event_type in (
    'mission_queued','mission_started','step_started','tool_call_completed',
    'run_cost_recorded','approval_requested','approval_granted','approval_rejected',
    'approval_consumed','payload_changed','mission_blocked','mission_cancelled',
    'mission_succeeded','mission_failed','outcome_unknown')),
  state text not null check (state in (
    'queued','running','waiting_approval','approved','approval_stale','blocked',
    'cancelled','succeeded','failed','outcome_unknown')),
  trace_id text not null check (char_length(trace_id) between 1 and 200),
  payload_hash text null check (payload_hash ~ '^[a-f0-9]{64}$'),
  actor text not null check (char_length(actor) between 1 and 160),
  channel text not null check (channel in ('screen','mobile','voice','agent','system')),
  capability text null check (capability ~ '^[a-z][a-z0-9_.:-]{0,119}$'),
  grant_id text null check (char_length(grant_id) between 1 and 160),
  expires_at timestamptz null,
  cost_micro_usd bigint null check (cost_micro_usd >= 0),
  cost_source text null check (cost_source in ('measured','estimated')),
  provider text null check (char_length(provider) between 1 and 80),
  model text null check (char_length(model) between 1 and 132),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  constraint mission_events_cost_consistent check ((cost_micro_usd is null) = (cost_source is null)),
  constraint mission_events_seq_unique unique (workspace_id, mission_id, seq),
  constraint mission_events_intent_unique unique (workspace_id, intent_key),
  -- Approval-shaped events must bind to an exact payload and a capability.
  constraint mission_events_approval_binding check (
    event_type not in ('approval_requested','approval_granted','approval_consumed')
    or (payload_hash is not null and capability is not null and grant_id is not null)),
  constraint mission_events_approval_expiry check (
    event_type not in ('approval_requested','approval_granted') or expires_at is not null),
  -- Voice may never approve irreversible/external capabilities.
  constraint mission_events_voice_no_irreversible_approval check (
    not (channel = 'voice' and event_type in ('approval_granted','approval_consumed')
         and split_part(capability, ':', 1) in ('external_send','payment','merge','delete')))
);

create index if not exists mission_events_mission_seq_idx on public.mission_events (mission_id, seq);
create index if not exists mission_events_trace_idx on public.mission_events (trace_id);
create index if not exists mission_events_workspace_occurred_idx on public.mission_events (workspace_id, occurred_at desc);
-- Single-use grants: a grant can be consumed at most once.
create unique index if not exists mission_events_grant_single_use_idx
  on public.mission_events (workspace_id, mission_id, grant_id) where event_type = 'approval_consumed';
create unique index if not exists mission_events_grant_once_idx
  on public.mission_events (workspace_id, mission_id, grant_id) where event_type = 'approval_granted';

-- Append-only: no UPDATE, DELETE or TRUNCATE for anyone (incl. service_role).
create or replace function public.mission_events_reject_mutation() returns trigger
language plpgsql as $$
begin
  raise exception 'mission_events is append-only (% refused)', tg_op using errcode = '42501';
end $$;

-- Insert guard: dense monotonic seq per mission + single-use, unexpired, non-stale grant consumption.
-- SECURITY DEFINER so seq/grant checks see the whole mission even under RLS;
-- it first refuses a JWT caller who is not a workspace member (no seq leak).
create or replace function public.mission_events_before_insert() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  expected integer;
  g record;
  latest_hash text;
begin
  if (select auth.uid()) is not null and not exists (select 1 from public.workspace_members m
      where m.workspace_id = new.workspace_id and m.user_id = (select auth.uid())) then
    raise exception 'new row violates row-level security policy for table "mission_events"' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.workspace_id || '/' || new.mission_id, 0));
  select coalesce(max(seq), 0) + 1 into expected from public.mission_events
    where workspace_id = new.workspace_id and mission_id = new.mission_id;
  if new.seq <> expected then
    raise exception 'mission_events seq must be % (got %)', expected, new.seq using errcode = '23514';
  end if;
  if new.event_type = 'approval_consumed' then
    select * into g from public.mission_events
      where workspace_id = new.workspace_id and mission_id = new.mission_id
        and event_type = 'approval_granted' and grant_id = new.grant_id;
    if not found then
      raise exception 'approval grant % not found', new.grant_id using errcode = '23514';
    end if;
    if g.payload_hash <> new.payload_hash or g.capability <> new.capability then
      raise exception 'approval grant % bound to another payload/capability', new.grant_id using errcode = '23514';
    end if;
    if g.expires_at <= new.occurred_at then
      raise exception 'approval grant % expired', new.grant_id using errcode = '23514';
    end if;
    select payload_hash into latest_hash from public.mission_events
      where workspace_id = new.workspace_id and mission_id = new.mission_id
        and seq > g.seq and payload_hash is not null and payload_hash <> g.payload_hash
      limit 1;
    if latest_hash is not null then
      raise exception 'approval grant % is stale', new.grant_id using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

revoke all on function public.mission_events_before_insert() from public, anon, authenticated;

drop trigger if exists mission_events_no_update on public.mission_events;
create trigger mission_events_no_update before update or delete on public.mission_events
  for each row execute function public.mission_events_reject_mutation();
drop trigger if exists mission_events_no_truncate on public.mission_events;
create trigger mission_events_no_truncate before truncate on public.mission_events
  for each statement execute function public.mission_events_reject_mutation();
drop trigger if exists mission_events_insert_guard on public.mission_events;
create trigger mission_events_insert_guard before insert on public.mission_events
  for each row execute function public.mission_events_before_insert();

alter table public.mission_events enable row level security;
revoke all on public.mission_events from public, anon, authenticated;
grant select, insert on public.mission_events to authenticated;
grant select, insert on public.mission_events to service_role;

drop policy if exists mission_events_member_read on public.mission_events;
drop policy if exists mission_events_member_insert on public.mission_events;
create policy mission_events_member_read on public.mission_events for select to authenticated
  using (exists (select 1 from public.workspace_members m
    where m.workspace_id = mission_events.workspace_id and m.user_id = (select auth.uid())));
create policy mission_events_member_insert on public.mission_events for insert to authenticated
  with check (exists (select 1 from public.workspace_members m
    where m.workspace_id = mission_events.workspace_id and m.user_id = (select auth.uid())));

-- Derived approval status per grant (security_invoker: caller's RLS applies).
create or replace view public.mission_approval_status with (security_invoker = true) as
select g.workspace_id, g.mission_id, g.grant_id, g.capability, g.payload_hash, g.seq as granted_seq,
       g.expires_at,
       exists (select 1 from public.mission_events l
         where l.workspace_id = g.workspace_id and l.mission_id = g.mission_id and l.seq > g.seq
           and l.payload_hash is not null and l.payload_hash <> g.payload_hash) as stale,
       exists (select 1 from public.mission_events c
         where c.workspace_id = g.workspace_id and c.mission_id = g.mission_id
           and c.event_type = 'approval_consumed' and c.grant_id = g.grant_id) as consumed,
       (g.expires_at <= now()) as expired
from public.mission_events g
where g.event_type = 'approval_granted';
revoke all on public.mission_approval_status from public, anon;
grant select on public.mission_approval_status to authenticated, service_role;

commit;
