-- DRAFT / NOT LIVE. Read-only schema inspection, NOT proof of authenticated
-- isolation, atomicity or concurrent revision behavior. No DB used in this lot.
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies where schemaname = 'public' and tablename = 'employee_profiles';
select table_name, grantee, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'employee_profiles';
select column_name, grantee, privilege_type from information_schema.role_column_grants
where table_schema = 'public' and table_name = 'employee_profiles';
select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid = to_regclass('public.employee_profiles');
select tgname, pg_get_triggerdef(oid) from pg_trigger
where tgrelid = to_regclass('public.employee_profiles') and not tgisinternal;

-- Read-only confirmation of the new columns; no profile contents returned.
select column_name, data_type, is_nullable from information_schema.columns
where table_schema = 'public' and table_name = 'employee_profiles'
  and column_name in ('creation_key', 'creation_payload_hash');
-- Partial uniqueness is an index, not a pg_constraint entry.
select indexname, indexdef from pg_indexes
where schemaname = 'public' and tablename = 'employee_profiles';
