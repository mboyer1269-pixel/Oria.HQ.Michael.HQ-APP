-- Migration 0018: events — daily.direction.generated type (PR-2).
--
-- No schema change required. The public.events table (migration 0017) uses
-- type TEXT with a non-empty CHECK constraint. It already accepts any non-empty
-- string, including "daily.direction.generated".
--
-- What this migration adds:
--   - A partial index on payload->>'dateIso' for efficient same-day queries.
--     Supabase's jsonb ->> operator enables this without a generated column.
--
-- The application enforces the type whitelist via the EventType Zod enum in
-- src/features/cockpit/events/event-record.ts — not via a DB CHECK constraint.
-- This keeps the DB schema stable while type definitions evolve at the app layer.

create index if not exists events_daily_direction_date_idx
  on public.events ((payload->>'dateIso'))
  where type = 'daily.direction.generated';

-- ---------------------------------------------------------------------------
-- Rollback (run manually to fully revert this migration)
-- ---------------------------------------------------------------------------
-- drop index if exists public.events_daily_direction_date_idx;
