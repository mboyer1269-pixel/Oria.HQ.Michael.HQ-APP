-- Arena verdicts — persists evaluation results per workspace and candidate.
-- PR9. Do NOT apply without an explicit CEO GO.
create table if not exists public.arena_verdicts (
  id text primary key,
  workspace_id text not null
    constraint arena_verdicts_workspace_id_check check (char_length(workspace_id) > 0),
  candidate_id text not null
    constraint arena_verdicts_candidate_id_check check (char_length(candidate_id) > 0),
  verdict jsonb not null,
  stored_at timestamptz not null default now(),
  expires_at timestamptz null,
  created_at timestamptz not null default now()
);

alter table public.arena_verdicts enable row level security;

create index if not exists arena_verdicts_workspace_id_idx on public.arena_verdicts(workspace_id);
create unique index if not exists arena_verdicts_workspace_candidate_idx on public.arena_verdicts(workspace_id, candidate_id);
