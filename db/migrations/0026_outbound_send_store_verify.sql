-- 0026_outbound_send_store_verify.sql — READ-ONLY post-apply check.
-- Every statement is a SELECT. Compare each result to its "Expected" note.

-- 1) All three tables exist -------------------------------------------------
-- Expected: 3 rows
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('outbound_send_candidates', 'outbound_send_outcomes', 'outbound_suppressions')
order by table_name;

-- 2) RLS enabled on all three ----------------------------------------------
-- Expected: 3 rows, all rls_enabled = true
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('outbound_send_candidates', 'outbound_send_outcomes', 'outbound_suppressions')
order by c.relname;

-- 3) Restrictive block-all policies present --------------------------------
-- Expected: 2 per table (6 total)
select tablename, count(*) as restrictive_policies
from pg_policies
where schemaname = 'public'
  and tablename in ('outbound_send_candidates', 'outbound_send_outcomes', 'outbound_suppressions')
  and permissive = 'RESTRICTIVE'
group by tablename
order by tablename;

-- 4) Idempotency is a UNIQUE constraint ------------------------------------
-- Expected: 1 row (outbound_send_outcomes_idempotency_unique)
select conname
from pg_constraint
where conrelid = 'public.outbound_send_outcomes'::regclass
  and contype = 'u';

-- 5) Uniqueness per workspace on candidates + suppressions -----------------
-- Expected: 2 rows
select conrelid::regclass as table_name, conname
from pg_constraint
where contype = 'u'
  and conrelid in (
    'public.outbound_send_candidates'::regclass,
    'public.outbound_suppressions'::regclass
  )
order by table_name;

-- 6) Daily-count support index present -------------------------------------
-- Expected: 1 row (outbound_send_outcomes_daily_count_idx)
select indexname
from pg_indexes
where schemaname = 'public'
  and tablename = 'outbound_send_outcomes'
  and indexname = 'outbound_send_outcomes_daily_count_idx';
