-- Prepared only: NOT APPLIED. Drops membership and contact workspace data.
begin;
drop table public.workspace_members;
drop index public.contact_leads_workspace_created_idx;
alter table public.contact_leads drop column workspace_id;
commit;
