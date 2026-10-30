-- READ-ONLY catalog verification after application to an isolated test DB.
-- This script alone is not a behavior/concurrency proof.
do $$ declare name text; sig regprocedure; role_name text; begin
 foreach name in array array[
  'public.classify_approval_decision(text,uuid,text,uuid,text)',
  'public.create_approval_decision(text,uuid,text,uuid,text,text,jsonb,boolean,text,timestamptz)'] loop
  sig:=to_regprocedure(name);
  if sig is null then raise exception 'missing function: %',name; end if;
  if (select prosecdef from pg_proc where oid=sig) then raise exception 'unexpected definer: %',name; end if;
  if (select proconfig @> array['search_path=public, pg_temp'] from pg_proc where oid=sig) is distinct from true then raise exception 'unpinned search path: %',name; end if;
  foreach role_name in array array['anon','authenticated'] loop
   if has_function_privilege(role_name,sig,'EXECUTE') then raise exception 'unexpected execute: % %',role_name,name; end if;
  end loop;
  if not has_function_privilege('service_role',sig,'EXECUTE') then raise exception 'missing service execute: %',name; end if;
 end loop;
end $$;
