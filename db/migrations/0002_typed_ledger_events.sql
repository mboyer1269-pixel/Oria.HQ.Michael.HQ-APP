alter table public.action_ledger
  add column if not exists workspace_id text,
  add column if not exists event_type text,
  add column if not exists skill_id text,
  add column if not exists agent_id text,
  add column if not exists mission_id text,
  add column if not exists payload jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'action_ledger_event_type_check'
      and conrelid = 'public.action_ledger'::regclass
  ) then
    alter table public.action_ledger
      add constraint action_ledger_event_type_check
      check (
        event_type is null
        or event_type in ('decision', 'action', 'result', 'cost', 'learning')
      );
  end if;
end $$;

create index if not exists action_ledger_workspace_id_idx
  on public.action_ledger(workspace_id);

create index if not exists action_ledger_event_type_idx
  on public.action_ledger(event_type);

create index if not exists action_ledger_mission_id_idx
  on public.action_ledger(mission_id)
  where mission_id is not null;

create index if not exists action_ledger_skill_id_idx
  on public.action_ledger(skill_id)
  where skill_id is not null;
