-- Revert 0028_foundation_context_partition_rls.sql

drop trigger if exists mission_approvals_enforce_workspace_scope on public.mission_approvals;
drop index if exists public.mission_approvals_workspace_id_idx;
alter table public.mission_approvals drop constraint if exists mission_approvals_workspace_id_check;
alter table public.mission_approvals drop column if exists workspace_id;

drop trigger if exists agent_execution_intents_enforce_context_partition_scope on public.agent_execution_intents;
drop trigger if exists agent_execution_intents_enforce_workspace_scope on public.agent_execution_intents;
drop trigger if exists agent_execution_intents_sync_context_partition on public.agent_execution_intents;
drop index if exists public.agent_execution_intents_workspace_partition_status_idx;
alter table public.agent_execution_intents drop constraint if exists agent_execution_intents_context_partition_check;
alter table public.agent_execution_intents drop column if exists context_partition;
alter table public.agent_execution_intents drop column if exists mode_id;

drop trigger if exists action_ledger_enforce_context_partition_scope on public.action_ledger;
drop trigger if exists action_ledger_enforce_workspace_scope on public.action_ledger;
drop trigger if exists action_ledger_sync_context_partition on public.action_ledger;
drop index if exists public.action_ledger_workspace_partition_idx;
alter table public.action_ledger drop constraint if exists action_ledger_context_partition_check;
alter table public.action_ledger drop column if exists context_partition;
alter table public.action_ledger drop column if exists mode_id;

drop function if exists public.enforce_context_partition_scope();
drop function if exists public.enforce_workspace_scope();
drop function if exists public.sync_context_partition_from_mode();
drop function if exists public.app_current_context_partition();
drop function if exists public.app_current_workspace_id();
drop function if exists public.resolve_context_partition(text);
