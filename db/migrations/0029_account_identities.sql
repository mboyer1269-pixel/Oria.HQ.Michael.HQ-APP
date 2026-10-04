-- Private server-side surrogate identities. Apply separately before using the repository.
begin;

create table public.account_identities (
  account_id uuid primary key,
  provider text not null check (provider ~ '^[a-z][a-z0-9_-]{0,79}$'),
  workspace_id text not null check (
    char_length(workspace_id) between 1 and 160
    and workspace_id = btrim(workspace_id)
    and workspace_id !~ '[[:cntrl:]]'
  ),
  email text not null check (
    char_length(email) between 3 and 254
    and email = lower(btrim(email))
    and email ~ '^[^[:space:]@[:cntrl:]]+@[^[:space:]@[:cntrl:]]+$'
  ),
  created_at timestamptz not null default now(),
  constraint account_identities_provider_workspace_email_key
    unique (provider, workspace_id, email)
);

alter table public.account_identities enable row level security;
alter table public.account_identities force row level security;

-- No client policies: only the server's service role may insert or read.
revoke all on table public.account_identities from public, anon, authenticated, service_role;
grant select, insert on table public.account_identities to service_role;

commit;
