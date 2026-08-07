-- 0028_foundation_context_partition_rls_verify.sql — READ-ONLY post-apply check.

-- 1) Partition resolver exists
select proname
from pg_proc
join pg_namespace n on n.oid = pg_proc.pronamespace
where n.nspname = 'public' and proname = 'resolve_context_partition';

-- 2) action_ledger has mode_id + context_partition NOT NULL
select column_name, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'action_ledger'
  and column_name in ('mode_id', 'context_partition')
order by column_name;

-- 3) agent_execution_intents has mode_id + context_partition NOT NULL
select column_name, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'agent_execution_intents'
  and column_name in ('mode_id', 'context_partition')
order by column_name;

-- 4) mission_approvals.workspace_id NOT NULL
select column_name, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'mission_approvals'
  and column_name = 'workspace_id';

-- 5) Workspace scope triggers present
select tgname
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where c.relname in ('action_ledger', 'agent_execution_intents', 'mission_approvals')
  and not t.tgisinternal
  and tgname like '%workspace_scope%'
order by tgname;
