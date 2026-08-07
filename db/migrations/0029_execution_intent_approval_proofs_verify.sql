-- 0029_execution_intent_approval_proofs_verify.sql — READ-ONLY post-apply check.

-- 1) Approval events table exists
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name = 'agent_execution_intent_approval_events';

-- 2) RLS enabled
select relrowsecurity as rls_enabled
from pg_class
where oid = 'public.agent_execution_intent_approval_events'::regclass;

-- 3) 8 restrictive block policies
select count(*) as restrictive_policies
from pg_policies
where schemaname = 'public'
  and tablename = 'agent_execution_intent_approval_events'
  and permissive = 'RESTRICTIVE';

-- 4) approval_event_id column on intents
select column_name, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'agent_execution_intents'
  and column_name = 'approval_event_id';

-- 5) pending -> executing guard trigger
select tgname
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where c.relname = 'agent_execution_intents'
  and tgname = 'agent_execution_intents_require_approval_proof';
