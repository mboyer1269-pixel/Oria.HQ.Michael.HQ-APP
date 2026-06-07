-- Migration 0020: Enforce workspace scope on existing Action Ledger rows.
--
-- The action ledger is workspace-scoped in application code. This migration
-- backfills any missing workspace_id values, makes the column non-nullable,
-- and preserves row-level security without introducing an unsupported
-- workspace claim filter.

alter table public.action_ledger
  add column if not exists workspace_id text;

update public.action_ledger
set workspace_id = 'michael-hq'
where workspace_id is null;

alter table public.action_ledger
  alter column workspace_id set not null;

alter table public.action_ledger
  enable row level security;

create index if not exists action_ledger_workspace_id_idx
  on public.action_ledger(workspace_id);
