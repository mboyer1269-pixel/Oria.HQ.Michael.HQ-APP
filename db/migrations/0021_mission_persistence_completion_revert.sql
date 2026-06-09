-- 0021_mission_persistence_completion_revert.sql
-- Source: db/migrations/drafts/mission_persistence_completion_revert.sql
--
-- Drops the additive composite index, then the idempotency store and its
-- indexes. Reversible and low-risk: the objects are additive and nothing in the
-- current behavior depends on them (the durable path is OFF by default).
-- Run on STAGING if the 0021 apply must be undone.

drop index if exists public.missions_workspace_status_idx;

drop index if exists public.mission_execution_attempts_expires_idx;
drop index if exists public.mission_execution_attempts_workspace_time_idx;
drop index if exists public.mission_execution_attempts_key_idx;

drop table if exists public.mission_execution_attempts;
