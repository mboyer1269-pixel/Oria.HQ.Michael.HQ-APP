-- DRAFT / NOT LIVE. Upgrade ONLY the previous employee_profiles draft schema.
-- Do not apply after the revised full-create draft; it already contains these columns.
-- Existing rows keep NULL/NULL: no fabricated historical request identity or hash.
-- New INSERTs require both values; an immutable global key provides serialization.
-- No PostgreSQL execution, RLS/Auth or concurrency proof was performed for this file.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
alter table public.employee_profiles
  add column creation_key uuid,
  add column creation_payload_hash text,
  add constraint employee_profiles_creation_key_format check
    (creation_key is null or creation_key::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  add constraint employee_profiles_creation_pair check
    ((creation_key is null and creation_payload_hash is null) or
     (creation_key is not null and creation_payload_hash is not null and creation_payload_hash ~ '^[0-9a-f]{64}$'));
create unique index employee_profiles_creation_key_unique on public.employee_profiles(creation_key) where creation_key is not null;
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
-- Existing restrictive policy and column-only UPDATE grant stay unchanged.
-- CREATE OR REPLACE preserves function privileges; no new grant or SECURITY DEFINER.
commit;
