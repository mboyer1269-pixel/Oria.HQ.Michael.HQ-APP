-- Verification for migration 0008 (governance_decisions). READ-ONLY.
--
-- Run this in the Supabase SQL editor (or via the MCP execute_sql) AFTER
-- applying 0008_governance_decisions.sql. Every statement is a SELECT — it
-- never writes, alters, or drops anything. Compare each result to the
-- "Expected" note. See 0008_governance_decisions_VERIFICATION.md for the full
-- runbook and the pass/fail checklist.

-- 1) Table exists ----------------------------------------------------------
-- Expected: table_exists = true
select to_regclass('public.governance_decisions') is not null as table_exists;

-- 2) Row Level Security is enabled -----------------------------------------
-- Expected: rls_enabled = true
select relrowsecurity as rls_enabled
from pg_class
where oid = 'public.governance_decisions'::regclass;

-- 3) Policies: expect exactly 8, ALL permissive = RESTRICTIVE, roles only
--    {anon, authenticated}. service_role must NOT appear (bypassrls).
-- Expected: 8 rows, each permissive = 'RESTRICTIVE'
select policyname, cmd, permissive, roles
from pg_policies
where schemaname = 'public' and tablename = 'governance_decisions'
order by policyname;

-- 3b) No PERMISSIVE (open) policy may exist on this table.
-- Expected: permissive_open_policies = 0
select count(*) as permissive_open_policies
from pg_policies
where schemaname = 'public'
  and tablename = 'governance_decisions'
  and permissive = 'PERMISSIVE';

-- 3c) service_role must not be named in any policy.
-- Expected: service_role_policies = 0
select count(*) as service_role_policies
from pg_policies
where schemaname = 'public'
  and tablename = 'governance_decisions'
  and 'service_role' = any (roles);

-- 4) CHECK constraints: outcome whitelist + no-execution safety belts.
-- Expected: rows for outcome_check, human_on_the_loop_check, no_execution_check
--           (definitions show the enforced predicates).
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.governance_decisions'::regclass and contype = 'c'
order by conname;

-- 5) Indexes -------------------------------------------------------------
-- Expected: workspace_id, (workspace_id, work_order_id),
--           (workspace_id, decided_at desc), created_at — plus the PK.
select indexname
from pg_indexes
where schemaname = 'public' and tablename = 'governance_decisions'
order by indexname;

-- 6) Current row count (sanity; 0 on a fresh table) ------------------------
-- Expected: a number (0 before any decision is recorded).
select count(*) as governance_decisions_rowcount
from public.governance_decisions;
