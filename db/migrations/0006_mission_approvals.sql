-- Migration 0006: Create mission_approvals table and strict RLS policies

create table if not exists public.mission_approvals (
  id text primary key,
  mission_id text not null references public.missions(id) on delete cascade,
  status text not null,
  approval_scope text[] not null,
  approved_by text null,
  approved_at timestamptz null,
  expires_at timestamptz null,
  reason text null,
  created_at timestamptz not null default now()
);

alter table public.mission_approvals enable row level security;

create index if not exists mission_approvals_mission_id_idx on public.mission_approvals(mission_id);
create index if not exists mission_approvals_status_idx on public.mission_approvals(status);

-- SELECT
create policy "mission_approvals_block_anon_select"
  on public.mission_approvals
  as restrictive
  for select
  to anon
  using (false);

create policy "mission_approvals_block_authenticated_select"
  on public.mission_approvals
  as restrictive
  for select
  to authenticated
  using (false);

-- INSERT
create policy "mission_approvals_block_anon_insert"
  on public.mission_approvals
  as restrictive
  for insert
  to anon
  with check (false);

create policy "mission_approvals_block_authenticated_insert"
  on public.mission_approvals
  as restrictive
  for insert
  to authenticated
  with check (false);

-- UPDATE
create policy "mission_approvals_block_anon_update"
  on public.mission_approvals
  as restrictive
  for update
  to anon
  using (false)
  with check (false);

create policy "mission_approvals_block_authenticated_update"
  on public.mission_approvals
  as restrictive
  for update
  to authenticated
  using (false)
  with check (false);

-- DELETE
create policy "mission_approvals_block_anon_delete"
  on public.mission_approvals
  as restrictive
  for delete
  to anon
  using (false);

create policy "mission_approvals_block_authenticated_delete"
  on public.mission_approvals
  as restrictive
  for delete
  to authenticated
  using (false);
