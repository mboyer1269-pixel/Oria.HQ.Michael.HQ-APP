-- Effect of the existing mission and budget migrations on ordinary roles.
-- anon, authenticated and service_role are local role names, not Supabase sessions.
-- None of them is superuser and none bypasses row security.
-- A rolled-back grant only makes the RLS predicate observable. It is not kept.
-- current_user is checked immediately after set role, before any trial.
-- A failed set role stops the bench. It is not a refused query.

\set ON_ERROR_STOP on

do $$
declare
  v_super boolean;
  v_bypass boolean;
  v_role text;
begin
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    select rolsuper, rolbypassrls into v_super, v_bypass
    from pg_roles where rolname = v_role;
    if v_super is null then
      raise exception 'missing role %', v_role;
    end if;
    if v_super or v_bypass then
      raise exception 'role % is superuser or bypassrls', v_role;
    end if;
    if has_table_privilege(v_role, 'public.missions', 'SELECT')
       or has_table_privilege(v_role, 'public.missions', 'INSERT')
       or has_table_privilege(v_role, 'public.hq_call_budget_ceiling', 'SELECT')
       or has_table_privilege(v_role, 'public.hq_call_budget_quote', 'SELECT')
       or has_table_privilege(v_role, 'public.hq_call_emit_right', 'SELECT')
       or has_table_privilege(v_role, 'public.hq_call_reservation', 'SELECT') then
      raise exception 'migration granted client table access to %', v_role;
    end if;
  end loop;
end
$$;

do $$
declare
  v_role text;
  v_statement text;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    foreach v_statement in array array[
      'select count(*) from public.missions',
      'insert into public.missions (id, workspace_id, mode_id, title, objective, assigned_agent_id) values (''denied'', ''w'', ''hq'', ''t'', ''o'', ''a'')',
      'update public.missions set title = ''denied''',
      'delete from public.missions',
      'select count(*) from public.hq_call_budget_ceiling',
      'insert into public.hq_call_budget_ceiling (workspace_id, currency, max_amount_cents) values (''w'', ''USD'', 0)',
      'select count(*) from public.hq_call_budget_quote',
      'select count(*) from public.hq_call_emit_right',
      'select count(*) from public.hq_call_reservation',
      'select public.hq_reserve_call_attempt(''w'', ''s'', ''c'', ''openai'', ''m'', ''api'', 16, 16)',
      'select public.hq_release_call_attempt(''w'', ''s'', ''c'', ''openai'')',
      'select public.hq_mark_call_emitted(''w'', ''s'', ''c'', ''openai'')',
      'select public.hq_consume_call_attempt(''w'', ''s'', ''c'', ''openai'')'
    ] loop
      execute format('set role %I', v_role);
      if current_user is distinct from v_role then
        raise exception 'set role did not take effect before denial trial: expected % but current_user is %', v_role, current_user;
      end if;
      begin
        execute v_statement;
        raise exception '% was allowed to execute %', v_role, v_statement;
      exception
        when insufficient_privilege then
          null;
      end;
      reset role;
      if current_user is distinct from session_user then
        raise exception 'role % was not reset after denial trial', v_role;
      end if;
    end loop;
  end loop;
end
$$;

do $$
declare
  v_result jsonb;
  v_count bigint;
begin
  set role service_role;
  if current_user is distinct from 'service_role' then
    raise exception 'set role did not take effect before service_role trials: current_user is %', current_user;
  end if;
  if (select rolsuper or rolbypassrls from pg_roles where rolname = current_user) then
    raise exception 'effective service_role is privileged';
  end if;
  v_result := public.hq_reserve_call_attempt('w', 's', 'c', 'openai', 'm', 'api', 16, 16);
  if v_result->>'status' is distinct from 'unavailable'
     or v_result->>'reason' is distinct from 'ceiling_not_configured' then
    raise exception 'reserve positive control returned %', v_result;
  end if;
  v_result := public.hq_release_call_attempt('w', 's', 'c', 'openai');
  if v_result->>'status' is null then
    raise exception 'release did not execute';
  end if;
  v_result := public.hq_mark_call_emitted('w', 's', 'c', 'openai');
  if v_result->>'status' is null then
    raise exception 'mark did not execute';
  end if;
  v_result := public.hq_consume_call_attempt('w', 's', 'c', 'openai');
  if v_result->>'status' is null then
    raise exception 'consume did not execute';
  end if;
  reset role;
  select count(*) into v_count from public.hq_call_reservation;
  if v_count <> 0 then
    raise exception 'service_role calls persisted % reservation rows', v_count;
  end if;
  select count(*) into v_count from public.hq_call_budget_ceiling;
  if v_count <> 0 then
    raise exception 'service_role calls persisted a ceiling';
  end if;
