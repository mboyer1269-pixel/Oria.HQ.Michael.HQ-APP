-- Revert 0029_execution_intent_approval_proofs.sql

drop trigger if exists agent_execution_intents_require_approval_proof on public.agent_execution_intents;
drop function if exists public.agent_execution_intents_require_approval_proof();

drop index if exists public.agent_execution_intents_approval_event_id_idx;
alter table public.agent_execution_intents drop column if exists approval_event_id;

drop trigger if exists agent_execution_intent_approval_events_immutable on public.agent_execution_intent_approval_events;
drop trigger if exists agent_execution_intent_approval_events_sync_context_partition
  on public.agent_execution_intent_approval_events;
drop trigger if exists agent_execution_intent_approval_events_enforce_workspace_scope
  on public.agent_execution_intent_approval_events;
drop function if exists public.agent_execution_intent_approval_events_block_mutations();

drop policy if exists "aei_approval_events_block_anon_select"
  on public.agent_execution_intent_approval_events;
drop policy if exists "aei_approval_events_block_auth_select"
  on public.agent_execution_intent_approval_events;
drop policy if exists "aei_approval_events_block_anon_insert"
  on public.agent_execution_intent_approval_events;
drop policy if exists "aei_approval_events_block_auth_insert"
  on public.agent_execution_intent_approval_events;
drop policy if exists "aei_approval_events_block_anon_update"
  on public.agent_execution_intent_approval_events;
drop policy if exists "aei_approval_events_block_auth_update"
  on public.agent_execution_intent_approval_events;
drop policy if exists "aei_approval_events_block_anon_delete"
  on public.agent_execution_intent_approval_events;
drop policy if exists "aei_approval_events_block_auth_delete"
  on public.agent_execution_intent_approval_events;

-- Legacy long names (pre-shortening) — safe no-ops if absent.
drop policy if exists "agent_execution_intent_approval_events_block_anon_select"
  on public.agent_execution_intent_approval_events;
drop policy if exists "agent_execution_intent_approval_events_block_authenticated_select"
  on public.agent_execution_intent_approval_events;
drop policy if exists "agent_execution_intent_approval_events_block_anon_insert"
  on public.agent_execution_intent_approval_events;
drop policy if exists "agent_execution_intent_approval_events_block_authenticated_insert"
  on public.agent_execution_intent_approval_events;
drop policy if exists "agent_execution_intent_approval_events_block_anon_update"
  on public.agent_execution_intent_approval_events;
drop policy if exists "agent_execution_intent_approval_events_block_authenticated_update"
  on public.agent_execution_intent_approval_events;
drop policy if exists "agent_execution_intent_approval_events_block_anon_delete"
  on public.agent_execution_intent_approval_events;
drop policy if exists "agent_execution_intent_approval_events_block_authenticated_delete"
  on public.agent_execution_intent_approval_events;

drop index if exists public.agent_execution_intent_approval_events_workspace_partition_idx;
drop index if exists public.agent_execution_intent_approval_events_workspace_intent_idx;
drop index if exists public.agent_execution_intent_approval_events_workspace_idx;

drop table if exists public.agent_execution_intent_approval_events;
