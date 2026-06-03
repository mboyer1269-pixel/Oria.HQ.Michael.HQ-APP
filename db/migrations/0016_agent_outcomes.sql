-- Migration 0016: agent_outcomes -- ROI meter for every agent action
--
-- What this is
-- ------------
-- Records the observed business outcome for each agent skill execution.
-- This is the measurement layer: it answers "did this agent action generate
-- revenue, convert a lead, or produce noise?" after the fact.
--
-- Design is aligned with OpenTelemetry session-level evaluation patterns
-- (trace = the action, session outcome = the business result).
--
-- Append-only. Each row is immutable once written. Status changes create
-- new rows (supersedes_id pattern), mirroring 0011/0013.
--
-- Safety invariants:
--   - no_execution_authorized = true (this table records, never authorizes)
--   - revenue_cad >= 0 always
--   - outcome must be one of the approved values
--
-- Who CAN access:
--   Service-role only (bypassrls). Same pattern as all other sensitive tables.

create table if not exists public.agent_outcomes (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null
    constraint agent_outcomes_workspace_id_check check (char_length(workspace_id) > 0),
  created_by_user_id uuid not null,

  -- Trace fields (aligned with OpenTelemetry span model)
  agent_id text not null
    constraint agent_outcomes_agent_id_check check (char_length(agent_id) > 0),
  skill_id text not null
    constraint agent_outcomes_skill_id_check check (char_length(skill_id) > 0),
  venture_id text null,
  action_ref text null,  -- links to ledger entry id

  -- Execution timeline
  proposed_at timestamptz not null,
  executed_at timestamptz null,

  -- Business outcome (filled in by CEO after the fact)
  outcome text not null
    constraint agent_outcomes_outcome_check check (
      outcome in (
        'pending',        -- not yet evaluated
        'converted',      -- action led to a conversion/client
        'revenue',        -- directly attributed revenue
        'published',      -- content published, no direct revenue yet
        'no_show',        -- prepared but never used
        'ignored',        -- CEO reviewed and discarded
        'failed'          -- action errored or produced unusable output
      )
    ),
  revenue_cad double precision not null default 0
    constraint agent_outcomes_revenue_cad_check check (revenue_cad >= 0),
  notes text null,

  -- Safety invariant
  no_execution_authorized boolean not null default true
    constraint agent_outcomes_no_exec_check check (no_execution_authorized = true),

  created_at timestamptz not null default now()
);

alter table public.agent_outcomes enable row level security;

create index if not exists agent_outcomes_workspace_idx
  on public.agent_outcomes(workspace_id);
create index if not exists agent_outcomes_agent_skill_idx
  on public.agent_outcomes(workspace_id, agent_id, skill_id);
create index if not exists agent_outcomes_venture_idx
  on public.agent_outcomes(workspace_id, venture_id);
create index if not exists agent_outcomes_outcome_idx
  on public.agent_outcomes(workspace_id, outcome);
create index if not exists agent_outcomes_created_idx
  on public.agent_outcomes(created_at desc);

-- RESTRICTIVE block-all (mirrors 0008/0013 pattern)
create policy "agent_outcomes_block_anon_select"   on public.agent_outcomes as restrictive for select to anon using (false);
create policy "agent_outcomes_block_auth_select"   on public.agent_outcomes as restrictive for select to authenticated using (false);
create policy "agent_outcomes_block_anon_insert"   on public.agent_outcomes as restrictive for insert to anon with check (false);
create policy "agent_outcomes_block_auth_insert"   on public.agent_outcomes as restrictive for insert to authenticated with check (false);
create policy "agent_outcomes_block_anon_update"   on public.agent_outcomes as restrictive for update to anon using (false) with check (false);
create policy "agent_outcomes_block_auth_update"   on public.agent_outcomes as restrictive for update to authenticated using (false) with check (false);
create policy "agent_outcomes_block_anon_delete"   on public.agent_outcomes as restrictive for delete to anon using (false);
create policy "agent_outcomes_block_auth_delete"   on public.agent_outcomes as restrictive for delete to authenticated using (false);
