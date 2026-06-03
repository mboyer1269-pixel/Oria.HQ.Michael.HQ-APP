-- Migration 0014: agent_score_snapshots — durable, append-only history of agent
-- operator scores over time (the performance-curve layer for agent economics).
--
-- Do NOT apply without an explicit CEO GO.
--
-- What this is
-- -----------
-- Each row is a point-in-time snapshot of one agent's AgentOperatorScore, derived
-- from the captured cash signals it owned. Storing snapshots turns an
-- instantaneous score into a trend: improving, flat, or decaying.
--   * It is a DERIVED, read-only metric. It authorizes nothing and executes nothing.
--   * It is APPEND-ONLY: insert + list only. No update, no delete.
--   * It is the Supabase backing store for the repository that otherwise runs on
--     an in-memory local fallback (see
--     src/server/ventures/agent-score-snapshot-repository.ts). Scoped per workspace.
--     Columns mirror the TypeScript AgentScoreSnapshot contract in
--     src/features/ventures/agent-score-snapshot.ts.
--
-- Who CAN access this table
-- -------------------------
-- Only the Supabase service-role key (bypassrls). All server-side code uses the
-- service-role admin client. Per repo convention (0005 / 0006 / 0008 / 0009 /
-- 0012 / 0013) we do NOT name service_role in any policy.
--
-- Who CANNOT access this table
-- -----------------------------
-- anon and authenticated are blocked for every operation by RESTRICTIVE policies.

create table if not exists public.agent_score_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null
    constraint agent_score_snapshots_workspace_id_check check (char_length(workspace_id) > 0),
  created_by_user_id uuid not null,
  snapshot_id text not null
    constraint agent_score_snapshots_snapshot_id_check check (char_length(snapshot_id) > 0),
  agent_id text not null
    constraint agent_score_snapshots_agent_id_check check (char_length(agent_id) > 0),
  scored_at timestamptz not null,
  total_operator_score double precision not null
    constraint agent_score_snapshots_total_score_check check (
      total_operator_score >= 0 and total_operator_score <= 100
    ),
  operator_score_band text not null
    constraint agent_score_snapshots_band_check check (
      operator_score_band in (
        'underperforming',
        'developing',
        'capable',
        'high_performer',
        'elite_operator'
      )
    ),
  operator_status text not null
    constraint agent_score_snapshots_status_check check (
      operator_status in (
        'insufficient_evidence',
        'underperforming_operator',
        'developing_operator',
        'capable_operator',
        'high_performer',
        'elite_operator'
      )
    ),
  dimension_scores jsonb not null,
  outcome_count integer not null
    constraint agent_score_snapshots_outcome_count_check check (outcome_count >= 0),
  created_at timestamptz not null default now(),

  constraint agent_score_snapshots_unique_per_workspace unique (workspace_id, snapshot_id)
);

alter table public.agent_score_snapshots enable row level security;

create index if not exists agent_score_snapshots_workspace_id_idx
  on public.agent_score_snapshots(workspace_id);
create index if not exists agent_score_snapshots_workspace_agent_idx
  on public.agent_score_snapshots(workspace_id, agent_id);
create index if not exists agent_score_snapshots_workspace_agent_scored_idx
  on public.agent_score_snapshots(workspace_id, agent_id, scored_at desc);
create index if not exists agent_score_snapshots_workspace_created_idx
  on public.agent_score_snapshots(workspace_id, created_at desc);
create index if not exists agent_score_snapshots_created_at_idx
  on public.agent_score_snapshots(created_at desc);

-- RESTRICTIVE block-all policies (mirrors 0005 / 0006 / 0008 / 0009 / 0012 / 0013).

-- SELECT ------------------------------------------------------------------
create policy "agent_score_snapshots_block_anon_select"
  on public.agent_score_snapshots as restrictive for select to anon using (false);
create policy "agent_score_snapshots_block_authenticated_select"
  on public.agent_score_snapshots as restrictive for select to authenticated using (false);

-- INSERT ------------------------------------------------------------------
create policy "agent_score_snapshots_block_anon_insert"
  on public.agent_score_snapshots as restrictive for insert to anon with check (false);
create policy "agent_score_snapshots_block_authenticated_insert"
  on public.agent_score_snapshots as restrictive for insert to authenticated with check (false);

-- UPDATE ------------------------------------------------------------------
create policy "agent_score_snapshots_block_anon_update"
  on public.agent_score_snapshots as restrictive for update to anon using (false) with check (false);
create policy "agent_score_snapshots_block_authenticated_update"
  on public.agent_score_snapshots as restrictive for update to authenticated using (false) with check (false);

-- DELETE ------------------------------------------------------------------
create policy "agent_score_snapshots_block_anon_delete"
  on public.agent_score_snapshots as restrictive for delete to anon using (false);
create policy "agent_score_snapshots_block_authenticated_delete"
  on public.agent_score_snapshots as restrictive for delete to authenticated using (false);

-- ---------------------------------------------------------------------------
-- Rollback (run manually to fully revert this migration)
-- ---------------------------------------------------------------------------
-- drop policy if exists "agent_score_snapshots_block_anon_select" on public.agent_score_snapshots;
-- drop policy if exists "agent_score_snapshots_block_authenticated_select" on public.agent_score_snapshots;
-- drop policy if exists "agent_score_snapshots_block_anon_insert" on public.agent_score_snapshots;
-- drop policy if exists "agent_score_snapshots_block_authenticated_insert" on public.agent_score_snapshots;
-- drop policy if exists "agent_score_snapshots_block_anon_update" on public.agent_score_snapshots;
-- drop policy if exists "agent_score_snapshots_block_authenticated_update" on public.agent_score_snapshots;
-- drop policy if exists "agent_score_snapshots_block_anon_delete" on public.agent_score_snapshots;
-- drop policy if exists "agent_score_snapshots_block_authenticated_delete" on public.agent_score_snapshots;
-- drop index if exists public.agent_score_snapshots_created_at_idx;
-- drop index if exists public.agent_score_snapshots_workspace_created_idx;
-- drop index if exists public.agent_score_snapshots_workspace_agent_scored_idx;
-- drop index if exists public.agent_score_snapshots_workspace_agent_idx;
-- drop index if exists public.agent_score_snapshots_workspace_id_idx;
-- drop table if exists public.agent_score_snapshots;
