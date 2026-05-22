-- Sprint B: Agent runs + Signal briefs tables
-- Apply in Supabase SQL editor.

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null default 'michael-hq',
  agent_id text not null,
  status text not null check (status in ('running', 'done', 'failed')),
  trigger text not null check (trigger in ('cron', 'manual', 'event')),
  signals_count integer not null default 0,
  summary text,
  error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists agent_runs_workspace_idx on public.agent_runs(workspace_id);
create index if not exists agent_runs_started_at_idx on public.agent_runs(started_at desc);

create table if not exists public.signal_briefs (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null default 'michael-hq',
  agent_run_id uuid not null references public.agent_runs(id) on delete cascade,
  title text not null,
  content text not null,
  signals_raw jsonb not null default '[]',
  status text not null check (status in ('draft', 'ready', 'sent')) default 'draft',
  created_at timestamptz not null default now()
);

create index if not exists signal_briefs_workspace_idx on public.signal_briefs(workspace_id);
create index if not exists signal_briefs_created_at_idx on public.signal_briefs(created_at desc);

-- RLS: workspace isolation (prep for Sprint C multi-tenancy)
alter table public.agent_runs enable row level security;
alter table public.signal_briefs enable row level security;

-- Service role bypasses RLS — cron routes use service role key
-- Auth users can only read their own workspace's data
create policy "owner read agent_runs" on public.agent_runs
  for select using (
    auth.uid() is not null
    and workspace_id = 'michael-hq'
  );

create policy "owner read signal_briefs" on public.signal_briefs
  for select using (
    auth.uid() is not null
    and workspace_id = 'michael-hq'
  );
