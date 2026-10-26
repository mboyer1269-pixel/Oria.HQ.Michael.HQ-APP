-- DRAFT / NOT LIVE. Never applied by this change.
-- Session-bound API only; identity is the immutable composite primary key.
begin;
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
commit;