end
$$;

-- RLS effect, visible only while a table grant exists. The grant is rolled back.
begin;
grant select, insert, update, delete on
  public.missions,
  public.hq_call_budget_ceiling,
  public.hq_call_budget_quote,
  public.hq_call_emit_right,
  public.hq_call_reservation
to anon, authenticated;

insert into public.missions (
  id, workspace_id, mode_id, title, objective, assigned_agent_id
) values ('probe-mission', 'probe-ws', 'hq', 'probe', 'probe', 'none');
insert into public.hq_call_budget_ceiling (workspace_id, currency, max_amount_cents)
values ('probe-ws', 'USD', 0);
insert into public.hq_call_budget_quote (
  provider, model_id, currency, not_to_exceed_cents, quote_scope, quote_version,
  valid_until, covers_input_bytes, covers_output_tokens, reliable
) values (
  'openai', 'probe-model', 'USD', 1, 'prompt_system_output', 'probe',
  now() + interval '1 hour', 16, 16, false
);
insert into public.hq_call_emit_right (workspace_id, subject_id, caller_id)
values ('probe-ws', 'probe-subject', 'probe-caller');
insert into public.hq_call_reservation (
  workspace_id, subject_id, provider, caller_id, access_class, currency,
  reserved_cents, state, reconciliation_required, model_id, max_tokens, input_bytes, network_emitted
) values (
  'probe-ws', 'probe-subject', 'openai', 'probe-caller', 'api', 'USD',
  1, 'held', false, 'probe-model', 16, 16, false
);

do $$
declare
  v_role text;
  v_seen bigint;
  v_rows bigint;
  v_mission_before public.missions%rowtype;
  v_mission_after public.missions%rowtype;
  v_ceiling_before public.hq_call_budget_ceiling%rowtype;
  v_ceiling_after public.hq_call_budget_ceiling%rowtype;
  v_quote_before public.hq_call_budget_quote%rowtype;
  v_quote_after public.hq_call_budget_quote%rowtype;
  v_right_before public.hq_call_emit_right%rowtype;
  v_right_after public.hq_call_emit_right%rowtype;
  v_reservation_before public.hq_call_reservation%rowtype;
  v_reservation_after public.hq_call_reservation%rowtype;
