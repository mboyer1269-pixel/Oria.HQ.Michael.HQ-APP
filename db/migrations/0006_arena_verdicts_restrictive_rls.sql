-- Migration 0006: Explicit restrictive RLS policies for arena_verdicts
--
-- Context
-- -------
-- Row Level Security was enabled in 0003_arena_verdicts.sql but no policies
-- were defined. With RLS enabled and no policies, Postgres denies all
-- non-superuser access by default. This migration codifies that intent
-- explicitly so the policy list documents "no JWT access, ever" and prevents
-- accidental permissive policies from opening the table later.
--
-- Who CAN access this table
-- -------------------------
-- The Supabase service-role key carries the bypassrls privilege and is
-- therefore unaffected by these policies. All server-side code uses the
-- service-role client when Supabase is configured.
--
-- Who CANNOT access this table
-- -----------------------------
-- The anon role (unauthenticated requests using the public anon key).
-- The authenticated role (JWT-authenticated requests from the client).
-- Both are blocked by the policies below for all operations.

alter table public.arena_verdicts enable row level security;

-- SELECT ------------------------------------------------------------------
create policy "arena_verdicts_block_anon_select"
  on public.arena_verdicts
  as restrictive
  for select
  to anon
  using (false);

create policy "arena_verdicts_block_authenticated_select"
  on public.arena_verdicts
  as restrictive
  for select
  to authenticated
  using (false);

-- INSERT ------------------------------------------------------------------
create policy "arena_verdicts_block_anon_insert"
  on public.arena_verdicts
  as restrictive
  for insert
  to anon
  with check (false);

create policy "arena_verdicts_block_authenticated_insert"
  on public.arena_verdicts
  as restrictive
  for insert
  to authenticated
  with check (false);

-- UPDATE ------------------------------------------------------------------
create policy "arena_verdicts_block_anon_update"
  on public.arena_verdicts
  as restrictive
  for update
  to anon
  using (false)
  with check (false);

create policy "arena_verdicts_block_authenticated_update"
  on public.arena_verdicts
  as restrictive
  for update
  to authenticated
  using (false)
  with check (false);

-- DELETE ------------------------------------------------------------------
create policy "arena_verdicts_block_anon_delete"
  on public.arena_verdicts
  as restrictive
  for delete
  to anon
  using (false);

create policy "arena_verdicts_block_authenticated_delete"
  on public.arena_verdicts
  as restrictive
  for delete
  to authenticated
  using (false);
