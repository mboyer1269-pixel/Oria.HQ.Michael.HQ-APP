-- Prepared only: NOT APPLIED. Runtime membership remains configuration-first.
begin;
create table public.workspace_members (
  workspace_id text not null,
  user_id uuid not null,
  role text not null check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
alter table public.workspace_members enable row level security;
revoke all on public.workspace_members from anon, authenticated;
grant select on public.workspace_members to authenticated;
grant all on public.workspace_members to service_role;
create policy workspace_members_self_select on public.workspace_members
  for select to authenticated using ((select auth.uid()) = user_id);
alter table public.contact_leads add column workspace_id text not null default 'michael-hq';
create index contact_leads_workspace_created_idx on public.contact_leads (workspace_id, created_at desc);
commit;
