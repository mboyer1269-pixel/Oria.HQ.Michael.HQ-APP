-- Migration 0026: workspaces + workspace_members — the tenancy storage layer.
--
-- Do NOT apply without an explicit CEO GO.
--
-- What this is
-- -----------
-- Today a workspace is a config constant (src/config/workspaces/*.config.ts)
-- resolved for a single env-configured owner. These two tables make a workspace
-- a real, per-tenant row with an explicit membership list — the storage half of
-- the tenancy phase (design note: docs/TENANCY_DESIGN.md).
--
-- COMPATIBILITY — read before applying
-- ------------------------------------
-- Every existing workspace-scoped table (action_ledger, missions, calendar
-- events, agent_execution_intents, ...) stores `workspace_id` as TEXT holding a
-- SLUG (e.g. 'michael-hq'), not a uuid. This migration deliberately does NOT
-- touch those columns and does NOT add foreign keys to them:
--   - `workspaces.slug` is the join key to that existing text world;
--   - `workspaces.id` (uuid) is the internal key for future relations.
-- Converting the legacy text columns is a separate, riskier migration that must
-- get its own mandate. Applying 0026 alone changes NO existing behavior: nothing
-- in the running product reads these tables until the resolver is wired.
--
-- Governance invariants at the storage layer
-- ------------------------------------------
--   - One accountable owner per workspace: a partial unique index allows at most
--     one active `owner` row per workspace. The approval seal
--     (execution.approve) is bound to that single human — mirroring how 0024
--     forces requires_ceo_approval = true in the table itself rather than
--     trusting the application.
--   - Role and status values are whitelisted by CHECK constraints, matching
--     src/core/workspaces/membership.ts exactly.
--   - Deleting a workspace cascades to its memberships (no orphan grants).
--
-- Access
-- ------
-- Service-role key only (bypassrls). RESTRICTIVE policies below deny anon and
-- authenticated for every operation (mirrors 0013 / 0024 / 0025). There is no
-- direct client access. Member-scoped read policies would only be added if
-- direct client access is ever introduced — it is not, today.

-- 1. workspaces --------------------------------------------------------------

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),

  -- Join key to the legacy `workspace_id text` columns. Stable across renames.
  slug text not null
    constraint workspaces_slug_check check (char_length(slug) > 0),

  display_name text not null
    constraint workspaces_display_name_check check (char_length(display_name) > 0),

  -- Supabase auth.users.id of the accountable owner. Denormalised for fast
  -- lookups; the authoritative grant is the `owner` row in workspace_members.
  owner_user_id uuid not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint workspaces_slug_unique unique (slug)
);

alter table public.workspaces enable row level security;

create index if not exists workspaces_owner_user_id_idx
  on public.workspaces(owner_user_id);

-- 2. workspace_members -------------------------------------------------------

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null
    references public.workspaces(id) on delete cascade,

  -- Supabase auth.users.id of the member.
  user_id uuid not null,

  role text not null
    constraint workspace_members_role_check
    check (role in ('owner', 'admin', 'operator', 'viewer')),

  status text not null default 'active'
    constraint workspace_members_status_check
    check (status in ('active', 'invited', 'revoked')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A user holds at most one membership row per workspace.
  constraint workspace_members_unique_per_workspace unique (workspace_id, user_id)
);

alter table public.workspace_members enable row level security;

-- At most ONE active owner per workspace (the governance seal is singular).
create unique index if not exists workspace_members_single_active_owner_idx
  on public.workspace_members(workspace_id)
  where role = 'owner' and status = 'active';

create index if not exists workspace_members_user_id_idx
  on public.workspace_members(user_id);
create index if not exists workspace_members_user_active_idx
  on public.workspace_members(user_id, status);
create index if not exists workspace_members_workspace_id_idx
  on public.workspace_members(workspace_id);

-- 3. updated_at triggers (only if the shared helper exists) ------------------
-- public.set_updated_at() predates this migration (search_path pinned in 0025).
-- Guarded so the migration stays applicable on a database that lacks it.

do $$
begin
  if exists (
    select 1 from pg_proc
    where proname = 'set_updated_at' and pronamespace = 'public'::regnamespace
  ) then
    if not exists (select 1 from pg_trigger where tgname = 'workspaces_set_updated_at') then
      create trigger workspaces_set_updated_at
        before update on public.workspaces
        for each row execute function public.set_updated_at();
    end if;

    if not exists (select 1 from pg_trigger where tgname = 'workspace_members_set_updated_at') then
      create trigger workspace_members_set_updated_at
        before update on public.workspace_members
        for each row execute function public.set_updated_at();
    end if;
  end if;
end
$$;

-- 4. RESTRICTIVE block-all policies (mirrors 0013 / 0024) --------------------
-- With RLS enabled and these restrictive policies, anon and authenticated are
-- denied for every operation. Only the service-role key (bypassrls) reaches
-- these tables.

-- workspaces: SELECT ---------------------------------------------------------
create policy "workspaces_block_anon_select"
  on public.workspaces as restrictive for select to anon using (false);
create policy "workspaces_block_authenticated_select"
  on public.workspaces as restrictive for select to authenticated using (false);

-- workspaces: INSERT ---------------------------------------------------------
create policy "workspaces_block_anon_insert"
  on public.workspaces as restrictive for insert to anon with check (false);
create policy "workspaces_block_authenticated_insert"
  on public.workspaces as restrictive for insert to authenticated with check (false);

-- workspaces: UPDATE ---------------------------------------------------------
create policy "workspaces_block_anon_update"
  on public.workspaces as restrictive for update to anon using (false) with check (false);
create policy "workspaces_block_authenticated_update"
  on public.workspaces as restrictive for update to authenticated using (false) with check (false);

-- workspaces: DELETE ---------------------------------------------------------
create policy "workspaces_block_anon_delete"
  on public.workspaces as restrictive for delete to anon using (false);
create policy "workspaces_block_authenticated_delete"
  on public.workspaces as restrictive for delete to authenticated using (false);

-- workspace_members: SELECT --------------------------------------------------
create policy "workspace_members_block_anon_select"
  on public.workspace_members as restrictive for select to anon using (false);
create policy "workspace_members_block_authenticated_select"
  on public.workspace_members as restrictive for select to authenticated using (false);

-- workspace_members: INSERT --------------------------------------------------
create policy "workspace_members_block_anon_insert"
  on public.workspace_members as restrictive for insert to anon with check (false);
create policy "workspace_members_block_authenticated_insert"
  on public.workspace_members as restrictive for insert to authenticated with check (false);

-- workspace_members: UPDATE --------------------------------------------------
create policy "workspace_members_block_anon_update"
  on public.workspace_members as restrictive for update to anon using (false) with check (false);
create policy "workspace_members_block_authenticated_update"
  on public.workspace_members as restrictive for update to authenticated using (false) with check (false);

-- workspace_members: DELETE --------------------------------------------------
create policy "workspace_members_block_anon_delete"
  on public.workspace_members as restrictive for delete to anon using (false);
create policy "workspace_members_block_authenticated_delete"
  on public.workspace_members as restrictive for delete to authenticated using (false);
