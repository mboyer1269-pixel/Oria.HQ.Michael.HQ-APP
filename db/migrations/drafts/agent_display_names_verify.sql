-- Read-only inspection, not executed in this change. No authenticated RLS proof implied.
select relrowsecurity from pg_class where oid = 'public.agent_display_names'::regclass;
select policyname, cmd, roles, qual, with_check from pg_policies
where schemaname = 'public' and tablename = 'agent_display_names';
select grantee, privilege_type, column_name from information_schema.column_privileges
where table_schema = 'public' and table_name = 'agent_display_names';
