-- db/smoke/0028_0030_foundation_hitl_rag_smoke.sql
--
-- DISPOSABLE-POSTGRES functional smoke for migrations 0028–0030.
-- Proves context partition isolation, approval-proof gating, and semantic
-- memory partition uniqueness on a real Postgres instance.
--
-- SAFETY: run ONLY against throwaway local Postgres. Fully self-cleaning via ROLLBACK.
--
-- HOW TO RUN:
--   psql "$DISPOSABLE_DATABASE_URL" -v ON_ERROR_STOP=1 -f db/smoke/0028_0030_foundation_hitl_rag_smoke.sql

\set ON_ERROR_STOP on
\echo '== 0028–0030 foundation smoke (disposable Postgres, transactional) =='

-- Bootstrap roles that exist on Supabase but not on plain Postgres.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

-- Minimal action_ledger + mission_approvals stubs so 0028 can harden them.
create table if not exists public.action_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  workspace_id text not null default 'michael-hq',
  action_type text not null,
  summary text not null,
  autonomy_level integer not null default 0,
  requires_confirmation boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.missions (
  id text primary key,
  workspace_id text not null
);

create table if not exists public.mission_approvals (
  id text primary key,
  mission_id text not null references public.missions(id) on delete cascade,
  status text not null,
  approval_scope text[] not null default '{}',
  created_at timestamptz not null default now()
);

begin;

\ir ../migrations/0024_agent_execution_intents.sql
\ir ../migrations/0028_foundation_context_partition_rls.sql
\ir ../migrations/0029_execution_intent_approval_proofs.sql
\ir ../migrations/0030_pgvector_semantic_memory.sql

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
  v_proof_id_2 uuid;
  v_hash    text := repeat('a', 64);
  n         int;
  v_status  text;
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

  -- 2b) Rate-limit retry path: executing -> pending, then a SECOND approval event
  --     must be insertable (append-only, no unique-per-intent lock).
  update public.agent_execution_intents
     set status = 'pending', updated_at = now()
   where workspace_id = v_ws and intent_id = 'intent_proof';

  insert into public.agent_execution_intent_approval_events
    (workspace_id, intent_id, mode_id, context_partition, approved_by_user_id,
     intent_payload_hash, approval_proof, approved_at)
  values
    (v_ws, 'intent_proof', 'hq', 'work', v_user, v_hash, repeat('b', 64), now())
  returning id into v_proof_id_2;

  update public.agent_execution_intents
     set status = 'executing',
         approval_event_id = v_proof_id_2,
         updated_at = now()
   where workspace_id = v_ws and intent_id = 'intent_proof' and status = 'pending';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 're-approve transition expected 1 row, got %', n; end if;

  select status into v_status from public.agent_execution_intents
   where workspace_id = v_ws and intent_id = 'intent_proof';
  if v_status <> 'executing' then
    raise exception 'intent_proof expected executing after re-approve, got %', v_status;
  end if;

  -- 3) Context partition mismatch on semantic memory must fail.
  begin
    insert into public.agent_semantic_memory_embeddings
      (workspace_id, mode_id, context_partition, memory_id, content_hash,
       content_preview, embedding)
    values
      (v_ws, 'personal', 'work', 'mem_bad', v_hash, 'preview',
       (select array_fill(0.1::float4, array[1536])::vector(1536)));
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
     (select array_fill(0.2::float4, array[1536])::vector(1536)));

  -- 5) Same memory_id allowed in the OTHER partition (no cross-contamination).
  insert into public.agent_semantic_memory_embeddings
    (workspace_id, mode_id, context_partition, memory_id, content_hash,
     content_preview, embedding)
  values
    (v_ws, 'hq', 'work', 'mem_personal', v_hash, 'travail preview',
     (select array_fill(0.25::float4, array[1536])::vector(1536)));

  -- 6) Duplicate memory_id in same partition must fail.
  begin
    insert into public.agent_semantic_memory_embeddings
      (workspace_id, mode_id, context_partition, memory_id, content_hash,
       content_preview, embedding)
    values
      (v_ws, 'personal', 'personal', 'mem_personal', v_hash, 'dup',
       (select array_fill(0.3::float4, array[1536])::vector(1536)));
    raise exception 'expected duplicate memory_id to fail';
  exception
    when unique_violation then null;
  end;

  -- 7) Workspace GUC scope: write with mismatched app.workspace_id must fail.
  perform set_config('app.workspace_id', 'other-ws', true);
  begin
    insert into public.agent_execution_intents
      (workspace_id, created_by_user_id, intent_id, agent_id, skill_id, tool_name,
       autonomy_level, status, payload, mode_id, context_partition)
    values
      (v_ws, v_user, 'intent_scope', 'hermes', 'task.create', 'n8n_webhook_trigger',
       2, 'pending', v_payload, 'hq', 'work');
    raise exception 'expected workspace_scope_violation';
  exception
    when others then
      if sqlerrm not like '%workspace_scope_violation%' then
        raise;
      end if;
  end;
  perform set_config('app.workspace_id', '', true);

  raise notice 'OK: approval proof gate + re-approve + context partition isolation + GUC scope verified';
end $$;

rollback;
\echo '== smoke complete: ROLLBACK applied =='
