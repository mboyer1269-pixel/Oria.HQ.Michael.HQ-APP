-- Migration 0028: foundation context partition + workspace scope hardening.
--
-- Do NOT apply without an explicit CEO GO.
--
-- Goals (Bloc A + C foundation):
--   * Introduce the Vie/Travail partition model (personal | work) derived from mode_id.
--   * Add mode_id + context_partition to durable HITL tables.
--   * Backfill mission_approvals.workspace_id from missions.
--   * Install session GUC helpers and workspace-scope triggers so every write
--     can be bound to a verified workspace when the runtime sets app.workspace_id.
--   * Keep the existing service-role-only RESTRICTIVE block-all pattern for
--     anon/authenticated; application code remains the enforcement boundary until
--     a future JWT/GUC-aware client path lands (see docs/security/workspace-auth-context-contract.md).
--
-- Out of scope: pgvector table (0030), approval proofs (0029).

-- ── Context partition helpers ─────────────────────────────────────────────────

create or replace function public.resolve_context_partition(p_mode_id text)
returns text
language sql
immutable
as $$
  select case when p_mode_id = 'personal' then 'personal' else 'work' end;
$$;

comment on function public.resolve_context_partition(text) is
  'Maps a workspace mode_id to a context partition. personal = Vie; all other modes = Travail.';

create or replace function public.app_current_workspace_id()
returns text
language sql
stable
as $$
  select nullif(current_setting('app.workspace_id', true), '');
$$;

comment on function public.app_current_workspace_id() is
  'Returns the active workspace_id GUC when the runtime sets it per transaction.';

create or replace function public.app_current_context_partition()
returns text
language sql
stable
as $$
  select nullif(current_setting('app.context_partition', true), '');
$$;

comment on function public.app_current_context_partition() is
  'Returns the active context_partition GUC (personal | work) when set per transaction.';

-- ── Sync + validate context_partition from mode_id ────────────────────────────

create or replace function public.sync_context_partition_from_mode()
returns trigger
language plpgsql
as $$
declare
  expected text;
begin
  if new.mode_id is null or char_length(trim(new.mode_id)) = 0 then
    raise exception 'mode_id is required for context-partitioned rows'
      using errcode = 'restrict_violation';
  end if;

  expected := public.resolve_context_partition(new.mode_id);

  if new.context_partition is null or char_length(trim(new.context_partition)) = 0 then
    new.context_partition := expected;
  elsif new.context_partition is distinct from expected then
    raise exception
      'context_partition % does not match mode_id % (expected %)',
      new.context_partition, new.mode_id, expected
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

-- ── Workspace scope enforcement (fires even for service-role writes) ──────────

create or replace function public.enforce_workspace_scope()
returns trigger
language plpgsql
as $$
declare
  scope text;
begin
  scope := public.app_current_workspace_id();
  if scope is not null and new.workspace_id is distinct from scope then
    raise exception
      'workspace_scope_violation: row workspace_id % does not match session scope %',
      new.workspace_id, scope
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_context_partition_scope()
returns trigger
language plpgsql
as $$
declare
  scope text;
begin
  scope := public.app_current_context_partition();
  if scope is not null and new.context_partition is distinct from scope then
    raise exception
      'context_partition_violation: row partition % does not match session scope %',
      new.context_partition, scope
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

-- ── action_ledger: mode + partition columns (only when table exists) ──────────

do $$
begin
  if to_regclass('public.action_ledger') is null then
    raise notice '0028: public.action_ledger absent — skipping mode/partition columns';
    return;
  end if;

  alter table public.action_ledger
    add column if not exists mode_id text,
    add column if not exists context_partition text;

  update public.action_ledger
  set mode_id = 'hq'
  where mode_id is null;

  update public.action_ledger
  set context_partition = public.resolve_context_partition(mode_id)
  where context_partition is null;

  alter table public.action_ledger
    alter column mode_id set not null,
    alter column context_partition set not null;

  if not exists (
    select 1 from pg_constraint
    where conname = 'action_ledger_context_partition_check'
      and conrelid = 'public.action_ledger'::regclass
  ) then
    alter table public.action_ledger
      add constraint action_ledger_context_partition_check
      check (context_partition in ('personal', 'work'));
  end if;

  create index if not exists action_ledger_workspace_partition_idx
    on public.action_ledger(workspace_id, context_partition, created_at desc);

  drop trigger if exists action_ledger_sync_context_partition on public.action_ledger;
  create trigger action_ledger_sync_context_partition
    before insert or update of mode_id, context_partition on public.action_ledger
    for each row
    execute function public.sync_context_partition_from_mode();

  drop trigger if exists action_ledger_enforce_workspace_scope on public.action_ledger;
  create trigger action_ledger_enforce_workspace_scope
    before insert or update of workspace_id on public.action_ledger
    for each row
    execute function public.enforce_workspace_scope();

  drop trigger if exists action_ledger_enforce_context_partition_scope on public.action_ledger;
  create trigger action_ledger_enforce_context_partition_scope
    before insert or update of context_partition on public.action_ledger
    for each row
    execute function public.enforce_context_partition_scope();
