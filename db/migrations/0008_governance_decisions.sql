-- Migration 0008: governance_decisions — durable, auditable trace of rendered
-- governance decisions (the outcome of applying a CEO review to a Governance
-- Bundle). PR135.
--
-- Do NOT apply without an explicit CEO GO.
--
-- What this is
-- -----------
-- A Governance Decision Record is a PLANNING/AUDIT artifact only:
--   * It records that a decision was made (approved_to_plan, rejected, …).
--   * It NEVER authorizes execution. approve_to_plan is planning-only.
--   * It is NOT the action ledger — it never records executed actions.
-- This table is the Supabase backing store for the repository that currently
-- runs on an in-memory local fallback (see governance-decision-repository.ts).
-- It is scoped per workspace. Fields mirror the TypeScript contract in
-- src/server/agents/work-order-governance-decision-contract.ts.
--
-- Safety invariants enforced at the DB level (defense in depth, mirroring the
-- TypeScript contract):
--   * human_on_the_loop must be true.
--   * no_execution_authorized must be true.
--   * outcome must be one of the five decided governance outcomes.
--
-- Who CAN access this table
-- -------------------------
-- The Supabase service-role key carries the `bypassrls` privilege and is
-- therefore unaffected by the policies below. All server-side code uses the
-- service-role client (createOptionalSupabaseAdminClient). NOTE: we do NOT add
-- policies "to service_role" — bypassrls makes them no-ops, and the repo
-- convention (0005_missions_rls / 0006_arena) only ever names anon and
-- authenticated. Listing service_role would be misleading, not protective.
--
-- Who CANNOT access this table
-- -----------------------------
-- The `anon` role (unauthenticated requests using the public anon key) and the
-- `authenticated` role (JWT-authenticated requests from the client). Both are
-- blocked for all operations by the RESTRICTIVE policies below — there is no
-- direct client access to governance decisions, ever.

create table if not exists public.governance_decisions (
  id text primary key,
  workspace_id text not null
    constraint governance_decisions_workspace_id_check check (char_length(workspace_id) > 0),
  work_order_id text not null
    constraint governance_decisions_work_order_id_check check (char_length(work_order_id) > 0),
  bundle_id text not null
    constraint governance_decisions_bundle_id_check check (char_length(bundle_id) > 0),
  outcome text not null
    constraint governance_decisions_outcome_check check (
      outcome in (
        'approved_to_plan',
        'changes_requested',
        'rejected',
        'more_info_requested',
        'blocked_execution_request'
      )
    ),
  session_status text not null,
  review_id text null,
  review_decision text null,
  reviewer_id text not null
    constraint governance_decisions_reviewer_id_check check (char_length(reviewer_id) > 0),
  reviewer_role text not null,
  -- Safety belts: a governance decision is always rendered on the loop and
  -- never authorizes execution. Enforced as immutable truths at the DB level.
  human_on_the_loop boolean not null default true
    constraint governance_decisions_human_on_the_loop_check check (human_on_the_loop = true),
  no_execution_authorized boolean not null default true
    constraint governance_decisions_no_execution_check check (no_execution_authorized = true),
  decided_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.governance_decisions enable row level security;

create index if not exists governance_decisions_workspace_id_idx
  on public.governance_decisions(workspace_id);
create index if not exists governance_decisions_workspace_work_order_idx
  on public.governance_decisions(workspace_id, work_order_id);
create index if not exists governance_decisions_workspace_decided_idx
  on public.governance_decisions(workspace_id, decided_at desc);
create index if not exists governance_decisions_created_at_idx
  on public.governance_decisions(created_at desc);

-- RESTRICTIVE block-all policies (mirrors 0005_missions_rls / 0006_arena).
-- With RLS enabled and these restrictive policies, anon and authenticated are
-- denied for every operation in addition to any future permissive policy.

-- SELECT ------------------------------------------------------------------
create policy "governance_decisions_block_anon_select"
  on public.governance_decisions
  as restrictive
  for select
  to anon
  using (false);

create policy "governance_decisions_block_authenticated_select"
  on public.governance_decisions
  as restrictive
  for select
  to authenticated
  using (false);

-- INSERT ------------------------------------------------------------------
create policy "governance_decisions_block_anon_insert"
  on public.governance_decisions
  as restrictive
  for insert
  to anon
  with check (false);

create policy "governance_decisions_block_authenticated_insert"
  on public.governance_decisions
  as restrictive
  for insert
  to authenticated
  with check (false);

-- UPDATE ------------------------------------------------------------------
create policy "governance_decisions_block_anon_update"
  on public.governance_decisions
  as restrictive
  for update
  to anon
  using (false)
  with check (false);

create policy "governance_decisions_block_authenticated_update"
  on public.governance_decisions
  as restrictive
  for update
  to authenticated
  using (false)
  with check (false);

-- DELETE ------------------------------------------------------------------
create policy "governance_decisions_block_anon_delete"
  on public.governance_decisions
  as restrictive
  for delete
  to anon
  using (false);

create policy "governance_decisions_block_authenticated_delete"
  on public.governance_decisions
  as restrictive
  for delete
  to authenticated
  using (false);

-- ---------------------------------------------------------------------------
-- Rollback (run manually to fully revert this migration)
-- ---------------------------------------------------------------------------
-- drop policy if exists "governance_decisions_block_anon_select" on public.governance_decisions;
-- drop policy if exists "governance_decisions_block_authenticated_select" on public.governance_decisions;
-- drop policy if exists "governance_decisions_block_anon_insert" on public.governance_decisions;
-- drop policy if exists "governance_decisions_block_authenticated_insert" on public.governance_decisions;
-- drop policy if exists "governance_decisions_block_anon_update" on public.governance_decisions;
-- drop policy if exists "governance_decisions_block_authenticated_update" on public.governance_decisions;
-- drop policy if exists "governance_decisions_block_anon_delete" on public.governance_decisions;
-- drop policy if exists "governance_decisions_block_authenticated_delete" on public.governance_decisions;
-- drop index if exists public.governance_decisions_created_at_idx;
-- drop index if exists public.governance_decisions_workspace_decided_idx;
-- drop index if exists public.governance_decisions_workspace_work_order_idx;
-- drop index if exists public.governance_decisions_workspace_id_idx;
-- drop table if exists public.governance_decisions;
