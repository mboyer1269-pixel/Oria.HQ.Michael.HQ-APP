-- Migration 0005: Explicit RLS policies for the missions table
--
-- Context
-- -------
-- Row Level Security was enabled in 0001_missions.sql but no policies were
-- defined.  With RLS enabled and no policies, Postgres denies all non-superuser
-- access by default — which is already the correct behaviour for this table.
--
-- This migration adds *explicit* RESTRICTIVE policies that codify that intent
-- so that:
--   1. The policy list is self-documenting ("no JWT access, ever").
--   2. A future "USING (true)" permissive policy cannot accidentally open the
--      table to the `anon` or `authenticated` roles — a RESTRICTIVE policy
--      must be satisfied in addition to any permissive one.
--
-- Who CAN access this table
-- -------------------------
-- The Supabase service-role key carries the `bypassrls` privilege and is
-- therefore unaffected by these policies.  All server-side code uses the
-- service-role client (createOptionalSupabaseAdminClient).
--
-- Who CANNOT access this table
-- -----------------------------
-- The `anon` role  (unauthenticated requests using the public anon key).
-- The `authenticated` role (JWT-authenticated requests from the client).
-- Both are blocked by the policies below for all operations.

-- SELECT ------------------------------------------------------------------
create policy "missions_block_anon_select"
  on public.missions
  as restrictive
  for select
  to anon
  using (false);

create policy "missions_block_authenticated_select"
  on public.missions
  as restrictive
  for select
  to authenticated
  using (false);

-- INSERT ------------------------------------------------------------------
create policy "missions_block_anon_insert"
  on public.missions
  as restrictive
  for insert
  to anon
  with check (false);

create policy "missions_block_authenticated_insert"
  on public.missions
  as restrictive
  for insert
  to authenticated
  with check (false);

-- UPDATE ------------------------------------------------------------------
create policy "missions_block_anon_update"
  on public.missions
  as restrictive
  for update
  to anon
  using (false)
  with check (false);

create policy "missions_block_authenticated_update"
  on public.missions
  as restrictive
  for update
  to authenticated
  using (false)
  with check (false);

-- DELETE ------------------------------------------------------------------
create policy "missions_block_anon_delete"
  on public.missions
  as restrictive
  for delete
  to anon
  using (false);

create policy "missions_block_authenticated_delete"
  on public.missions
  as restrictive
  for delete
  to authenticated
  using (false);
