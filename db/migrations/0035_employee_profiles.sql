-- Prepared only: NOT APPLIED to any remote database by this change. Idempotent
-- (IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS before re-create).
-- Requires 0034_display_text_rule.sql. Never apply without a separately authorized DB qualification.
-- A profile and its single-business assignment share ONE row/insert. This does
-- not update ventures.assigned_agents or grant execution tools, roles or licenses.
-- Existing ventures have no owner column: server owner gate + derived workspace
-- remain the authority, exactly as in venture-repository. Not SaaS tenancy.
begin;
create unique index if not exists employee_profiles_venture_scope_key on public.ventures(id, workspace_id);
create table if not exists public.employee_profiles (
  id text primary key check (id ~ '^emp_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  creation_key uuid check (creation_key is null or creation_key::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  creation_payload_hash text,
  constraint employee_profiles_creation_pair check ((creation_key is null and creation_payload_hash is null) or (creation_key is not null and creation_payload_hash is not null and creation_payload_hash ~ '^[0-9a-f]{64}$')),
  owner_id uuid not null references auth.users(id) on delete restrict,
  workspace_id text not null check (char_length(workspace_id) between 1 and 160),
  venture_id text not null,
  display_name text not null check (public.oria_display_text_ok(display_name, 80)),
  specialty text not null check (public.oria_display_text_ok(specialty, 120)),
  instructions text not null check (public.oria_display_text_ok(instructions, 4000, true)),
  assignment_role text not null check (public.oria_display_text_ok(assignment_role, 120)),
  assignment_context text not null check (public.oria_display_text_ok(assignment_context, 2000, true)),
  state text not null default 'draft' check (state in ('draft', 'archived')),
  revision integer not null default 1 check (revision > 0),
  foreign key (venture_id, workspace_id) references public.ventures(id, workspace_id) on update restrict on delete restrict
);
create unique index if not exists employee_profiles_creation_key_unique on public.employee_profiles(creation_key) where creation_key is not null;
create index if not exists employee_profiles_scope on public.employee_profiles(owner_id, workspace_id, venture_id);
alter table public.employee_profiles enable row level security;
-- Server-only, matching ventures. No anonymous/authenticated Data API access.
revoke all on public.employee_profiles from public, anon, authenticated, service_role;
grant select, insert on public.employee_profiles to service_role;
grant update (display_name, specialty, instructions, assignment_role, assignment_context, state, revision)
  on public.employee_profiles to service_role;
drop policy if exists employee_profiles_block_clients on public.employee_profiles;
create policy employee_profiles_block_clients on public.employee_profiles
  as restrictive for all to anon, authenticated using (false) with check (false);
-- Invoker trigger, never SECURITY DEFINER. Protect identities and terminal rows
-- even against an accidentally broadened update. No deleted history.
create or replace function public.employee_profiles_guard() returns trigger
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
drop trigger if exists employee_profiles_guard on public.employee_profiles;
create trigger employee_profiles_guard before insert or update or delete on public.employee_profiles
  for each row execute function public.employee_profiles_guard();
comment on table public.employee_profiles is 'Presentation-only proposed employees. No execution authority. Draft schema, unqualified.';
commit;
