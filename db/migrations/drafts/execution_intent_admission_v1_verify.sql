-- READ-ONLY catalog verification, not a transaction/concurrency proof.
begin;
do $$ declare name text; sig regprocedure; role_name text; begin
 if current_database() not like 'oria_test_%' or current_setting('oria.allow_disposable_db_tests',true) is distinct from 'on'
  then raise exception 'disposable_test_database_required'; end if;
 foreach name in array array[
  'public.admit_execution_intent_v1(text,uuid,text,uuid,uuid,text,text,jsonb)',
  'public.check_execution_intent_admission_v1(text,uuid,text,uuid,uuid,text,text)'
 ] loop
  sig:=to_regprocedure(name);
  if sig is null then raise exception 'missing function: %',name; end if;
  if (select prosecdef from pg_proc where oid=sig) then raise exception 'unexpected definer: %',name; end if;
  if (select proconfig @> array['search_path=public, pg_temp'] from pg_proc where oid=sig) is distinct from true
   then raise exception 'unpinned search path: %',name; end if;
  if exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    where p.oid=sig and a.grantee=0 and a.privilege_type='EXECUTE') then raise exception 'public execute: %',name; end if;
  foreach role_name in array array['anon','authenticated'] loop
   if has_function_privilege(role_name,sig,'EXECUTE') then raise exception 'unexpected execute: % %',role_name,name; end if;
  end loop;
  if not has_function_privilege('service_role',sig,'EXECUTE') then raise exception 'missing service execute: %',name; end if;
 end loop;
end $$;
rollback;
