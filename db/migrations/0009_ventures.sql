-- Migration 0009: ventures — durable backing store for Venture Engine cards.
-- PR148.
--
-- Do NOT apply without an explicit CEO GO.
--
-- What this is
-- -----------
-- A venture card is a PLANNING/PORTFOLIO artifact only:
--   * It records an idea/candidate and its validation plan, score, autonomy
--     profile, assigned agents, and CEO decisions.
--   * It NEVER authorizes execution. Ventures do not execute; agents act only
--     within their per-domain autonomy profile, and risky domains stay approval
--     gated. There is intentionally NO "execution authorized" column here.
--   * It is NOT the action ledger — it never records executed actions.
-- This table is the Supabase backing store for the repository that currently
-- runs on an in-memory local fallback (see src/server/ventures/
-- venture-repository.ts). It is scoped per workspace. Fields mirror the
-- TypeScript contract in src/features/ventures/types.ts (VentureCard).
--
-- Who CAN access this table
-- -------------------------
-- The Supabase service-role key carries the `bypassrls` privilege and is
-- therefore unaffected by the policies below. All server-side code uses the
-- service-role client (createOptionalSupabaseAdminClient). NOTE: we do NOT add
-- policies "to service_role" — bypassrls makes them no-ops, and the repo
-- convention (0005_missions_rls / 0006_arena / 0008_governance) only ever names
-- anon and authenticated. Listing service_role would be misleading, not
-- protective.
--
-- Who CANNOT access this table
-- -----------------------------
-- The `anon` role (unauthenticated requests using the public anon key) and the
-- `authenticated` role (JWT-authenticated requests from the client). Both are
-- blocked for all operations by the RESTRICTIVE policies below — there is no
-- direct client access to ventures, ever.

create table if not exists public.ventures (
  id text primary key,
  workspace_id text not null
    constraint ventures_workspace_id_check check (char_length(workspace_id) > 0),
  name text not null,
  description text not null,
  source text not null
    constraint ventures_source_check check (
      source in (
        'human_created',
        'agent_suggested',
        'market_scan',
        'imported',
        'reworked_from_old_idea'
      )
    ),
  status text not null
    constraint ventures_status_check check (
      status in (
        'discovered',
        'candidate',
        'scored',
        'shortlisted',
        'approved_for_validation',
        'validating',
        'operating',
        'autonomous',
        'scaling',
        'paused',
        'killed',
        'archived'
      )
    ),
  target_customer text not null,
  problem text not null,
  offer text not null,
  primary_channel text not null,
  score jsonb null,
  validation_plan jsonb null,
  autonomy_profile jsonb not null,
  assigned_agents jsonb not null default '[]'::jsonb,
  decisions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

alter table public.ventures enable row level security;

create index if not exists ventures_workspace_id_idx
  on public.ventures(workspace_id);
create index if not exists ventures_workspace_status_idx
  on public.ventures(workspace_id, status);
create index if not exists ventures_workspace_updated_idx
  on public.ventures(workspace_id, updated_at desc);
create index if not exists ventures_updated_at_idx
  on public.ventures(updated_at desc);

-- RESTRICTIVE block-all policies (mirrors 0005_missions_rls / 0006_arena /
-- 0008_governance). With RLS enabled and these restrictive policies, anon and
-- authenticated are denied for every operation in addition to any future
-- permissive policy.

-- SELECT ------------------------------------------------------------------
create policy "ventures_block_anon_select"
  on public.ventures
  as restrictive
  for select
  to anon
  using (false);

create policy "ventures_block_authenticated_select"
  on public.ventures
  as restrictive
  for select
  to authenticated
  using (false);

-- INSERT ------------------------------------------------------------------
create policy "ventures_block_anon_insert"
  on public.ventures
  as restrictive
  for insert
  to anon
  with check (false);

create policy "ventures_block_authenticated_insert"
  on public.ventures
  as restrictive
  for insert
  to authenticated
  with check (false);

-- UPDATE ------------------------------------------------------------------
create policy "ventures_block_anon_update"
  on public.ventures
  as restrictive
  for update
  to anon
  using (false)
  with check (false);

create policy "ventures_block_authenticated_update"
  on public.ventures
  as restrictive
  for update
  to authenticated
  using (false)
  with check (false);

-- DELETE ------------------------------------------------------------------
create policy "ventures_block_anon_delete"
  on public.ventures
  as restrictive
  for delete
  to anon
  using (false);

create policy "ventures_block_authenticated_delete"
  on public.ventures
  as restrictive
  for delete
  to authenticated
  using (false);

-- ---------------------------------------------------------------------------
-- Rollback (run manually to fully revert this migration)
-- ---------------------------------------------------------------------------
-- drop policy if exists "ventures_block_anon_select" on public.ventures;
-- drop policy if exists "ventures_block_authenticated_select" on public.ventures;
-- drop policy if exists "ventures_block_anon_insert" on public.ventures;
-- drop policy if exists "ventures_block_authenticated_insert" on public.ventures;
-- drop policy if exists "ventures_block_anon_update" on public.ventures;
-- drop policy if exists "ventures_block_authenticated_update" on public.ventures;
-- drop policy if exists "ventures_block_anon_delete" on public.ventures;
-- drop policy if exists "ventures_block_authenticated_delete" on public.ventures;
-- drop index if exists public.ventures_updated_at_idx;
-- drop index if exists public.ventures_workspace_updated_idx;
-- drop index if exists public.ventures_workspace_status_idx;
-- drop index if exists public.ventures_workspace_id_idx;
-- drop table if exists public.ventures;
