-- NOT APPLIED. DESTRUCTIVE rollback; requires explicit approval and export
-- of all employee records first. Never run as part of tests or application code.
begin;
drop table if exists public.employee_profiles;
drop function if exists public.employee_profiles_guard();
drop index if exists public.employee_profiles_venture_scope_key;
commit;
