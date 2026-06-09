-- 0021_mission_persistence_completion.sql
-- PROMOTED for STAGING apply (Oria.hq-staging / ref teatqbtzgzcygpefnfbh).
-- Source of truth: db/migrations/drafts/mission_persistence_completion.sql
-- Docs: docs/MISSION_PERSISTENCE_SCHEMA_PROPOSAL.md
--
-- Completes the mission-persistence schema. The `missions` (0001/0005) and
-- `mission_approvals` (0006/0015) tables are already migrated; durable mission
-- DRAFT persistence reuses the existing `missions` table (no new columns). The
-- only un-migrated piece is the idempotency / rate-limit store, plus one
-- additive composite index on `missions`.
--
-- Additive and reversible (see 0021_mission_persistence_completion_revert.sql).
-- Behavior-neutral until code is wired to the new table, which stays behind the
-- OFF-by-default MISSION_DURABLE_DRAFTS flag. Apply on STAGING only; never prod
-- (cpwerynafcszwagroeek) without a separate written GO.

-- ── mission_execution_attempts (proposal Table 3) ─────────────────────────────
-- Persistent backing for src/server/missions/execution-attempt-store.ts
-- (idempotency + rate limit), today an in-memory dev-only store.
create table if not exists public.mission_execution_attempts (
  id              text        primary key,
  idempotency_key text        not null unique,
  mission_id      text        not null references public.missions(id) on delete cascade,
  workspace_id    text        not null,
  mode            text        not null default 'dry_run'
                              constraint mission_execution_attempts_mode_check
                              check (mode in ('dry_run', 'live')),
  first_seen_at   timestamptz not null default now(),
  expires_at      timestamptz not null,
  created_at      timestamptz not null default now()
);

-- RLS enabled with NO permissive policy — mirrors the existing missions table:
-- access is via the service-role client (which bypasses RLS), never anon/auth.
alter table public.mission_execution_attempts enable row level security;

create index if not exists mission_execution_attempts_key_idx
  on public.mission_execution_attempts(idempotency_key);
create index if not exists mission_execution_attempts_workspace_time_idx
  on public.mission_execution_attempts(workspace_id, first_seen_at desc);
create index if not exists mission_execution_attempts_expires_idx
  on public.mission_execution_attempts(expires_at);

-- ── missions composite index (proposal) ───────────────────────────────────────
-- 0001 has separate workspace_id and status indexes; this composite speeds the
-- common "missions for workspace by status" read used by durable draft listing.
create index if not exists missions_workspace_status_idx
  on public.missions(workspace_id, status);
