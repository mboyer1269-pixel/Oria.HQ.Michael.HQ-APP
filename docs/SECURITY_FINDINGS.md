# Security Findings — live DB (Oria.hq)

Source: Supabase database linter (`get_advisors security`). Snapshot 2026-06-18.

## Resolved by migration 0025 (applied 2026-06-18)

| # | Finding | Object | Fix |
|---|---|---|---|
| 1 | Permissive `ALL USING(true)` policy open to `public` (incl. anon) | `cockpit_layout` | Dropped `cockpit_layout_all`; added restrictive block-all policies for anon + authenticated. Table is service-role-only, so no behavior change. |
| 2 | RLS enabled, no policy (INFO) | `contact_leads` | Explicit restrictive block-all policies (service-role bypasses). |
| 3 | RLS enabled, no policy (INFO) | `arena_verdicts` | Explicit restrictive block-all policies (service-role bypasses). |
| 4 | SECURITY DEFINER fn executable by anon/authenticated via RPC | `rls_auto_enable()` | `revoke execute` from anon/authenticated/public; `search_path` pinned. Event-trigger still fires (invocation does not check EXECUTE). |
| 5 | Mutable `search_path` | `set_updated_at()` | `search_path = pg_catalog, pg_temp` pinned; execute revoked. Trigger still fires. |

Post-apply advisor re-scan: findings 1–5 above are **gone**.

## Open — requires a dashboard / Auth setting (not SQL)

| Finding | Action |
|---|---|
| Leaked-password protection disabled | Supabase Dashboard → **Authentication → Sign In / Providers → Password** → enable **"Leaked password protection"** (checks HaveIBeenPwned). One toggle. Ref: https://supabase.com/docs/guides/auth/password-security |

## Notes

- All three hardened tables (`cockpit_layout`, `contact_leads`, `arena_verdicts`)
  are accessed exclusively via the service-role admin client
  (`createOptionalSupabaseAdminClient`), which bypasses RLS. Locking the anon /
  authenticated roles is defense-in-depth with zero application impact.
- Revert path: `db/migrations/0025_security_hardening_revert.sql` (note: revert
  reintroduces the advisories and does not restore the insecure permissive
  policy by design).
