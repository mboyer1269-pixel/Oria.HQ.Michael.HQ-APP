-- 0024_agent_execution_intents_smoke.sql
--
-- DISPOSABLE-POSTGRES functional smoke for the execution-intent rail. Proves,
-- on a real Postgres, that migration 0024 + the atomic status-guarded UPDATE +
-- the approve/reject lifecycle work together. It is the functional half of the
-- 0024 preflight (the CI half is src/server/db/agent-execution-intents-migration.test.mjs).
--
-- SAFETY
-- ------
-- * Run ONLY against a throwaway local Postgres. NEVER against Supabase live.
-- * Fully self-cleaning: everything runs inside ONE transaction that ROLLBACKs
--   at the end, so it leaves no trace and is infinitely repeatable.
-- * It applies 0024 itself (via \ir), so the target DB needs nothing pre-loaded.
--
-- HOW TO RUN (disposable DB only)
-- -------------------------------
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/0024_agent_execution_intents_smoke.sql
--
-- A clean run prints the final NOTICE and "smoke complete". Any mismatch RAISEs
-- and aborts (ON_ERROR_STOP=1), so a non-zero exit means the rail is NOT ready.

\set ON_ERROR_STOP on
\echo '== 0024 preflight smoke (disposable Postgres, transactional, self-cleaning) =='

begin;

-- Apply the migration under test (relative include from this file's directory).
\ir 0024_agent_execution_intents.sql

do $$
declare
  v_ws    text  := 'ws_smoke';
  v_user  uuid  := gen_random_uuid();
  v_payload jsonb := jsonb_build_object(
    'agentId', 'hermes', 'skillId', 'task.create', 'client', 'Acme',
    'email', 'a@b.com', 'actionType', 'send_email', 'missionId', 'm1',
    'data', '{}'::jsonb
  );
  n        int;
  v_status text;
  v_fc     text;
begin
  -- Seed two pending intents.
  insert into public.agent_execution_intents
    (workspace_id, created_by_user_id, intent_id, agent_id, skill_id, tool_name, autonomy_level, status, payload)
  values
    (v_ws, v_user, 'intent_a', 'hermes', 'task.create', 'n8n_webhook_trigger', 2, 'pending', v_payload),
    (v_ws, v_user, 'intent_b', 'hermes', 'task.create', 'n8n_webhook_trigger', 2, 'pending', v_payload);

  -- 1) APPROVE-CLAIM intent_a: pending -> executing, guarded on status='pending'.
  update public.agent_execution_intents
     set status = 'executing', updated_at = now()
   where workspace_id = v_ws and intent_id = 'intent_a' and status = 'pending';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'approve-claim expected 1 row, got %', n; end if;

  -- 2) STALE REJECT of intent_a guarded on pending -> MUST affect 0 rows
  --    (it is now executing). This is the atomicity proof: a stale reject can
  --    never overwrite an in-flight approval.
  update public.agent_execution_intents
     set status = 'failed', failure_code = 'CEO_REJECTED', updated_at = now()
   where workspace_id = v_ws and intent_id = 'intent_a' and status = 'pending';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'stale reject must affect 0 rows, got % (ATOMIC GUARD FAILED)', n; end if;
  select status into v_status from public.agent_execution_intents
   where workspace_id = v_ws and intent_id = 'intent_a';
  if v_status <> 'executing' then raise exception 'intent_a must stay executing, got %', v_status; end if;

  -- 3) REJECT intent_b: pending -> failed + CEO_REJECTED.
  update public.agent_execution_intents
     set status = 'failed', failure_code = 'CEO_REJECTED', updated_at = now()
   where workspace_id = v_ws and intent_id = 'intent_b' and status = 'pending';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'reject pending expected 1 row, got %', n; end if;
  select status, failure_code into v_status, v_fc from public.agent_execution_intents
   where workspace_id = v_ws and intent_id = 'intent_b';
  if v_status <> 'failed' or v_fc <> 'CEO_REJECTED' then
    raise exception 'intent_b expected failed/CEO_REJECTED, got %/%', v_status, v_fc;
  end if;

  -- 4) PENDING LIST excludes non-pending rows.
  select count(*) into n from public.agent_execution_intents
   where workspace_id = v_ws and status = 'pending';
  if n <> 0 then raise exception 'pending list should be empty, got %', n; end if;

  -- 5) GOVERNANCE INVARIANT: requires_ceo_approval=false must be rejected.
  begin
    insert into public.agent_execution_intents
      (workspace_id, created_by_user_id, intent_id, agent_id, skill_id, tool_name, autonomy_level, status, payload, requires_ceo_approval)
    values
      (v_ws, v_user, 'intent_bad', 'hermes', 'task.create', 'n8n_webhook_trigger', 2, 'pending', v_payload, false);
    raise exception 'requires_ceo_approval=false insert should have been rejected by CHECK';
  exception
    when check_violation then null; -- expected
  end;

  raise notice 'OK: 0024 schema + atomic status guard + approve/reject lifecycle + governance invariant verified';
end $$;

rollback;
\echo '== smoke complete: ROLLBACK applied (disposable, nothing persisted) =='
