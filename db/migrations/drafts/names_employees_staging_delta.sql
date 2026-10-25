-- CANONICAL FINAL DELIVERY DRAFT / NOT APPLIED. Supersedes historical delta-review-only.sql. Target: Oria.hq-staging (teatqbtzgzcygpefnfbh).
-- Confirm target through authorized connector before any execution. SQL database name
-- alone does NOT distinguish Supabase projects. No production approval.
-- Existing schema inspected 2026-10-24. Migration history empty is NOT empty schema.
-- New objects only plus composite unique index on existing ventures. No old migration replay.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
do $$
begin
  if to_regclass('public.agent_display_names') is not null
     or to_regclass('public.employee_profiles') is not null
     or to_regclass('public.employee_profiles_venture_scope_key') is not null
     or to_regclass('public.employee_profiles_creation_key_unique') is not null
     or to_regprocedure('public.employee_profiles_guard()') is not null then
    raise exception 'Qualification objects already exist: inspect drift, do not replay';
  end if;
  if not exists (select 1 from pg_class where oid=to_regclass('public.ventures') and relrowsecurity)
     or (select count(*) from information_schema.columns where table_schema='public' and table_name='ventures'
         and column_name in ('id','workspace_id') and data_type='text' and is_nullable='NO') <> 2
     or not exists (select 1 from information_schema.columns where table_schema='auth' and table_name='users' and column_name='id' and data_type='uuid') then
    raise exception 'Staging schema prerequisites changed';
  end if;
end;
$$;
-- DRAFT / NOT LIVE. Never applied by this change.
-- Session-bound API only; identity is the immutable composite primary key.
create table public.agent_display_names (
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id text not null check (length(workspace_id) between 1 and 160),
  agent_id text not null check (agent_id in ('joris', 'hermes', 'orion', 'sentinel', 'scribe', 'finops', 'validation', 'engineering', 'builder', 'closer', 'marketing', 'inventor', 'support', 'quality')),
  display_name text not null check (
    display_name = btrim(display_name) and char_length(display_name) between 1 and 80
    and display_name !~ '[[:cntrl:]]'
  ),
  primary key (user_id, workspace_id, agent_id)
);
alter table public.agent_display_names enable row level security;
revoke all on public.agent_display_names from public, anon, authenticated, service_role;
grant select, insert, delete on public.agent_display_names to authenticated;
grant update (display_name) on public.agent_display_names to authenticated;
create policy agent_names_read on public.agent_display_names for select to authenticated
  using ((select auth.uid()) = user_id);
create policy agent_names_insert on public.agent_display_names for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy agent_names_update on public.agent_display_names for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy agent_names_delete on public.agent_display_names for delete to authenticated
  using ((select auth.uid()) = user_id);

-- DRAFT / NOT LIVE. Never apply without a separately authorized DB qualification.
-- A profile and its single-business assignment share ONE row/insert. This does
-- not update ventures.assigned_agents or grant execution tools, roles or licenses.
-- Existing ventures have no owner column: server owner gate + derived workspace
-- remain the authority, exactly as in venture-repository. Not SaaS tenancy.
create unique index employee_profiles_venture_scope_key on public.ventures(id, workspace_id);
create table public.employee_profiles (
  id text primary key check (id ~ '^emp_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  creation_key uuid check (creation_key is null or creation_key::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  creation_payload_hash text,
  constraint employee_profiles_creation_pair check ((creation_key is null and creation_payload_hash is null) or (creation_key is not null and creation_payload_hash is not null and creation_payload_hash ~ '^[0-9a-f]{64}$')),
  owner_id uuid not null references auth.users(id) on delete restrict,
  workspace_id text not null check (char_length(workspace_id) between 1 and 160),
  venture_id text not null,
  display_name text not null check (display_name = btrim(display_name) and char_length(display_name) between 1 and 80 and display_name !~ '[[:cntrl:]]'),
  specialty text not null check (specialty = btrim(specialty) and char_length(specialty) between 1 and 120 and specialty !~ '[[:cntrl:]]'),
  instructions text not null check (instructions = btrim(instructions) and char_length(instructions) between 1 and 4000 and regexp_replace(instructions, E'[\\n\\r\\t]', '', 'g') !~ '[[:cntrl:]]'),
  assignment_role text not null check (assignment_role = btrim(assignment_role) and char_length(assignment_role) between 1 and 120 and assignment_role !~ '[[:cntrl:]]'),
  assignment_context text not null check (assignment_context = btrim(assignment_context) and char_length(assignment_context) between 1 and 2000 and regexp_replace(assignment_context, E'[\\n\\r\\t]', '', 'g') !~ '[[:cntrl:]]'),
  state text not null default 'draft' check (state in ('draft', 'archived')),
  revision integer not null default 1 check (revision > 0),
  foreign key (venture_id, workspace_id) references public.ventures(id, workspace_id) on update restrict on delete restrict
);
create unique index employee_profiles_creation_key_unique on public.employee_profiles(creation_key) where creation_key is not null;
create index employee_profiles_scope on public.employee_profiles(owner_id, workspace_id, venture_id);
alter table public.employee_profiles enable row level security;
-- Server-only, matching ventures. No anonymous/authenticated Data API access.
revoke all on public.employee_profiles from public, anon, authenticated, service_role;
grant select, insert on public.employee_profiles to service_role;
grant update (display_name, specialty, instructions, assignment_role, assignment_context, state, revision)
  on public.employee_profiles to service_role;
create policy employee_profiles_block_clients on public.employee_profiles
  as restrictive for all to anon, authenticated using (false) with check (false);
-- Invoker trigger, never SECURITY DEFINER. Protect identities and terminal rows
-- even against an accidentally broadened update. No deleted history.
create function public.employee_profiles_guard() returns trigger
language plpgsql security invoker set search_path = pg_catalog as $$
begin
  if TG_OP = 'DELETE' then
    raise exception 'Employee profiles must be archived';
  end if;
  if TG_OP = 'INSERT' then
    if NEW.creation_key is null or NEW.creation_payload_hash is null then
      raise exception 'Employee creation intention is required';
    end if;
    if NEW.state <> 'draft' or NEW.revision <> 1 then
      raise exception 'Employee profiles must start as draft revision 1';
    end if;
    return NEW;
  end if;
  if NEW.creation_key is distinct from OLD.creation_key or NEW.creation_payload_hash is distinct from OLD.creation_payload_hash
     or NEW.id is distinct from OLD.id or NEW.owner_id is distinct from OLD.owner_id
     or NEW.workspace_id is distinct from OLD.workspace_id or NEW.venture_id is distinct from OLD.venture_id
     or OLD.state <> 'draft' or NEW.revision <> OLD.revision + 1 then
    raise exception 'Employee identity or revision conflict';
  end if;
  return NEW;
end;
$$;
revoke all on function public.employee_profiles_guard() from public, anon, authenticated;
create trigger employee_profiles_guard before insert or update or delete on public.employee_profiles
  for each row execute function public.employee_profiles_guard();
comment on table public.employee_profiles is 'Presentation-only proposed employees. No execution authority. Draft schema, unqualified.';

commit;