end $$;

-- ── agent_execution_intents: mode + partition columns (requires 0024) ─────────

do $$
begin
  if to_regclass('public.agent_execution_intents') is null then
    raise exception '0028 requires public.agent_execution_intents (apply migration 0024 first)';
  end if;

  alter table public.agent_execution_intents
    add column if not exists mode_id text,
    add column if not exists context_partition text;

  update public.agent_execution_intents
  set mode_id = 'hq'
  where mode_id is null;

  update public.agent_execution_intents
  set context_partition = public.resolve_context_partition(mode_id)
  where context_partition is null;

  alter table public.agent_execution_intents
    alter column mode_id set not null,
    alter column context_partition set not null;

  if not exists (
    select 1 from pg_constraint
    where conname = 'agent_execution_intents_context_partition_check'
      and conrelid = 'public.agent_execution_intents'::regclass
  ) then
    alter table public.agent_execution_intents
      add constraint agent_execution_intents_context_partition_check
      check (context_partition in ('personal', 'work'));
  end if;

  create index if not exists agent_execution_intents_workspace_partition_status_idx
    on public.agent_execution_intents(workspace_id, context_partition, status);

  drop trigger if exists agent_execution_intents_sync_context_partition on public.agent_execution_intents;
  create trigger agent_execution_intents_sync_context_partition
    before insert or update of mode_id, context_partition on public.agent_execution_intents
    for each row
    execute function public.sync_context_partition_from_mode();

  drop trigger if exists agent_execution_intents_enforce_workspace_scope on public.agent_execution_intents;
  create trigger agent_execution_intents_enforce_workspace_scope
    before insert or update of workspace_id on public.agent_execution_intents
    for each row
    execute function public.enforce_workspace_scope();

  drop trigger if exists agent_execution_intents_enforce_context_partition_scope on public.agent_execution_intents;
  create trigger agent_execution_intents_enforce_context_partition_scope
    before insert or update of context_partition on public.agent_execution_intents
    for each row
    execute function public.enforce_context_partition_scope();
end $$;

-- ── mission_approvals: workspace scope (only when the table already exists) ───
-- mission_approvals is created by migration 0015. If a disposable rehearsal DB
-- has not applied 0015, skip this section rather than failing the foundation stack.

do $$
begin
  if to_regclass('public.mission_approvals') is null then
    raise notice '0028: public.mission_approvals absent — skipping workspace_id backfill';
    return;
  end if;

  alter table public.mission_approvals
    add column if not exists workspace_id text;

  if to_regclass('public.missions') is not null then
    update public.mission_approvals ma
    set workspace_id = m.workspace_id
    from public.missions m
    where ma.mission_id = m.id
      and ma.workspace_id is null;
  end if;

  update public.mission_approvals
  set workspace_id = 'michael-hq'
  where workspace_id is null;

  alter table public.mission_approvals
    alter column workspace_id set not null;

  if not exists (
    select 1 from pg_constraint
    where conname = 'mission_approvals_workspace_id_check'
      and conrelid = 'public.mission_approvals'::regclass
  ) then
    alter table public.mission_approvals
      add constraint mission_approvals_workspace_id_check
      check (char_length(workspace_id) > 0);
  end if;

  create index if not exists mission_approvals_workspace_id_idx
    on public.mission_approvals(workspace_id);

  drop trigger if exists mission_approvals_enforce_workspace_scope on public.mission_approvals;
  create trigger mission_approvals_enforce_workspace_scope
    before insert or update of workspace_id on public.mission_approvals
    for each row
    execute function public.enforce_workspace_scope();
end $$;
