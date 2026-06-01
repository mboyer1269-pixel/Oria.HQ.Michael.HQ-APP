-- Verification for migration 0009 (ventures). READ-ONLY.
--
-- Run this in the Supabase SQL editor (or via the MCP execute_sql) AFTER
-- applying 0009_ventures.sql. Every statement is a SELECT — it never writes,
-- alters, or drops anything. Compare each result to the "Expected" note. See
-- 0009_ventures_VERIFICATION.md for the full runbook and pass/fail checklist.

-- 1) Table exists ----------------------------------------------------------
-- Expected: table_exists = true
select to_regclass('public.ventures') is not null as table_exists;

-- 2) Row Level Security is enabled -----------------------------------------
-- Expected: rls_enabled = true
select relrowsecurity as rls_enabled
from pg_class
where oid = 'public.ventures'::regclass;

-- 3) Policies: expect exactly 8, ALL permissive = RESTRICTIVE, roles only
--    {anon, authenticated}. service_role must NOT appear (bypassrls).
-- Expected: 8 rows, each permissive = 'RESTRICTIVE'
select policyname, cmd, permissive, roles
from pg_policies
where schemaname = 'public' and tablename = 'ventures'
order by policyname;

-- 3b) No PERMISSIVE (open) policy may exist on this table.
-- Expected: permissive_open_policies = 0
select count(*) as permissive_open_policies
from pg_policies
where schemaname = 'public'
  and tablename = 'ventures'
  and permissive = 'PERMISSIVE';

-- 3c) service_role must not be named in any policy.
-- Expected: service_role_policies = 0
select count(*) as service_role_policies
from pg_policies
where schemaname = 'public'
  and tablename = 'ventures'
  and 'service_role' = any (roles);

-- 4) CHECK constraints: workspace_id non-empty + status/source whitelists.
-- Expected: rows for ventures_workspace_id_check, ventures_status_check,
--           ventures_source_check (definitions show the enforced predicates).
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.ventures'::regclass and contype = 'c'
order by conname;

-- 5) Indexes -------------------------------------------------------------
-- Expected: workspace_id, (workspace_id, status), (workspace_id, updated_at desc),
--           updated_at — plus the PK.
select indexname
from pg_indexes
where schemaname = 'public' and tablename = 'ventures'
order by indexname;

-- 6) Current row count (sanity; 0 on a fresh table) ------------------------
-- Expected: a number (0 before any venture is persisted).
select count(*) as ventures_rowcount
from public.ventures;
