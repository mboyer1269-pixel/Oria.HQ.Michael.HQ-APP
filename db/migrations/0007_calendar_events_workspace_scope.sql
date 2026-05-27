alter table public.calendar_events
  add column if not exists workspace_id text;

update public.calendar_events
set workspace_id = 'michael-hq'
where workspace_id is null;

alter table public.calendar_events
  alter column workspace_id set not null;

create index if not exists calendar_events_workspace_user_date_idx
  on public.calendar_events(workspace_id, user_id, date_iso, start_time);
