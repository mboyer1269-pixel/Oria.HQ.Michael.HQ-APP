-- Migration 0012: cash_signal_intakes — durable, auditable backing store for
-- captured cash signals (the proof half of the vertical cash loop).
--
-- Do NOT apply without an explicit CEO GO.
--
-- What this is
-- -----------
-- A cash signal intake records the RESULT of an owner-approved, manually
-- performed cash action: what came back (a Stripe charge, a signed LOI, an
-- email reply, a booked meeting, a verbal nod, or a note) and the normalized
-- EvidenceRef for it. It is an APPEND-ONLY audit log of proof.
--   * It NEVER executes, sends, charges, contacts, or dispatches anything.
--   * It is NOT the action ledger and authorizes nothing.
--   * It is the Supabase backing store for the repository that otherwise runs
--     on an in-memory local fallback (see
--     src/server/ventures/cash-signal-intake-repository.ts). It is scoped per
--     workspace. Columns mirror the TypeScript CashSignalIntake contract in
--     src/features/ventures/cash-signal-intake.ts.
--
-- Strict accounting at the storage layer
-- --------------------------------------
-- A positive amount_cents is only ever allowed for a VERIFIED FINANCIAL signal
-- (a verified stripe_charge or signed_loi). manual_note, self_reported-style
-- verbal_commitment, email_reply, and meeting_booked can never carry money.
-- This is enforced by a CHECK constraint below — fake cash is blocked by the
-- database itself, not only by the application.
--
-- Who CAN access this table
-- -------------------------
-- Only the Supabase service-role key (bypassrls). All server-side code uses the
-- service-role admin client (createOptionalSupabaseAdminClient). Per repo
-- convention (0005 / 0006 / 0008 / 0009) we do NOT name service_role in any
-- policy — bypassrls makes such a policy a misleading no-op.
--
-- Who CANNOT access this table
-- -----------------------------
-- The `anon` role and the `authenticated` role are blocked for every operation
-- by the RESTRICTIVE policies below. There is no direct client access, ever.

create table if not exists public.cash_signal_intakes (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null
    constraint cash_signal_intakes_workspace_id_check check (char_length(workspace_id) > 0),
  captured_by_user_id uuid not null,
  signal_id text not null
    constraint cash_signal_intakes_signal_id_check check (char_length(signal_id) > 0),
  packet_id text not null
    constraint cash_signal_intakes_packet_id_check check (char_length(packet_id) > 0),
  venture_id text not null
    constraint cash_signal_intakes_venture_id_check check (char_length(venture_id) > 0),
  source_agent_id text not null
    constraint cash_signal_intakes_source_agent_id_check check (char_length(source_agent_id) > 0),
  signal_type text not null
    constraint cash_signal_intakes_signal_type_check check (
      signal_type in (
        'stripe_charge',
        'signed_loi',
        'email_reply',
        'meeting_booked',
        'verbal_commitment',
        'manual_note'
      )
    ),
  reference_id text not null
    constraint cash_signal_intakes_reference_id_check check (char_length(reference_id) > 0),
  is_verified boolean not null,
  amount_cents bigint null
    constraint cash_signal_intakes_amount_nonneg_check check (amount_cents is null or amount_cents >= 0),
  summary text not null
    constraint cash_signal_intakes_summary_check check (char_length(summary) > 0),
  captured_at timestamptz not null,
  evidence_ref jsonb not null,
  created_at timestamptz not null default now(),

  -- Strict accounting invariant: real money requires verified financial proof.
  -- A positive amount is only valid for a verified stripe_charge or signed_loi.
  constraint cash_signal_intakes_cash_requires_verified_financial_check check (
    amount_cents is null
    or amount_cents = 0
    or (is_verified = true and signal_type in ('stripe_charge', 'signed_loi'))
  )
);

alter table public.cash_signal_intakes enable row level security;

create index if not exists cash_signal_intakes_workspace_id_idx
  on public.cash_signal_intakes(workspace_id);
create index if not exists cash_signal_intakes_workspace_packet_idx
  on public.cash_signal_intakes(workspace_id, packet_id);
create index if not exists cash_signal_intakes_workspace_venture_idx
  on public.cash_signal_intakes(workspace_id, venture_id);
create index if not exists cash_signal_intakes_workspace_created_idx
  on public.cash_signal_intakes(workspace_id, created_at desc);
create index if not exists cash_signal_intakes_created_at_idx
  on public.cash_signal_intakes(created_at desc);

-- RESTRICTIVE block-all policies (mirrors 0005 / 0006 / 0008 / 0009). With RLS
-- enabled and these restrictive policies, anon and authenticated are denied for
-- every operation in addition to any future permissive policy.

-- SELECT ------------------------------------------------------------------
create policy "cash_signal_intakes_block_anon_select"
  on public.cash_signal_intakes
  as restrictive
  for select
  to anon
  using (false);

create policy "cash_signal_intakes_block_authenticated_select"
  on public.cash_signal_intakes
  as restrictive
  for select
  to authenticated
  using (false);

-- INSERT ------------------------------------------------------------------
create policy "cash_signal_intakes_block_anon_insert"
  on public.cash_signal_intakes
  as restrictive
  for insert
  to anon
  with check (false);

create policy "cash_signal_intakes_block_authenticated_insert"
  on public.cash_signal_intakes
  as restrictive
  for insert
  to authenticated
  with check (false);

-- UPDATE ------------------------------------------------------------------
create policy "cash_signal_intakes_block_anon_update"
  on public.cash_signal_intakes
  as restrictive
  for update
  to anon
  using (false)
  with check (false);

create policy "cash_signal_intakes_block_authenticated_update"
  on public.cash_signal_intakes
  as restrictive
  for update
  to authenticated
  using (false)
  with check (false);

-- DELETE ------------------------------------------------------------------
create policy "cash_signal_intakes_block_anon_delete"
  on public.cash_signal_intakes
  as restrictive
  for delete
  to anon
  using (false);

create policy "cash_signal_intakes_block_authenticated_delete"
  on public.cash_signal_intakes
  as restrictive
  for delete
  to authenticated
  using (false);

-- ---------------------------------------------------------------------------
-- Rollback (run manually to fully revert this migration)
-- ---------------------------------------------------------------------------
-- drop policy if exists "cash_signal_intakes_block_anon_select" on public.cash_signal_intakes;
-- drop policy if exists "cash_signal_intakes_block_authenticated_select" on public.cash_signal_intakes;
-- drop policy if exists "cash_signal_intakes_block_anon_insert" on public.cash_signal_intakes;
-- drop policy if exists "cash_signal_intakes_block_authenticated_insert" on public.cash_signal_intakes;
-- drop policy if exists "cash_signal_intakes_block_anon_update" on public.cash_signal_intakes;
-- drop policy if exists "cash_signal_intakes_block_authenticated_update" on public.cash_signal_intakes;
-- drop policy if exists "cash_signal_intakes_block_anon_delete" on public.cash_signal_intakes;
-- drop policy if exists "cash_signal_intakes_block_authenticated_delete" on public.cash_signal_intakes;
-- drop index if exists public.cash_signal_intakes_created_at_idx;
-- drop index if exists public.cash_signal_intakes_workspace_created_idx;
-- drop index if exists public.cash_signal_intakes_workspace_venture_idx;
-- drop index if exists public.cash_signal_intakes_workspace_packet_idx;
-- drop index if exists public.cash_signal_intakes_workspace_id_idx;
-- drop table if exists public.cash_signal_intakes;
