-- Prepared only: NOT APPLIED to any remote database by this change. Idempotent.
-- Minimal workspace identity table so workspace-scoped tables (agent_display_names)
-- can reference a real workspace. Configuration remains the runtime authority;
-- rows are created server-side (service_role) only.
begin;
create table if not exists public.workspaces (
  id text primary key check (char_length(id) between 1 and 160),
  created_at timestamptz not null default now()
);
alter table public.workspaces enable row level security;
revoke all on public.workspaces from public, anon, authenticated;
grant select on public.workspaces to authenticated;
grant all on public.workspaces to service_role;
drop policy if exists workspaces_member_select on public.workspaces;
create policy workspaces_member_select on public.workspaces for select to authenticated
  using (exists (select 1 from public.workspace_members m
                 where m.workspace_id = workspaces.id and m.user_id = (select auth.uid())));
-- The legacy single workspace (DEFAULT_WORKSPACE_SLUG) always exists.
insert into public.workspaces (id) values ('michael-hq') on conflict (id) do nothing;
commit;
