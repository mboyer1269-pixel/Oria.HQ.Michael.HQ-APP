-- Migration 0024: agent_execution_intents — durable, auditable store for the
-- executable agent actions queued for CEO approval (the corrected n8n rail).
--
-- Do NOT apply without an explicit CEO GO.
--
-- What this is
-- -----------
-- An execution intent is one dispatchable action an agent (Hermès / Relay) has
-- prepared and queued. Unlike prepared_actions (migration 0013), which is a
-- proposal-only, manual-send cash-outreach queue that NEVER executes, an
-- execution intent IS dispatchable — but ONLY after the CEO manually approves
-- it. That approval is the single trigger that fires the n8n webhook (via the
-- n8n_webhook_trigger MCP tool). A Sentinelle ALLOW means "eligible for
-- approval", not "fire".
--
-- Lifecycle
-- ---------
-- status: pending -> executing -> executed | failed. A rate-limited dispatch may
-- revert executing -> pending so the CEO can retry. Transitions are validated in
-- the application layer (src/features/agents/execution-intent.ts); this table
-- only whitelists the legal status VALUES via a CHECK constraint.
--
-- Safety invariants at the storage layer
-- --------------------------------------
-- requires_ceo_approval is forced to true by a CHECK constraint: an intent can
-- never be persisted pre-approved. The payload jsonb mirrors the
-- AgentExecutionIntentPayload contract.
--
-- Access
-- ------
-- Only the Supabase service-role key (bypassrls). RESTRICTIVE policies below
-- deny anon and authenticated for every operation (mirrors 0013). There is no
-- direct client access, ever.

create table if not exists public.agent_execution_intents (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null
    constraint agent_execution_intents_workspace_id_check check (char_length(workspace_id) > 0),
  created_by_user_id uuid not null,
  intent_id text not null
    constraint agent_execution_intents_intent_id_check check (char_length(intent_id) > 0),
  agent_id text not null
    constraint agent_execution_intents_agent_id_check check (char_length(agent_id) > 0),
  skill_id text not null
    constraint agent_execution_intents_skill_id_check check (char_length(skill_id) > 0),
  tool_name text not null
    constraint agent_execution_intents_tool_name_check check (char_length(tool_name) > 0),
  autonomy_level integer not null
    constraint agent_execution_intents_autonomy_level_check check (autonomy_level between 0 and 5),
  status text not null
    constraint agent_execution_intents_status_check check (
      status in ('pending', 'executing', 'executed', 'failed')
    ),
  payload jsonb not null,
  action_ref text null,
  failure_code text null,

  -- Safety invariant: this column must always be true.
  requires_ceo_approval boolean not null default true
    constraint agent_execution_intents_requires_ceo_approval_check check (requires_ceo_approval = true),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Each intent_id is unique within a workspace.
  constraint agent_execution_intents_unique_per_workspace unique (workspace_id, intent_id)
);

alter table public.agent_execution_intents enable row level security;

create index if not exists agent_execution_intents_workspace_id_idx
  on public.agent_execution_intents(workspace_id);
create index if not exists agent_execution_intents_workspace_status_idx
  on public.agent_execution_intents(workspace_id, status);
create index if not exists agent_execution_intents_workspace_created_idx
  on public.agent_execution_intents(workspace_id, created_at desc);
create index if not exists agent_execution_intents_created_at_idx
  on public.agent_execution_intents(created_at desc);

-- RESTRICTIVE block-all policies (mirrors 0013). With RLS enabled and these
-- restrictive policies, anon and authenticated are denied for every operation.

-- SELECT ------------------------------------------------------------------
create policy "agent_execution_intents_block_anon_select"
  on public.agent_execution_intents
  as restrictive
  for select
  to anon
  using (false);

create policy "agent_execution_intents_block_authenticated_select"
  on public.agent_execution_intents
  as restrictive
  for select
  to authenticated
  using (false);

-- INSERT ------------------------------------------------------------------
create policy "agent_execution_intents_block_anon_insert"
  on public.agent_execution_intents
  as restrictive
  for insert
  to anon
  with check (false);

create policy "agent_execution_intents_block_authenticated_insert"
  on public.agent_execution_intents
  as restrictive
  for insert
  to authenticated
  with check (false);

-- UPDATE ------------------------------------------------------------------
create policy "agent_execution_intents_block_anon_update"
  on public.agent_execution_intents
  as restrictive
  for update
  to anon
  using (false)
  with check (false);

create policy "agent_execution_intents_block_authenticated_update"
  on public.agent_execution_intents
  as restrictive
  for update
  to authenticated
  using (false)
  with check (false);

-- DELETE ------------------------------------------------------------------
create policy "agent_execution_intents_block_anon_delete"
  on public.agent_execution_intents
  as restrictive
  for delete
  to anon
  using (false);

create policy "agent_execution_intents_block_authenticated_delete"
  on public.agent_execution_intents
  as restrictive
  for delete
  to authenticated
  using (false);

-- ---------------------------------------------------------------------------
-- Rollback (run manually to fully revert this migration)
-- ---------------------------------------------------------------------------
-- drop policy if exists "agent_execution_intents_block_anon_select" on public.agent_execution_intents;
-- drop policy if exists "agent_execution_intents_block_authenticated_select" on public.agent_execution_intents;
-- drop policy if exists "agent_execution_intents_block_anon_insert" on public.agent_execution_intents;
-- drop policy if exists "agent_execution_intents_block_authenticated_insert" on public.agent_execution_intents;
-- drop policy if exists "agent_execution_intents_block_anon_update" on public.agent_execution_intents;
-- drop policy if exists "agent_execution_intents_block_authenticated_update" on public.agent_execution_intents;
-- drop policy if exists "agent_execution_intents_block_anon_delete" on public.agent_execution_intents;
-- drop policy if exists "agent_execution_intents_block_authenticated_delete" on public.agent_execution_intents;
-- drop index if exists public.agent_execution_intents_created_at_idx;
-- drop index if exists public.agent_execution_intents_workspace_created_idx;
-- drop index if exists public.agent_execution_intents_workspace_status_idx;
-- drop index if exists public.agent_execution_intents_workspace_id_idx;
-- drop table if exists public.agent_execution_intents;
