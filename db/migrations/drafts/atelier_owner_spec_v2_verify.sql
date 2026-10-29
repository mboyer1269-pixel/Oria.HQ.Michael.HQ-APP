-- Only disposable test databases; structural checks complement behavioral CI.
begin;
do $$ declare signature text; begin
 if current_database() not like 'oria_test_%' or current_setting('oria.allow_disposable_db_tests',true) is distinct from 'on' then
  raise exception 'disposable_test_database_required'; end if;
 foreach signature in array array[
  'public.owner_spec_source_v2(public.missions)',
  'public.valid_atelier_owner_spec_payload_v2(public.missions,uuid,text)',
  'public.append_atelier_owner_spec_ledger_v2(text,jsonb,jsonb)',
  'public.owner_spec_ledger_content_v2(jsonb,text,uuid,uuid,uuid,jsonb)',
  'public.prepare_atelier_owner_spec_v2(text,uuid,text,timestamptz,jsonb,text)',
  'public.admit_atelier_owner_spec_v2(text,uuid,text,text,uuid,uuid,jsonb)',
  'public.check_atelier_owner_spec_admission_v2(text,uuid,text,uuid,text)',
  'public.record_atelier_owner_spec_result_v2(text,uuid,text,uuid,text,jsonb,uuid,jsonb)'
 ] loop
  if to_regprocedure(signature) is null or has_function_privilege('anon',signature,'execute')
   or has_function_privilege('authenticated',signature,'execute') or not has_function_privilege('service_role',signature,'execute')
   or (select prosecdef from pg_proc where oid=to_regprocedure(signature)) then raise exception 'rpc_privilege_regression: %',signature; end if;
 end loop;
 if to_regclass('public.action_ledger_genesis_unique') is null or to_regclass('public.action_ledger_prev_hash_unique') is null
  or to_regclass('public.action_ledger_entry_hash_unique') is null or not exists(select 1 from pg_trigger where tgrelid='public.action_ledger'::regclass
   and tgname='action_ledger_immutable' and tgenabled<>'D') then raise exception 'sealed_ledger_guards_missing'; end if;
end $$;
rollback;
