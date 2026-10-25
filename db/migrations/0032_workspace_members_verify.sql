-- Read-only verification after an explicitly authorized deployment.
select relrowsecurity from pg_class where oid = 'public.workspace_members'::regclass;
select policyname, cmd, roles, qual from pg_policies where tablename = 'workspace_members';
select column_name, is_nullable, column_default from information_schema.columns
where table_schema = 'public' and table_name = 'contact_leads' and column_name = 'workspace_id';
select indexname from pg_indexes where tablename = 'contact_leads' and indexname = 'contact_leads_workspace_created_idx';
