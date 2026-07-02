-- Migration 0026: durable outbound send store.
--
-- Do NOT apply without an explicit CEO GO.
--
-- Makes the Send Desk store durable, replacing the in-memory globalThis store
-- (src/server/outbound/outbound-send-store.ts) that breaks on serverless: a
-- candidate queued on one function instance is invisible to the instance that
-- handles the send, and idempotency / daily caps / suppression do not survive a
-- cold start. On a platform that sends REAL email to REAL prospects that means
-- double-sends, leaked rate caps, and re-contacting an opt-out.
--
-- Three tables, all service-role-only (RLS + restrictive block-all, mirroring
-- 0013 / 0024 / 0025). No client ever touches them directly.
--
-- Key safety upgrade: idempotency is enforced by a UNIQUE constraint at the DB
-- layer — two instances racing to record the same send cannot both win. Daily
-- send counts are DERIVED from the outcomes ledger (count per workspace +
-- channel + day), so the cap can never drift from reality.

-- 1. Candidates — the durable Send Desk queue --------------------------------
create table if not exists public.outbound_send_candidates (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null
    constraint outbound_send_candidates_workspace_id_check check (char_length(workspace_id) > 0),
  action_id text not null
    constraint outbound_send_candidates_action_id_check check (char_length(action_id) > 0),
  channel_id text not null
    constraint outbound_send_candidates_channel_id_check check (channel_id in ('email', 'sms')),
  recipient text not null
    constraint outbound_send_candidates_recipient_check check (char_length(recipient) > 0),
  recipient_local_hour integer null
    constraint outbound_send_candidates_local_hour_check check (recipient_local_hour between 0 and 23),
  candidate jsonb not null,
  state text not null default 'queued',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outbound_send_candidates_unique_per_workspace unique (workspace_id, action_id)
);

alter table public.outbound_send_candidates enable row level security;

create index if not exists outbound_send_candidates_workspace_idx
  on public.outbound_send_candidates(workspace_id);
create index if not exists outbound_send_candidates_workspace_created_idx
  on public.outbound_send_candidates(workspace_id, created_at desc);

-- 2. Outcomes — the idempotency ledger (also the source of daily counts) ------
create table if not exists public.outbound_send_outcomes (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null
    constraint outbound_send_outcomes_workspace_id_check check (char_length(workspace_id) > 0),
  idempotency_key text not null
    constraint outbound_send_outcomes_idempotency_key_check check (char_length(idempotency_key) > 0),
  action_id text null,
  channel_id text not null
    constraint outbound_send_outcomes_channel_id_check check (channel_id in ('email', 'sms')),
  status text not null
    constraint outbound_send_outcomes_status_check check (status in ('sent', 'failed', 'skipped')),
  provider_message_id text null,
  result jsonb not null,
  sent_on date not null default (now() at time zone 'utc')::date,
  created_at timestamptz not null default now(),
  -- The idempotency guarantee: one outcome per key, enforced by the database.
  constraint outbound_send_outcomes_idempotency_unique unique (idempotency_key)
);

alter table public.outbound_send_outcomes enable row level security;

-- Daily-cap query support: count(*) where workspace_id + channel_id + sent_on.
create index if not exists outbound_send_outcomes_daily_count_idx
  on public.outbound_send_outcomes(workspace_id, channel_id, sent_on);

-- 3. Suppression — cross-channel do-not-contact list -------------------------
create table if not exists public.outbound_suppressions (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null
    constraint outbound_suppressions_workspace_id_check check (char_length(workspace_id) > 0),
  recipient_key text not null
    constraint outbound_suppressions_recipient_key_check check (char_length(recipient_key) > 0),
  reason text not null default '',
  created_at timestamptz not null default now(),
  constraint outbound_suppressions_unique_per_workspace unique (workspace_id, recipient_key)
);

alter table public.outbound_suppressions enable row level security;

create index if not exists outbound_suppressions_workspace_idx
  on public.outbound_suppressions(workspace_id);

-- RLS: service-role-only on all three tables (restrictive block-all) ----------
create policy "outbound_send_candidates_block_anon_all"
  on public.outbound_send_candidates as restrictive for all to anon using (false) with check (false);
create policy "outbound_send_candidates_block_authenticated_all"
  on public.outbound_send_candidates as restrictive for all to authenticated using (false) with check (false);

create policy "outbound_send_outcomes_block_anon_all"
  on public.outbound_send_outcomes as restrictive for all to anon using (false) with check (false);
create policy "outbound_send_outcomes_block_authenticated_all"
  on public.outbound_send_outcomes as restrictive for all to authenticated using (false) with check (false);

create policy "outbound_suppressions_block_anon_all"
  on public.outbound_suppressions as restrictive for all to anon using (false) with check (false);
create policy "outbound_suppressions_block_authenticated_all"
  on public.outbound_suppressions as restrictive for all to authenticated using (false) with check (false);
