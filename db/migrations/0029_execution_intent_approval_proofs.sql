-- Migration 0029: cryptographic human-approval proofs for execution intents.
--
-- Do NOT apply without an explicit CEO GO.
--
-- Guarantees that agent_execution_intents can NEVER transition pending -> executing
-- without an append-only approval event carrying a SHA-256 proof over the intent
-- snapshot. The proof is computed in application code (src/server/security/approval-proof.ts)
-- and verified at the storage layer via FK + trigger.
--
-- Lifecycle:
--   1. CEO approves in the cockpit.
--   2. Application inserts agent_execution_intent_approval_events (append-only).
--   3. Application transitions intent pending -> executing with approval_event_id set.
--   4. Trigger rejects any pending -> executing without a matching proof row.

create table if not exists public.agent_execution_intent_approval_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null
    constraint agent_execution_intent_approval_events_workspace_id_check
      check (char_length(workspace_id) > 0),
  intent_id text not null
    constraint agent_execution_intent_approval_events_intent_id_check
      check (char_length(intent_id) > 0),
  mode_id text not null
    constraint agent_execution_intent_approval_events_mode_id_check
      check (char_length(mode_id) > 0),
  context_partition text not null
    constraint agent_execution_intent_approval_events_context_partition_check
      check (context_partition in ('personal', 'work')),
  approved_by_user_id uuid not null,
  intent_payload_hash text not null
    constraint agent_execution_intent_approval_events_payload_hash_check
      check (intent_payload_hash ~ '^[0-9a-f]{64}$'),
  approval_proof text not null
    constraint agent_execution_intent_approval_events_proof_check
      check (approval_proof ~ '^[0-9a-f]{64}$'),
  approved_at timestamptz not null,
  created_at timestamptz not null default now(),

  constraint agent_execution_intent_approval_events_unique_per_intent
    unique (workspace_id, intent_id)
);

alter table public.agent_execution_intent_approval_events enable row level security;

create index if not exists agent_execution_intent_approval_events_workspace_idx
  on public.agent_execution_intent_approval_events(workspace_id);
create index if not exists agent_execution_intent_approval_events_workspace_intent_idx
  on public.agent_execution_intent_approval_events(workspace_id, intent_id);
create index if not exists agent_execution_intent_approval_events_workspace_partition_idx
  on public.agent_execution_intent_approval_events(workspace_id, context_partition, approved_at desc);

-- RESTRICTIVE block-all (service-role only, mirrors 0024).
create policy "agent_execution_intent_approval_events_block_anon_select"
  on public.agent_execution_intent_approval_events as restrictive for select to anon using (false);
create policy "agent_execution_intent_approval_events_block_authenticated_select"
  on public.agent_execution_intent_approval_events as restrictive for select to authenticated using (false);
create policy "agent_execution_intent_approval_events_block_anon_insert"
  on public.agent_execution_intent_approval_events as restrictive for insert to anon with check (false);
create policy "agent_execution_intent_approval_events_block_authenticated_insert"
  on public.agent_execution_intent_approval_events as restrictive for insert to authenticated with check (false);
create policy "agent_execution_intent_approval_events_block_anon_update"
  on public.agent_execution_intent_approval_events as restrictive for update to anon using (false) with check (false);
create policy "agent_execution_intent_approval_events_block_authenticated_update"
  on public.agent_execution_intent_approval_events as restrictive for update to authenticated using (false) with check (false);
create policy "agent_execution_intent_approval_events_block_anon_delete"
  on public.agent_execution_intent_approval_events as restrictive for delete to anon using (false);
create policy "agent_execution_intent_approval_events_block_authenticated_delete"
  on public.agent_execution_intent_approval_events as restrictive for delete to authenticated using (false);

-- Append-only: no updates or deletes.
create or replace function public.agent_execution_intent_approval_events_block_mutations()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'agent_execution_intent_approval_events is append-only: % is not permitted',
    tg_op
    using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists agent_execution_intent_approval_events_immutable on public.agent_execution_intent_approval_events;
create trigger agent_execution_intent_approval_events_immutable
  before update or delete on public.agent_execution_intent_approval_events
  for each row
  execute function public.agent_execution_intent_approval_events_block_mutations();

drop trigger if exists agent_execution_intent_approval_events_sync_context_partition
  on public.agent_execution_intent_approval_events;
create trigger agent_execution_intent_approval_events_sync_context_partition
  before insert or update of mode_id, context_partition on public.agent_execution_intent_approval_events
  for each row
  execute function public.sync_context_partition_from_mode();

drop trigger if exists agent_execution_intent_approval_events_enforce_workspace_scope
  on public.agent_execution_intent_approval_events;
create trigger agent_execution_intent_approval_events_enforce_workspace_scope
  before insert or update of workspace_id on public.agent_execution_intent_approval_events
  for each row
  execute function public.enforce_workspace_scope();

-- Link intents to their approval proof.
alter table public.agent_execution_intents
  add column if not exists approval_event_id uuid null
    references public.agent_execution_intent_approval_events(id);

create index if not exists agent_execution_intents_approval_event_id_idx
  on public.agent_execution_intents(approval_event_id)
  where approval_event_id is not null;

-- Enforce pending -> executing requires a matching approval proof.
create or replace function public.agent_execution_intents_require_approval_proof()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'pending' and new.status = 'executing' then
    if new.approval_event_id is null then
      raise exception 'pending_to_executing_requires_approval_proof'
        using errcode = 'restrict_violation';
    end if;

    if not exists (
      select 1
      from public.agent_execution_intent_approval_events e
      where e.id = new.approval_event_id
        and e.workspace_id = new.workspace_id
        and e.intent_id = new.intent_id
    ) then
      raise exception 'approval_proof_not_found'
        using errcode = 'restrict_violation';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists agent_execution_intents_require_approval_proof on public.agent_execution_intents;
create trigger agent_execution_intents_require_approval_proof
  before update of status, approval_event_id on public.agent_execution_intents
  for each row
  execute function public.agent_execution_intents_require_approval_proof();
