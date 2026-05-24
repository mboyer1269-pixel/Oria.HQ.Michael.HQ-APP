create table if not exists public.missions (
  id text primary key,
  workspace_id text not null,
  mode_id text not null,
  title text not null,
  objective text not null,
  assigned_agent_id text not null,
  autonomy_level integer not null default 0
    constraint missions_autonomy_level_check check (autonomy_level between 0 and 5),
  status text not null default 'draft'
    constraint missions_status_check check (
      status in ('draft', 'queued', 'running', 'needs_approval', 'completed', 'failed', 'cancelled')
    ),
  risk_level text not null default 'low'
    constraint missions_risk_level_check check (risk_level in ('low', 'medium', 'high')),
  requires_approval boolean not null default false,
  cost_budget_cents integer null,
  input jsonb not null default '{}'::jsonb,
  expected_output text not null default '',
  result jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz null
);

alter table public.missions enable row level security;

create index if not exists missions_workspace_id_idx on public.missions(workspace_id);
create index if not exists missions_status_idx on public.missions(status);
