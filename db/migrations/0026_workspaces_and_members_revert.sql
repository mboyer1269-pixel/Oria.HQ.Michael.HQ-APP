-- 0026_workspaces_and_members_revert.sql
--
-- Drops the triggers, policies, indexes and tables created by
-- 0026_workspaces_and_members.sql. Reversible and low-risk while the tenancy
-- resolver is not wired: nothing in the running product reads these tables, and
-- 0026 never touched the legacy `workspace_id text` columns.
--
-- WARNING: once membership rows are real (post-wiring), this revert DESTROYS
-- the tenancy grants. Take a backup first and confirm no live workspace depends
-- on them.

drop trigger if exists workspace_members_set_updated_at on public.workspace_members;
drop trigger if exists workspaces_set_updated_at on public.workspaces;

drop policy if exists "workspace_members_block_anon_select" on public.workspace_members;
drop policy if exists "workspace_members_block_authenticated_select" on public.workspace_members;
drop policy if exists "workspace_members_block_anon_insert" on public.workspace_members;
drop policy if exists "workspace_members_block_authenticated_insert" on public.workspace_members;
drop policy if exists "workspace_members_block_anon_update" on public.workspace_members;
drop policy if exists "workspace_members_block_authenticated_update" on public.workspace_members;
drop policy if exists "workspace_members_block_anon_delete" on public.workspace_members;
drop policy if exists "workspace_members_block_authenticated_delete" on public.workspace_members;

drop policy if exists "workspaces_block_anon_select" on public.workspaces;
drop policy if exists "workspaces_block_authenticated_select" on public.workspaces;
drop policy if exists "workspaces_block_anon_insert" on public.workspaces;
drop policy if exists "workspaces_block_authenticated_insert" on public.workspaces;
drop policy if exists "workspaces_block_anon_update" on public.workspaces;
drop policy if exists "workspaces_block_authenticated_update" on public.workspaces;
drop policy if exists "workspaces_block_anon_delete" on public.workspaces;
drop policy if exists "workspaces_block_authenticated_delete" on public.workspaces;

drop index if exists public.workspace_members_workspace_id_idx;
drop index if exists public.workspace_members_user_active_idx;
drop index if exists public.workspace_members_user_id_idx;
drop index if exists public.workspace_members_single_active_owner_idx;
drop index if exists public.workspaces_owner_user_id_idx;

-- workspace_members first: it references workspaces.
drop table if exists public.workspace_members;
drop table if exists public.workspaces;
