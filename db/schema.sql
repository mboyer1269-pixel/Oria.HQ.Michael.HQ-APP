-- Michael HQ initial schema.
-- Apply in Supabase SQL editor after creating the project.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Michael',
  preferred_locale text not null default 'fr-CA',
  call_sign text not null default 'CEO',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.joris_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Conversation Joris',
  hat text not null default 'suivia',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.joris_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.joris_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  model_id text,
  cost_mode text,
  created_at timestamptz not null default now()
);

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  date_iso date not null,
  start_time time not null,
  end_time time not null,
  source text not null default 'internal',
  reminders_minutes integer[] not null default '{15}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.action_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action_type text not null,
  summary text not null,
  autonomy_level integer not null default 0,
  requires_confirmation boolean not null default true,
  model_id text,
  cost_mode text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.joris_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  content text not null,
  confidence numeric not null default 0.5,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.knowledge_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null,
  kind text not null default 'note',
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  hypothesis text not null,
  revenue_score integer not null default 0,
  effort_score integer not null default 0,
  focus_score integer not null default 0,
  risk_score integer not null default 0,
  status text not null default 'backlog',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  filename text not null,
  hat text not null default 'hq',
  filepath text not null,
  processed_at timestamptz not null default now(),
  task_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.contact_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  email text not null check (
    char_length(trim(email)) between 3 and 254
    and email ~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$'
  ),
  phone text check (phone is null or char_length(trim(phone)) between 7 and 40),
  company text check (company is null or char_length(trim(company)) <= 160),
  message text not null check (char_length(trim(message)) between 10 and 4000),
  source text not null default 'suivia-contact-form' check (char_length(trim(source)) between 1 and 80),
  status text not null default 'new' check (status in ('new', 'contacted', 'qualified', 'closed', 'spam')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.joris_conversations enable row level security;
alter table public.joris_messages enable row level security;
alter table public.calendar_events enable row level security;
alter table public.action_ledger enable row level security;
alter table public.joris_memory enable row level security;
alter table public.knowledge_items enable row level security;
alter table public.opportunities enable row level security;
alter table public.documents enable row level security;
alter table public.contact_leads enable row level security;

create index if not exists joris_conversations_user_id_idx on public.joris_conversations(user_id);
create index if not exists joris_messages_conversation_id_idx on public.joris_messages(conversation_id);
create index if not exists joris_messages_user_id_idx on public.joris_messages(user_id);
create index if not exists calendar_events_user_id_idx on public.calendar_events(user_id);
create index if not exists action_ledger_user_id_idx on public.action_ledger(user_id);
create index if not exists joris_memory_user_id_idx on public.joris_memory(user_id);
create index if not exists knowledge_items_user_id_idx on public.knowledge_items(user_id);
create index if not exists opportunities_user_id_idx on public.opportunities(user_id);
create index if not exists documents_user_id_idx on public.documents(user_id);
create index if not exists documents_hat_idx on public.documents(hat);
create index if not exists contact_leads_created_at_idx on public.contact_leads(created_at desc);
create index if not exists contact_leads_status_idx on public.contact_leads(status);

create table if not exists public.api_rate_limit_events (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (char_length(trim(scope)) between 1 and 80),
  bucket_key text not null check (char_length(trim(bucket_key)) between 1 and 200),
  created_at timestamptz not null default now()
);

alter table public.api_rate_limit_events enable row level security;

create index if not exists api_rate_limit_events_scope_bucket_created_at_idx
  on public.api_rate_limit_events(scope, bucket_key, created_at desc);

drop policy if exists "profiles are private" on public.profiles;
drop policy if exists "conversations are private" on public.joris_conversations;
drop policy if exists "messages are private" on public.joris_messages;
drop policy if exists "calendar events are private" on public.calendar_events;
drop policy if exists "action ledger is private" on public.action_ledger;
drop policy if exists "memory is private" on public.joris_memory;
drop policy if exists "knowledge is private" on public.knowledge_items;
drop policy if exists "opportunities are private" on public.opportunities;
drop policy if exists "documents are private" on public.documents;
drop policy if exists "contact leads are private" on public.contact_leads;

create policy "profiles are private" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "conversations are private" on public.joris_conversations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "messages are private" on public.joris_messages
  for all
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.joris_conversations conversation
      where conversation.id = conversation_id
        and conversation.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.joris_conversations conversation
      where conversation.id = conversation_id
        and conversation.user_id = auth.uid()
    )
  );

create policy "calendar events are private" on public.calendar_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "action ledger is private" on public.action_ledger
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "memory is private" on public.joris_memory
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "knowledge is private" on public.knowledge_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "opportunities are private" on public.opportunities
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "documents are private" on public.documents
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- No public contact_leads policy on purpose. Leads are inserted server-side
-- through the Supabase service role and remain unreadable to anon/authenticated clients.

-- No public api_rate_limit_events policy on purpose. Rate-limit events are
-- inserted server-side through the Supabase service role only.
