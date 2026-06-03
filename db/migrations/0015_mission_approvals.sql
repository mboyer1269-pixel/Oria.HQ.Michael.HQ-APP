-- Migration 0015: mission_approvals
--
-- RENAMING HISTORY
-- ----------------
-- This file was originally created as 0006_mission_approvals.sql, which caused
-- a numbering collision with 0006_arena_verdicts_restrictive_rls.sql (committed
-- earlier in the same slot). The collision was detected during a codebase audit
-- on 2026-06-03. This file is the canonical, correctly-numbered version.
--
-- The original 0006_mission_approvals.sql has been marked as superseded and must
-- NOT be applied separately. Apply this file (0015) instead.
--
-- If 0006_mission_approvals.sql was already applied to a Supabase instance,
-- this migration will be a safe no-op thanks to `create table if not exists`
-- and `create index if not exists` and `create policy if not exists` guards.
--
-- ---------------------------------------------------------------------------
-- Original migration body (unchanged):
-- ---------------------------------------------------------------------------
-- Migration: Create mission_approvals table and strict RLS policies

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
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'mission_approvals'
      and policyname = 'mission_approvals_block_anon_select'
  ) then
    execute 'create policy "mission_approvals_block_anon_select"
      on public.mission_approvals
      as restrictive for select to anon using (false)';
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'mission_approvals'
      and policyname = 'mission_approvals_block_authenticated_select'
  ) then
    execute 'create policy "mission_approvals_block_authenticated_select"
      on public.mission_approvals
      as restrictive for select to authenticated using (false)';
  end if;
end $$;

-- INSERT
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'mission_approvals'
      and policyname = 'mission_approvals_block_anon_insert'
  ) then
    execute 'create policy "mission_approvals_block_anon_insert"
      on public.mission_approvals
      as restrictive for insert to anon with check (false)';
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'mission_approvals'
      and policyname = 'mission_approvals_block_authenticated_insert'
  ) then
    execute 'create policy "mission_approvals_block_authenticated_insert"
      on public.mission_approvals
      as restrictive for insert to authenticated with check (false)';
  end if;
end $$;

-- UPDATE
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'mission_approvals'
      and policyname = 'mission_approvals_block_anon_update'
  ) then
    execute 'create policy "mission_approvals_block_anon_update"
      on public.mission_approvals
      as restrictive for update to anon using (false) with check (false)';
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'mission_approvals'
      and policyname = 'mission_approvals_block_authenticated_update'
  ) then
    execute 'create policy "mission_approvals_block_authenticated_update"
      on public.mission_approvals
      as restrictive for update to authenticated using (false) with check (false)';
  end if;
end $$;

-- DELETE
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'mission_approvals'
      and policyname = 'mission_approvals_block_anon_delete'
  ) then
    execute 'create policy "mission_approvals_block_anon_delete"
      on public.mission_approvals
      as restrictive for delete to anon using (false)';
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'mission_approvals'
      and policyname = 'mission_approvals_block_authenticated_delete'
  ) then
    execute 'create policy "mission_approvals_block_authenticated_delete"
      on public.mission_approvals
      as restrictive for delete to authenticated using (false)';
  end if;
end $$;
