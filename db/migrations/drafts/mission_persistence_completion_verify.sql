-- Verification for the mission-persistence migration draft. READ-ONLY.
--
-- Run AFTER applying the (promoted) mission_persistence_completion migration.
-- Every statement is a SELECT; it never writes, alters, or drops anything.
-- Compare each result to its "Expected" note.

-- 1) mission_execution_attempts table exists -------------------------------
-- Expected: table_exists = true
select to_regclass('public.mission_execution_attempts') is not null as table_exists;

-- 2) Expected columns present ----------------------------------------------
-- Expected: 8 rows (created_at, expires_at, first_seen_at, id, idempotency_key,
--           mission_id, mode, workspace_id)
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'mission_execution_attempts'
order by column_name;

-- 3) Row Level Security enabled --------------------------------------------
-- Expected: rls_enabled = true
select relrowsecurity as rls_enabled
from pg_class
where oid = 'public.mission_execution_attempts'::regclass;

-- 3b) No PERMISSIVE (open) policy on the table -----------------------------
-- Expected: permissive_open_policies = 0 (service-role access only)
select count(*) as permissive_open_policies
from pg_policies
where schemaname = 'public'
  and tablename = 'mission_execution_attempts'
  and permissive = 'PERMISSIVE';

-- 4) mode CHECK constraint -------------------------------------------------
-- Expected: one row whose definition restricts mode to ('dry_run','live')
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.mission_execution_attempts'::regclass and contype = 'c'
order by conname;

-- 5) FK to missions --------------------------------------------------------
-- Expected: one foreign key on mission_id referencing public.missions
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.mission_execution_attempts'::regclass and contype = 'f'
order by conname;

-- 6) Indexes (attempts store + missions composite) -------------------------
-- Expected: mission_execution_attempts_expires_idx,
--           mission_execution_attempts_key_idx,
--           mission_execution_attempts_workspace_time_idx
select indexname
from pg_indexes
where schemaname = 'public' and tablename = 'mission_execution_attempts'
order by indexname;

-- Expected: includes missions_workspace_status_idx
select indexname
from pg_indexes
where schemaname = 'public' and tablename = 'missions'
  and indexname = 'missions_workspace_status_idx';
