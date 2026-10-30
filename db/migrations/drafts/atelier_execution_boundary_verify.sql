-- DRAFT / NOT EXECUTED here. Structural DB preflight only, never a substitute
-- for the real two-session proof harness. Run on disposable oria_test_* only.
-- Behavioral fixtures must be emitted by buildAtelierExecutionInput + the
-- existing TS v1 ledger sealer, not reconstructed with jsonb::text in SQL.
-- SET oria.allow_disposable_db_tests='on'; then psql -v ON_ERROR_STOP=1 -f this_file
begin;
do $$ declare signature text; begin
  if current_database() not like 'oria_test_%'
    or current_setting('oria.allow_disposable_db_tests',true) is distinct from 'on' then
    raise exception 'disposable_test_database_required';
  end if;
  foreach signature in array array[
    'public.claim_atelier_execution(text,uuid,text,timestamptz,jsonb,text,uuid,uuid,jsonb)',
    'public.lookup_atelier_execution(text,uuid,text,text,uuid)',
    'public.read_atelier_ledger_tail(text)'
  ] loop
    if to_regprocedure(signature) is null
      or has_function_privilege('anon',signature,'execute')
      or has_function_privilege('authenticated',signature,'execute')
      or not has_function_privilege('service_role',signature,'execute') then
      raise exception 'rpc_privilege_regression: %',signature;
    end if;
  end loop;
  if to_regclass('public.action_ledger_genesis_unique') is null
    or to_regclass('public.action_ledger_prev_hash_unique') is null
    or to_regclass('public.action_ledger_entry_hash_unique') is null
    or not exists(select 1 from pg_trigger where tgrelid='public.action_ledger'::regclass
      and tgname='action_ledger_immutable' and tgenabled <> 'D') then
    raise exception 'sealed_ledger_guards_missing';
  end if;
end $$;
rollback;
