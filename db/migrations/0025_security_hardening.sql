-- Migration 0025: security hardening of pre-existing advisory findings.
--
-- Do NOT apply without an explicit CEO GO.
--
-- Addresses Supabase database-linter findings that are UNRELATED to 0024:
--   1. public.cockpit_layout had a permissive `ALL USING(true)` policy granted
--      to `public` (anon included) — anon could read/write any user's layout.
--      Replaced with a service-role-only lock (mirrors 0013/0024).
--   2. public.arena_verdicts and public.contact_leads had RLS enabled but NO
--      policy (INFO lint). Explicit block-all restrictive policies document the
--      deny intent and clear the lint.
--   3. public.rls_auto_enable() (SECURITY DEFINER event-trigger fn) was
--      EXECUTE-able by anon/authenticated via /rest/v1/rpc. Revoked + search_path
--      pinned.
--   4. public.set_updated_at() (trigger fn) had a mutable search_path. Pinned.
--
-- Why this is behavior-safe: cockpit_layout, contact_leads and arena_verdicts
-- are accessed ONLY through the Supabase service-role admin client
-- (createOptionalSupabaseAdminClient), which BYPASSES RLS. Locking the anon /
-- authenticated client roles therefore changes no application behavior. Trigger
-- and event-trigger functions fire regardless of EXECUTE privilege, so the
-- revokes do not disable the triggers.
--
-- NOT covered here (this is an Auth dashboard setting, not SQL):
--   - Leaked-password protection (enable HaveIBeenPwned check in
--     Authentication -> Sign In / Providers -> Password).

-- 1. cockpit_layout: drop permissive policy, lock to service-role only --------
drop policy if exists "cockpit_layout_all" on public.cockpit_layout;

create policy "cockpit_layout_block_anon_all"
  on public.cockpit_layout as restrictive for all to anon
  using (false) with check (false);
create policy "cockpit_layout_block_authenticated_all"
  on public.cockpit_layout as restrictive for all to authenticated
  using (false) with check (false);

-- 2. contact_leads: explicit block-all (service-role bypasses) ----------------
create policy "contact_leads_block_anon_all"
  on public.contact_leads as restrictive for all to anon
  using (false) with check (false);
create policy "contact_leads_block_authenticated_all"
  on public.contact_leads as restrictive for all to authenticated
  using (false) with check (false);

-- 3. arena_verdicts: explicit block-all (service-role bypasses) ---------------
create policy "arena_verdicts_block_anon_all"
  on public.arena_verdicts as restrictive for all to anon
  using (false) with check (false);
create policy "arena_verdicts_block_authenticated_all"
  on public.arena_verdicts as restrictive for all to authenticated
  using (false) with check (false);

-- 4. rls_auto_enable(): revoke public execute + pin search_path --------------
revoke execute on function public.rls_auto_enable() from anon, authenticated, public;
alter function public.rls_auto_enable() set search_path = pg_catalog, pg_temp;

-- 5. set_updated_at(): pin search_path + revoke public execute ---------------
alter function public.set_updated_at() set search_path = pg_catalog, pg_temp;
revoke execute on function public.set_updated_at() from anon, authenticated, public;
