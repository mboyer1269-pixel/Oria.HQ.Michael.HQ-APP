-- Prepared only: NOT APPLIED to any remote database by this change. Idempotent.
-- Requires 0032_workspace_members.sql, 0033_workspaces.sql, 0034_display_text_rule.sql.
-- Session-bound API only; identity is the immutable composite primary key.
-- A row is only readable/writable by its owner AND while that owner is a member
-- of the referenced workspace (USING and WITH CHECK).
begin;
create table if not exists public.agent_display_names (
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  agent_id text not null constraint agent_display_names_agent_id_known check (agent_id in ('joris', 'hermes', 'orion', 'sentinel', 'scribe', 'finops', 'validation', 'engineering', 'builder', 'closer', 'marketing', 'inventor', 'support', 'quality')),
  display_name text not null constraint agent_display_names_display_name_rule check (public.oria_display_text_ok(display_name, 80)),
  primary key (user_id, workspace_id, agent_id)
);
alter table public.agent_display_names enable row level security;
revoke all on public.agent_display_names from public, anon, authenticated, service_role;
grant select, insert, delete on public.agent_display_names to authenticated;
grant update (display_name) on public.agent_display_names to authenticated;
drop policy if exists agent_names_read on public.agent_display_names;
drop policy if exists agent_names_insert on public.agent_display_names;
drop policy if exists agent_names_update on public.agent_display_names;
drop policy if exists agent_names_delete on public.agent_display_names;
create policy agent_names_read on public.agent_display_names for select to authenticated
  using ((select auth.uid()) = user_id and exists (select 1 from public.workspace_members m where m.workspace_id = agent_display_names.workspace_id and m.user_id = (select auth.uid())));
create policy agent_names_insert on public.agent_display_names for insert to authenticated
  with check ((select auth.uid()) = user_id and exists (select 1 from public.workspace_members m where m.workspace_id = agent_display_names.workspace_id and m.user_id = (select auth.uid())));
create policy agent_names_update on public.agent_display_names for update to authenticated
  using ((select auth.uid()) = user_id and exists (select 1 from public.workspace_members m where m.workspace_id = agent_display_names.workspace_id and m.user_id = (select auth.uid())))
  with check ((select auth.uid()) = user_id and exists (select 1 from public.workspace_members m where m.workspace_id = agent_display_names.workspace_id and m.user_id = (select auth.uid())));
create policy agent_names_delete on public.agent_display_names for delete to authenticated
  using ((select auth.uid()) = user_id and exists (select 1 from public.workspace_members m where m.workspace_id = agent_display_names.workspace_id and m.user_id = (select auth.uid())));
commit;
