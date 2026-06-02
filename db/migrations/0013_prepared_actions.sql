-- Migration 0013: prepared_actions — durable, auditable backing store for the
-- CEO review queue produced by Hermès, the iterative prep agent.
--
-- Do NOT apply without an explicit CEO GO.
--
-- What this is
-- -----------
-- A prepared action bundles, for a single cash move: the CashActionPacket, a
-- compact Council readiness summary, and the HermesOutreachPlan. The prep
-- worker writes prepared actions; the Cash Action Review screen reads them. It
-- is an APPEND-ONLY queue:
--   * It NEVER executes, sends, contacts, charges, or dispatches anything.
--   * It is NOT the action ledger and authorizes nothing.
--   * Status transitions are append-only (a new superseding row), never an
--     in-place update — mirroring the proof-log discipline of 0011 / 0012.
--   * It is the Supabase backing store for the repository that otherwise runs
--     on an in-memory local fallback (see
--     src/server/ventures/prepared-action-repository.ts). Scoped per workspace.
--     Columns mirror the TypeScript PreparedAction contract in
--     src/features/ventures/prepared-action.ts.
--
-- Safety invariants at the storage layer
-- --------------------------------------
-- requires_ceo_approval, requires_manual_send, and no_execution_authorized are
-- forced to true by CHECK constraints (mirrors 0011). It is impossible to
-- persist a prepared action that authorizes execution or auto-send.
--
-- Who CAN access this table
-- -------------------------
-- Only the Supabase service-role key (bypassrls). All server-side code uses the
-- service-role admin client (createOptionalSupabaseAdminClient). Per repo
-- convention (0005 / 0006 / 0008 / 0009 / 0012) we do NOT name service_role in
-- any policy — bypassrls makes such a policy a misleading no-op.
--
-- Who CANNOT access this table
-- -----------------------------
-- The `anon` role and the `authenticated` role are blocked for every operation
-- by the RESTRICTIVE policies below. There is no direct client access, ever.

create table if not exists public.prepared_actions (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null
    constraint prepared_actions_workspace_id_check check (char_length(workspace_id) > 0),
  created_by_user_id uuid not null,
  prepared_action_id text not null
    constraint prepared_actions_prepared_action_id_check check (char_length(prepared_action_id) > 0),
  venture_id text not null
    constraint prepared_actions_venture_id_check check (char_length(venture_id) > 0),
  cash_action_packet_id text not null
    constraint prepared_actions_packet_id_check check (char_length(cash_action_packet_id) > 0),
  content_hash text not null
    constraint prepared_actions_content_hash_check check (char_length(content_hash) > 0),
  supersedes_id text null,
  packet jsonb not null,
  council jsonb not null,
  hermes_plan jsonb not null,
  priority text not null
    constraint prepared_actions_priority_check check (
      priority in ('critical', 'high', 'medium', 'low')
    ),
  priority_score double precision not null
    constraint prepared_actions_priority_score_check check (priority_score >= 0),
  status text not null
    constraint prepared_actions_status_check check (
      status in (
        'prepared',
        'ready_for_ceo_review',
        'approved_for_manual_send',
        'rejected',
        'superseded'
      )
    ),

  -- Safety invariants: these columns must always be true.
  requires_ceo_approval boolean not null default true
    constraint prepared_actions_requires_ceo_approval_check check (requires_ceo_approval = true),
  requires_manual_send boolean not null default true
    constraint prepared_actions_requires_manual_send_check check (requires_manual_send = true),
  no_execution_authorized boolean not null default true
    constraint prepared_actions_no_execution_authorized_check check (no_execution_authorized = true),

  created_at timestamptz not null default now(),

  -- Each prepared_action_id is unique within a workspace.
  constraint prepared_actions_unique_per_workspace unique (workspace_id, prepared_action_id)
);

alter table public.prepared_actions enable row level security;

create index if not exists prepared_actions_workspace_id_idx
  on public.prepared_actions(workspace_id);
create index if not exists prepared_actions_workspace_venture_idx
  on public.prepared_actions(workspace_id, venture_id);
create index if not exists prepared_actions_workspace_status_idx
  on public.prepared_actions(workspace_id, status);
create index if not exists prepared_actions_workspace_hash_idx
  on public.prepared_actions(workspace_id, content_hash);
create index if not exists prepared_actions_workspace_created_idx
  on public.prepared_actions(workspace_id, created_at desc);
create index if not exists prepared_actions_created_at_idx
  on public.prepared_actions(created_at desc);

-- RESTRICTIVE block-all policies (mirrors 0005 / 0006 / 0008 / 0009 / 0012).
-- With RLS enabled and these restrictive policies, anon and authenticated are
-- denied for every operation in addition to any future permissive policy.

-- SELECT ------------------------------------------------------------------
create policy "prepared_actions_block_anon_select"
  on public.prepared_actions
  as restrictive
  for select
  to anon
  using (false);

create policy "prepared_actions_block_authenticated_select"
  on public.prepared_actions
  as restrictive
  for select
  to authenticated
  using (false);

-- INSERT ------------------------------------------------------------------
create policy "prepared_actions_block_anon_insert"
  on public.prepared_actions
  as restrictive
  for insert
  to anon
  with check (false);

create policy "prepared_actions_block_authenticated_insert"
  on public.prepared_actions
  as restrictive
  for insert
  to authenticated
  with check (false);

-- UPDATE ------------------------------------------------------------------
create policy "prepared_actions_block_anon_update"
  on public.prepared_actions
  as restrictive
  for update
  to anon
  using (false)
  with check (false);

create policy "prepared_actions_block_authenticated_update"
  on public.prepared_actions
  as restrictive
  for update
  to authenticated
  using (false)
  with check (false);

-- DELETE ------------------------------------------------------------------
create policy "prepared_actions_block_anon_delete"
  on public.prepared_actions
  as restrictive
  for delete
  to anon
  using (false);

create policy "prepared_actions_block_authenticated_delete"
  on public.prepared_actions
  as restrictive
  for delete
  to authenticated
  using (false);

-- ---------------------------------------------------------------------------
-- Rollback (run manually to fully revert this migration)
-- ---------------------------------------------------------------------------
-- drop policy if exists "prepared_actions_block_anon_select" on public.prepared_actions;
-- drop policy if exists "prepared_actions_block_authenticated_select" on public.prepared_actions;
-- drop policy if exists "prepared_actions_block_anon_insert" on public.prepared_actions;
-- drop policy if exists "prepared_actions_block_authenticated_insert" on public.prepared_actions;
-- drop policy if exists "prepared_actions_block_anon_update" on public.prepared_actions;
-- drop policy if exists "prepared_actions_block_authenticated_update" on public.prepared_actions;
-- drop policy if exists "prepared_actions_block_anon_delete" on public.prepared_actions;
-- drop policy if exists "prepared_actions_block_authenticated_delete" on public.prepared_actions;
-- drop index if exists public.prepared_actions_created_at_idx;
-- drop index if exists public.prepared_actions_workspace_created_idx;
-- drop index if exists public.prepared_actions_workspace_hash_idx;
-- drop index if exists public.prepared_actions_workspace_status_idx;
-- drop index if exists public.prepared_actions_workspace_venture_idx;
-- drop index if exists public.prepared_actions_workspace_id_idx;
-- drop table if exists public.prepared_actions;
