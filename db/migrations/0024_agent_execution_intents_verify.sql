-- 0024_agent_execution_intents_verify.sql — READ-ONLY post-apply check.
--
-- Run AFTER applying 0024_agent_execution_intents.sql. Every statement is a
-- SELECT; it never writes, alters, or drops anything. Compare each result to its
-- "Expected" note.

-- 1) Table exists -----------------------------------------------------------
-- Expected: 1 row (public.agent_execution_intents)
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name = 'agent_execution_intents';

-- 2) Status whitelist CHECK is present --------------------------------------
-- Expected: a CHECK clause naming pending/executing/executed/failed
select con.conname, pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_namespace nsp on nsp.oid = rel.relnamespace
where nsp.nspname = 'public'
  and rel.relname = 'agent_execution_intents'
  and con.conname = 'agent_execution_intents_status_check';

-- 3) Governance invariant CHECK is present ----------------------------------
-- Expected: a CHECK clause asserting requires_ceo_approval = true
select con.conname, pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_namespace nsp on nsp.oid = rel.relnamespace
where nsp.nspname = 'public'
  and rel.relname = 'agent_execution_intents'
  and con.conname = 'agent_execution_intents_requires_ceo_approval_check';

-- 4) RLS is enabled ---------------------------------------------------------
-- Expected: rowsecurity = true
select relrowsecurity as rls_enabled
from pg_class
where oid = 'public.agent_execution_intents'::regclass;

-- 5) Block-all restrictive policies exist -----------------------------------
-- Expected: 8 rows (anon + authenticated × select/insert/update/delete)
select count(*) as restrictive_policies
from pg_policies
where schemaname = 'public'
  and tablename = 'agent_execution_intents'
  and permissive = 'RESTRICTIVE';

-- 6) Uniqueness per workspace + intent_id -----------------------------------
-- Expected: 1 row (agent_execution_intents_unique_per_workspace)
select conname
from pg_constraint
where conrelid = 'public.agent_execution_intents'::regclass
  and contype = 'u';

-- 7) Indexes present --------------------------------------------------------
-- Expected: workspace_id, workspace_status, workspace_created, created_at
select indexname
from pg_indexes
where schemaname = 'public'
  and tablename = 'agent_execution_intents'
  and indexname like 'agent_execution_intents_%'
order by indexname;
