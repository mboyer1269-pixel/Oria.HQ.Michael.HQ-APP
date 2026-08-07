-- db/smoke/0028_0030_foundation_hitl_rag_smoke.sql
--
-- DISPOSABLE-POSTGRES functional smoke for migrations 0028–0030.
-- Proves context partition isolation, approval-proof gating, and semantic
-- memory partition uniqueness on a real Postgres instance.
--
-- SAFETY: run ONLY against throwaway local Postgres. Fully self-cleaning via ROLLBACK.

\set ON_ERROR_STOP on
\echo '== 0028–0030 foundation smoke (disposable Postgres, transactional) =='

begin;

\ir ../migrations/0024_agent_execution_intents.sql
\ir ../migrations/0028_foundation_context_partition_rls.sql
\ir ../migrations/0029_execution_intent_approval_proofs.sql
\ir ../migrations/0030_pgvector_semantic_memory.sql

-- action_ledger needs workspace_id NOT NULL from 0020; add minimal columns for smoke.
alter table public.action_ledger
  add column if not exists workspace_id text,
  add column if not exists user_id uuid,
  add column if not exists action_type text,
  add column if not exists summary text,
  add column if not exists autonomy_level integer default 0,
  add column if not exists requires_confirmation boolean default true,
  add column if not exists metadata jsonb default '{}',
  add column if not exists payload jsonb default '{}';

do $$
declare
  v_ws      text := 'ws_smoke';
  v_user    uuid := gen_random_uuid();
  v_payload jsonb := jsonb_build_object(
    'agentId', 'hermes', 'skillId', 'task.create', 'client', 'Acme',
    'email', 'a@b.com', 'actionType', 'send_email', 'missionId', 'm1',
    'data', '{}'::jsonb
  );
  v_proof_id uuid;
  v_hash    text := repeat('a', 64);
  n         int;
begin
  -- Seed one pending intent.
  insert into public.agent_execution_intents
    (workspace_id, created_by_user_id, intent_id, agent_id, skill_id, tool_name,
     autonomy_level, status, payload, mode_id, context_partition)
  values
    (v_ws, v_user, 'intent_proof', 'hermes', 'task.create', 'n8n_webhook_trigger',
     2, 'pending', v_payload, 'hq', 'work');

  -- 1) pending -> executing WITHOUT proof must fail.
  begin
    update public.agent_execution_intents
       set status = 'executing', updated_at = now()
     where workspace_id = v_ws and intent_id = 'intent_proof' and status = 'pending';
    raise exception 'expected pending->executing without proof to fail';
  exception
    when others then
      if sqlerrm not like '%pending_to_executing_requires_approval_proof%' then
        raise;
      end if;
  end;

  -- 2) Insert approval proof, then transition with approval_event_id.
  insert into public.agent_execution_intent_approval_events
    (workspace_id, intent_id, mode_id, context_partition, approved_by_user_id,
     intent_payload_hash, approval_proof, approved_at)
  values
    (v_ws, 'intent_proof', 'hq', 'work', v_user, v_hash, v_hash, now())
  returning id into v_proof_id;

  update public.agent_execution_intents
     set status = 'executing',
         approval_event_id = v_proof_id,
         updated_at = now()
   where workspace_id = v_ws and intent_id = 'intent_proof' and status = 'pending';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'approved transition expected 1 row, got %', n; end if;

  -- 3) Context partition mismatch on semantic memory must fail.
  begin
    insert into public.agent_semantic_memory_embeddings
      (workspace_id, mode_id, context_partition, memory_id, content_hash,
       content_preview, embedding)
    values
      (v_ws, 'personal', 'work', 'mem_bad', v_hash, 'preview',
       (select array_fill(0.1::float, array[1536])::vector(1536)));
    raise exception 'expected partition mismatch insert to fail';
  exception
    when others then
      if sqlerrm not like '%semantic_memory_partition_mismatch%'
         and sqlerrm not like '%does not match mode_id%' then
        raise;
      end if;
  end;

  -- 4) Valid personal memory row succeeds.
  insert into public.agent_semantic_memory_embeddings
    (workspace_id, mode_id, context_partition, memory_id, content_hash,
     content_preview, embedding)
  values
    (v_ws, 'personal', 'personal', 'mem_personal', v_hash, 'vie preview',
     (select array_fill(0.2::float, array[1536])::vector(1536)));

  -- 5) Duplicate memory_id in same partition must fail.
  begin
    insert into public.agent_semantic_memory_embeddings
      (workspace_id, mode_id, context_partition, memory_id, content_hash,
       content_preview, embedding)
    values
      (v_ws, 'personal', 'personal', 'mem_personal', v_hash, 'dup',
       (select array_fill(0.3::float, array[1536])::vector(1536)));
    raise exception 'expected duplicate memory_id to fail';
  exception
    when unique_violation then null;
  end;

  raise notice 'OK: approval proof gate + context partition isolation verified';
end $$;

rollback;
\echo '== smoke complete: ROLLBACK applied =='
