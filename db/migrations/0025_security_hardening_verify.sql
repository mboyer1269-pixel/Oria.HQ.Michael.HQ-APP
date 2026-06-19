-- 0025_security_hardening_verify.sql — READ-ONLY post-apply check.
-- Every statement is a SELECT; it never writes. Compare to each "Expected" note.

-- 1) cockpit_layout no longer has an always-true permissive policy -----------
-- Expected: 0 rows
select policyname
from pg_policies
where schemaname = 'public' and tablename = 'cockpit_layout'
  and permissive = 'PERMISSIVE' and (qual = 'true' or with_check = 'true');

-- 2) cockpit_layout now has the two restrictive block policies --------------
-- Expected: 2
select count(*) as cockpit_restrictive
from pg_policies
where schemaname = 'public' and tablename = 'cockpit_layout' and permissive = 'RESTRICTIVE';

-- 3) contact_leads + arena_verdicts each have restrictive block policies -----
-- Expected: 2 and 2
select tablename, count(*) as restrictive_policies
from pg_policies
where schemaname = 'public' and tablename in ('contact_leads', 'arena_verdicts')
  and permissive = 'RESTRICTIVE'
group by tablename
order by tablename;

-- 4) rls_auto_enable() not executable by anon/authenticated -----------------
-- Expected: null (no anon/authenticated execute)
select (
  select array_agg(rolname) from pg_roles r
  where has_function_privilege(r.oid, p.oid, 'EXECUTE') and rolname in ('anon','authenticated')
) as rls_auto_enable_executors
from pg_proc p
where pronamespace = 'public'::regnamespace and proname = 'rls_auto_enable';

-- 5) both functions have a pinned search_path -------------------------------
-- Expected: both proconfig contain a search_path entry
select proname, proconfig
from pg_proc
where pronamespace = 'public'::regnamespace and proname in ('rls_auto_enable','set_updated_at')
order by proname;
