-- NOT APPLIED. Destructive rollback only after explicit approval and backup.
begin;
drop table if exists public.agent_display_names;
commit;