begin
  if (select count(*) from public.missions) <> 1
     or (select count(*) from public.hq_call_budget_ceiling) <> 1
     or (select count(*) from public.hq_call_budget_quote) <> 1
     or (select count(*) from public.hq_call_emit_right) <> 1
     or (select count(*) from public.hq_call_reservation) <> 1 then
    raise exception 'probe fixture was not one row per table';
  end if;
  select * into strict v_mission_before from public.missions;
  select * into strict v_ceiling_before from public.hq_call_budget_ceiling;
  select * into strict v_quote_before from public.hq_call_budget_quote;
  select * into strict v_right_before from public.hq_call_emit_right;
  select * into strict v_reservation_before from public.hq_call_reservation;
  if v_mission_before.id is distinct from 'probe-mission'
     or v_ceiling_before.workspace_id is distinct from 'probe-ws'
     or v_quote_before.provider is distinct from 'openai'
     or v_quote_before.model_id is distinct from 'probe-model'
     or v_right_before.workspace_id is distinct from 'probe-ws'
     or v_right_before.subject_id is distinct from 'probe-subject'
     or v_reservation_before.workspace_id is distinct from 'probe-ws'
     or v_reservation_before.subject_id is distinct from 'probe-subject'
     or v_reservation_before.provider is distinct from 'openai' then
    raise exception 'probe fixture keys changed';
  end if;

  foreach v_role in array array['anon', 'authenticated'] loop
    execute format('set role %I', v_role);
    if current_user is distinct from v_role then
      raise exception 'set role did not take effect before rls trials: expected % but current_user is %', v_role, current_user;
    end if;
    if (select rolsuper or rolbypassrls from pg_roles where rolname = current_user) then
      raise exception 'probe role % bypasses rls', current_user;
    end if;
    select count(*) into v_seen from public.missions;
    if v_seen <> 0 then raise exception '% read % missions through rls', v_role, v_seen; end if;
    select count(*) into v_seen from public.hq_call_budget_ceiling;
    if v_seen <> 0 then raise exception '% read a ceiling through rls', v_role; end if;
    select count(*) into v_seen from public.hq_call_budget_quote;
    if v_seen <> 0 then raise exception '% read a quote through rls', v_role; end if;
    select count(*) into v_seen from public.hq_call_emit_right;
    if v_seen <> 0 then raise exception '% read an emit right through rls', v_role; end if;
    select count(*) into v_seen from public.hq_call_reservation;
    if v_seen <> 0 then raise exception '% read a reservation through rls', v_role; end if;

    v_rows := 0;
    begin
      insert into public.missions (id, workspace_id, mode_id, title, objective, assigned_agent_id)
      values ('client-write', 'probe-ws', 'hq', 'no', 'no', 'none');
      v_rows := 1;
    exception
      when insufficient_privilege then v_rows := 0;
    end;
    if v_rows <> 0 then raise exception '% inserted a mission', v_role; end if;

    v_rows := null;
    begin
      update public.missions set title = 'probe-changed' where id = 'probe-mission';
      get diagnostics v_rows = row_count;
    exception
      when insufficient_privilege then v_rows := 0;
    end;
    if v_rows is distinct from 0 then raise exception '% updated % mission rows', v_role, v_rows; end if;

    v_rows := null;
    begin
      delete from public.missions where id = 'probe-mission';
      get diagnostics v_rows = row_count;
    exception
      when insufficient_privilege then v_rows := 0;
    end;
    if v_rows is distinct from 0 then raise exception '% deleted % mission rows', v_role, v_rows; end if;

    v_rows := 0;
    begin
      insert into public.hq_call_budget_ceiling (workspace_id, currency, max_amount_cents)
      values ('client-ws', 'USD', 0);
      v_rows := 1;
    exception
      when insufficient_privilege then v_rows := 0;
    end;
    if v_rows <> 0 then raise exception '% inserted a ceiling', v_role; end if;

    v_rows := null;
    begin
      update public.hq_call_budget_ceiling set max_amount_cents = 1 where workspace_id = 'probe-ws';
      get diagnostics v_rows = row_count;
    exception
      when insufficient_privilege then v_rows := 0;
    end;
    if v_rows is distinct from 0 then raise exception '% updated % ceiling rows', v_role, v_rows; end if;

    v_rows := null;
    begin
      delete from public.hq_call_budget_ceiling where workspace_id = 'probe-ws';
      get diagnostics v_rows = row_count;
    exception
      when insufficient_privilege then v_rows := 0;
    end;
    if v_rows is distinct from 0 then raise exception '% deleted % ceiling rows', v_role, v_rows; end if;

    v_rows := 0;
    begin
      insert into public.hq_call_budget_quote (
        provider, model_id, currency, not_to_exceed_cents, quote_scope, quote_version,
        valid_until, covers_input_bytes, covers_output_tokens, reliable
      ) values (
        'anthropic', 'probe-model', 'USD', 1, 'prompt_system_output', 'probe',
        now() + interval '1 hour', 16, 16, false
      );
      v_rows := 1;
    exception
      when insufficient_privilege then v_rows := 0;
    end;
    if v_rows <> 0 then raise exception '% inserted a quote', v_role; end if;

    v_rows := null;
    begin
      update public.hq_call_budget_quote
      set not_to_exceed_cents = 2
      where provider = 'openai' and model_id = 'probe-model';
      get diagnostics v_rows = row_count;
    exception
      when insufficient_privilege then v_rows := 0;
    end;
    if v_rows is distinct from 0 then raise exception '% updated % quote rows', v_role, v_rows; end if;

    v_rows := null;
    begin
      delete from public.hq_call_budget_quote where provider = 'openai' and model_id = 'probe-model';
      get diagnostics v_rows = row_count;
    exception
      when insufficient_privilege then v_rows := 0;
    end;
    if v_rows is distinct from 0 then raise exception '% deleted % quote rows', v_role, v_rows; end if;

    v_rows := 0;
    begin
      insert into public.hq_call_emit_right (workspace_id, subject_id, caller_id)
      values ('probe-ws', 'client-subject', 'probe-caller');
      v_rows := 1;
    exception
      when insufficient_privilege then v_rows := 0;
    end;
    if v_rows <> 0 then raise exception '% inserted an emit right', v_role; end if;

    v_rows := null;
    begin
      update public.hq_call_emit_right
      set caller_id = 'other-caller'
      where workspace_id = 'probe-ws' and subject_id = 'probe-subject';
      get diagnostics v_rows = row_count;
    exception
      when insufficient_privilege then v_rows := 0;
    end;
    if v_rows is distinct from 0 then raise exception '% updated % emit right rows', v_role, v_rows; end if;

    v_rows := null;
    begin
      delete from public.hq_call_emit_right
      where workspace_id = 'probe-ws' and subject_id = 'probe-subject';
      get diagnostics v_rows = row_count;
    exception
      when insufficient_privilege then v_rows := 0;
    end;
    if v_rows is distinct from 0 then raise exception '% deleted % emit right rows', v_role, v_rows; end if;

    v_rows := 0;
    begin
      insert into public.hq_call_reservation (
        workspace_id, subject_id, provider, caller_id, access_class, currency,
        reserved_cents, state, reconciliation_required, model_id, max_tokens, input_bytes, network_emitted
      ) values (
        'probe-ws', 'probe-subject', 'anthropic', 'probe-caller', 'api', 'USD',
        1, 'held', false, 'probe-model', 16, 16, false
      );
      v_rows := 1;
    exception
      when insufficient_privilege then v_rows := 0;
    end;
    if v_rows <> 0 then raise exception '% inserted a reservation', v_role; end if;

    v_rows := null;
    begin
      update public.hq_call_reservation
      set reserved_cents = 2
      where workspace_id = 'probe-ws' and subject_id = 'probe-subject' and provider = 'openai';
      get diagnostics v_rows = row_count;
    exception
      when insufficient_privilege then v_rows := 0;
    end;
    if v_rows is distinct from 0 then raise exception '% updated % reservation rows', v_role, v_rows; end if;

    v_rows := null;
    begin
      delete from public.hq_call_reservation
      where workspace_id = 'probe-ws' and subject_id = 'probe-subject' and provider = 'openai';
      get diagnostics v_rows = row_count;
    exception
      when insufficient_privilege then v_rows := 0;
    end;
    if v_rows is distinct from 0 then raise exception '% deleted % reservation rows', v_role, v_rows; end if;

    reset role;
    if current_user is distinct from session_user then
      raise exception 'role % was not reset after rls trials', v_role;
    end if;
    if (select count(*) from public.missions) <> 1
       or (select count(*) from public.hq_call_budget_ceiling) <> 1
       or (select count(*) from public.hq_call_budget_quote) <> 1
       or (select count(*) from public.hq_call_emit_right) <> 1
       or (select count(*) from public.hq_call_reservation) <> 1 then
      raise exception '% left a probe table with a row count other than 1', v_role;
    end if;
    select * into strict v_mission_after from public.missions;
    select * into strict v_ceiling_after from public.hq_call_budget_ceiling;
    select * into strict v_quote_after from public.hq_call_budget_quote;
    select * into strict v_right_after from public.hq_call_emit_right;
    select * into strict v_reservation_after from public.hq_call_reservation;
    if v_mission_after is distinct from v_mission_before
       or v_ceiling_after is distinct from v_ceiling_before
       or v_quote_after is distinct from v_quote_before
       or v_right_after is distinct from v_right_before
       or v_reservation_after is distinct from v_reservation_before then
      raise exception '% changed a complete probe row', v_role;
    end if;
  end loop;
end
$$;

rollback;

do $$
begin
  if has_table_privilege('anon', 'public.missions', 'SELECT')
     or has_table_privilege('authenticated', 'public.hq_call_reservation', 'INSERT')
     or has_table_privilege('service_role', 'public.hq_call_budget_quote', 'SELECT') then
    raise exception 'rolled-back probe grant survived';
  end if;
  if (select count(*) from public.missions) <> 0
     or (select count(*) from public.hq_call_budget_ceiling) <> 0
     or (select count(*) from public.hq_call_budget_quote) <> 0
     or (select count(*) from public.hq_call_emit_right) <> 0
     or (select count(*) from public.hq_call_reservation) <> 0 then
    raise exception 'probe rows survived rollback';
  end if;
end
$$;
