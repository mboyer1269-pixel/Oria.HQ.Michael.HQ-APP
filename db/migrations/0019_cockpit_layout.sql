-- Migration 0019: cockpit_layout
--
-- Durable per-user cockpit widget order for the PR-2 interactive cockpit.
--
-- Scope
-- -----
-- Stores only layout preference metadata:
--   - user_id: owner of the layout
--   - widget_order: ordered list of widget ids
--
-- This is not an execution table, not a ledger, and not a runtime control
-- surface. It does not authorize actions.

create table if not exists public.cockpit_layout (
  user_id text primary key
    constraint cockpit_layout_user_id_check check (char_length(user_id) > 0),
  widget_order jsonb not null default '[]'::jsonb
    constraint cockpit_layout_widget_order_array_check check (jsonb_typeof(widget_order) = 'array'),
  updated_at timestamptz not null default now()
);

alter table public.cockpit_layout enable row level security;

-- Owner-scoped direct access. Server actions use the service-role repository,
-- but authenticated owner policies keep client access bounded if it is added
-- later.
create policy "cockpit_layout_owner_select"
  on public.cockpit_layout
  for select
  to authenticated
  using (user_id = auth.uid()::text);

create policy "cockpit_layout_owner_insert"
  on public.cockpit_layout
  for insert
  to authenticated
  with check (user_id = auth.uid()::text);

create policy "cockpit_layout_owner_update"
  on public.cockpit_layout
  for update
  to authenticated
  using (user_id = auth.uid()::text)
  with check (user_id = auth.uid()::text);

-- NO DELETE policy. Layout can be overwritten to DEFAULT_ORDER, but rows are
-- not deleted by the app.

-- ---------------------------------------------------------------------------
-- Rollback (run manually to fully revert this migration)
-- ---------------------------------------------------------------------------
-- drop policy if exists "cockpit_layout_owner_update" on public.cockpit_layout;
-- drop policy if exists "cockpit_layout_owner_insert" on public.cockpit_layout;
-- drop policy if exists "cockpit_layout_owner_select" on public.cockpit_layout;
-- drop table if exists public.cockpit_layout;
