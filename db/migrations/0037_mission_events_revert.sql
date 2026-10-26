-- Revert 0037_mission_events. Prepared only: NOT APPLIED. Destroys history: CEO GO required.
begin;
drop view if exists public.mission_approval_status;
drop table if exists public.mission_events;
drop function if exists public.mission_events_before_insert();
drop function if exists public.mission_events_reject_mutation();
drop function if exists public.mission_capability_lookup(text);
drop table if exists public.mission_capabilities;
commit;
