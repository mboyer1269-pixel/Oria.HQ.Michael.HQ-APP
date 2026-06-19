-- 0025_security_hardening_revert.sql
--
-- Drops the policies and resets the function settings added by
-- 0025_security_hardening.sql.
--
-- WARNING: reverting REINTRODUCES the advisory findings. By design this revert
-- does NOT restore the original insecure `cockpit_layout_all USING(true)`
-- permissive policy — it leaves cockpit_layout at RLS-on with no client policy
-- (still deny-by-default to anon/authenticated, service-role unaffected). If a
-- true byte-for-byte restore of the insecure policy is required, recreate it
-- manually.

drop policy if exists "cockpit_layout_block_anon_all" on public.cockpit_layout;
drop policy if exists "cockpit_layout_block_authenticated_all" on public.cockpit_layout;
drop policy if exists "contact_leads_block_anon_all" on public.contact_leads;
drop policy if exists "contact_leads_block_authenticated_all" on public.contact_leads;
drop policy if exists "arena_verdicts_block_anon_all" on public.arena_verdicts;
drop policy if exists "arena_verdicts_block_authenticated_all" on public.arena_verdicts;

alter function public.rls_auto_enable() reset search_path;
grant execute on function public.rls_auto_enable() to anon, authenticated;
alter function public.set_updated_at() reset search_path;
grant execute on function public.set_updated_at() to anon, authenticated;
