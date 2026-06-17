-- 0024_agent_execution_intents_revert.sql
--
-- Drops the restrictive policies, indexes, and the table created by
-- 0024_agent_execution_intents.sql. Reversible and low-risk: the table is
-- additive and nothing in the current behavior depends on it (the execution
-- intent repository runs on the in-memory local fallback until this is applied).
-- Run if the 0024 apply must be undone.

drop policy if exists "agent_execution_intents_block_anon_select" on public.agent_execution_intents;
drop policy if exists "agent_execution_intents_block_authenticated_select" on public.agent_execution_intents;
drop policy if exists "agent_execution_intents_block_anon_insert" on public.agent_execution_intents;
drop policy if exists "agent_execution_intents_block_authenticated_insert" on public.agent_execution_intents;
drop policy if exists "agent_execution_intents_block_anon_update" on public.agent_execution_intents;
drop policy if exists "agent_execution_intents_block_authenticated_update" on public.agent_execution_intents;
drop policy if exists "agent_execution_intents_block_anon_delete" on public.agent_execution_intents;
drop policy if exists "agent_execution_intents_block_authenticated_delete" on public.agent_execution_intents;

drop index if exists public.agent_execution_intents_created_at_idx;
drop index if exists public.agent_execution_intents_workspace_created_idx;
drop index if exists public.agent_execution_intents_workspace_status_idx;
drop index if exists public.agent_execution_intents_workspace_id_idx;

drop table if exists public.agent_execution_intents;
