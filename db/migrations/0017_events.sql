-- Migration 0017: events — append-only cockpit event stream for PR-1.
--
-- Do NOT apply in production without an explicit CEO GO.
--
-- PR-1 scope
-- ----------
-- This table stores the first real Michael HQ loop:
-- idea captured -> append event -> event projection -> visible after refresh.
--
-- Tenant decision
-- ---------------
-- The product prompt requested tenant_id, but this repository uses
-- workspace_id as the workspace boundary everywhere durable. To avoid creating
-- a parallel tenant model, this table uses workspace_id plus user_id.
--
-- What this is
-- ------------
-- An append-only event stream. PR-1 only writes `idea.captured`.
-- It is not the action ledger, not Widget Foundry, not runtime execution, and
-- not graph memory.

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null
    constraint events_workspace_id_check check (char_length(workspace_id) > 0),
  user_id uuid not null,
  stream_id text not null
    constraint events_stream_id_check check (char_length(stream_id) > 0),
  type text not null
    constraint events_type_check check (char_length(type) > 0),
  payload jsonb not null default '{}'::jsonb
    constraint events_payload_object_check check (jsonb_typeof(payload) = 'object'),
  valid_from timestamptz null,
  valid_to timestamptz null,
  recorded_at timestamptz not null default now(),

  constraint events_valid_range_check check (
    valid_from is null
    or valid_to is null
    or valid_from <= valid_to
  )
);

alter table public.events enable row level security;

create index if not exists events_workspace_recorded_at_idx
  on public.events(workspace_id, recorded_at desc);
create index if not exists events_workspace_type_recorded_at_idx
  on public.events(workspace_id, type, recorded_at desc);
create index if not exists events_stream_recorded_at_idx
  on public.events(stream_id, recorded_at desc);
create index if not exists events_user_workspace_recorded_at_idx
  on public.events(user_id, workspace_id, recorded_at desc);

-- Owner-scoped direct access. Server code still reads/writes through the
-- service-role repository and filters by both user_id and workspace_id.
create policy "events_owner_select"
  on public.events
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "events_owner_insert"
  on public.events
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- NO UPDATE policy.
-- NO DELETE policy.
-- Append-only behavior is also enforced by the application repository: insert
-- and list are the only exposed paths.

-- ---------------------------------------------------------------------------
-- Rollback (run manually to fully revert this migration)
-- ---------------------------------------------------------------------------
-- drop policy if exists "events_owner_select" on public.events;
-- drop policy if exists "events_owner_insert" on public.events;
-- drop index if exists public.events_user_workspace_recorded_at_idx;
-- drop index if exists public.events_stream_recorded_at_idx;
-- drop index if exists public.events_workspace_type_recorded_at_idx;
-- drop index if exists public.events_workspace_recorded_at_idx;
-- drop table if exists public.events;
