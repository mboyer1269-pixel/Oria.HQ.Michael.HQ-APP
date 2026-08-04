-- 0026_workspaces_and_members_verify.sql — READ-ONLY post-apply check.
--
-- Run AFTER applying 0026_workspaces_and_members.sql. Every statement is a
-- SELECT; it never writes, alters, or drops anything. Compare each result to its
-- "Expected" note.

-- 1) Both tables exist -------------------------------------------------------
-- Expected: 2 rows (workspaces, workspace_members)
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('workspaces', 'workspace_members')
order by table_name;

-- 2) Role whitelist CHECK ----------------------------------------------------
-- Expected: a CHECK naming owner/admin/operator/viewer
select con.conname, pg_get_constraintdef(con.oid) as definition
from pg_constraint con
where con.conrelid = 'public.workspace_members'::regclass
  and con.conname = 'workspace_members_role_check';

-- 3) Status whitelist CHECK --------------------------------------------------
-- Expected: a CHECK naming active/invited/revoked
select con.conname, pg_get_constraintdef(con.oid) as definition
from pg_constraint con
where con.conrelid = 'public.workspace_members'::regclass
  and con.conname = 'workspace_members_status_check';

-- 4) Single-active-owner guard ----------------------------------------------
-- Expected: 1 row, a partial UNIQUE index on (workspace_id)
--           WHERE role = 'owner' AND status = 'active'
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and indexname = 'workspace_members_single_active_owner_idx';

-- 5) Membership uniqueness per workspace ------------------------------------
-- Expected: 1 row (workspace_members_unique_per_workspace)
select conname
from pg_constraint
where conrelid = 'public.workspace_members'::regclass
  and contype = 'u';

-- 6) Cascade on workspace deletion ------------------------------------------
-- Expected: 1 row, confirdeltype = 'c' (ON DELETE CASCADE)
select conname, confdeltype
from pg_constraint
where conrelid = 'public.workspace_members'::regclass
  and contype = 'f';

-- 7) Slug uniqueness ---------------------------------------------------------
-- Expected: 1 row (workspaces_slug_unique)
select conname
from pg_constraint
where conrelid = 'public.workspaces'::regclass
  and contype = 'u';

-- 8) RLS enabled on both tables ---------------------------------------------
-- Expected: 2 rows, rls_enabled = true for each
select relname, relrowsecurity as rls_enabled
from pg_class
where oid in ('public.workspaces'::regclass, 'public.workspace_members'::regclass)
order by relname;

-- 9) Block-all restrictive policies -----------------------------------------
-- Expected: 8 per table (anon + authenticated x select/insert/update/delete)
select tablename, count(*) as restrictive_policies
from pg_policies
where schemaname = 'public'
  and tablename in ('workspaces', 'workspace_members')
  and permissive = 'RESTRICTIVE'
group by tablename
order by tablename;

-- 10) Legacy text workspace_id columns untouched ----------------------------
-- Expected: every listed column is still `text` (0026 must NOT have altered
-- them). A uuid here means something converted them — stop and investigate.
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and column_name = 'workspace_id'
order by table_name;

-- 11) Volume ----------------------------------------------------------------
-- Expected: 0 / 0 immediately after apply (the resolver is not wired yet)
select
  (select count(*) from public.workspaces) as workspaces,
  (select count(*) from public.workspace_members) as members;
