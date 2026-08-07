-- Migration 0030: pgvector semantic memory with Vie/Travail partition isolation.
--
-- Do NOT apply without an explicit CEO GO.
--
-- Enables pgvector and creates agent_semantic_memory_embeddings — the durable
-- RAG store for agent semantic recall. Every row is scoped by workspace_id AND
-- context_partition (personal | work) so Vie and Travail memories never mix.
--
-- Access: service-role only (RESTRICTIVE block-all for anon/authenticated).
-- Application code MUST filter reads/writes by workspace_id + context_partition.

create extension if not exists vector;

create table if not exists public.agent_semantic_memory_embeddings (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null
    constraint agent_semantic_memory_embeddings_workspace_id_check
      check (char_length(workspace_id) > 0),
  mode_id text not null
    constraint agent_semantic_memory_embeddings_mode_id_check
      check (char_length(mode_id) > 0),
  context_partition text not null
    constraint agent_semantic_memory_embeddings_context_partition_check
      check (context_partition in ('personal', 'work')),
  memory_id text not null
    constraint agent_semantic_memory_embeddings_memory_id_check
      check (char_length(memory_id) > 0),
  content_hash text not null
    constraint agent_semantic_memory_embeddings_content_hash_check
      check (content_hash ~ '^[0-9a-f]{64}$'),
  content_preview text not null
    constraint agent_semantic_memory_embeddings_content_preview_check
      check (char_length(content_preview) between 1 and 500),
  embedding vector(1536) not null,
  dimensions smallint not null default 1536
    constraint agent_semantic_memory_embeddings_dimensions_check
      check (dimensions = 1536),
  trust_level text not null default 'verified'
    constraint agent_semantic_memory_embeddings_trust_level_check
      check (trust_level in ('verified', 'proposed', 'draft')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint agent_semantic_memory_embeddings_unique_per_partition
    unique (workspace_id, context_partition, memory_id)
);

alter table public.agent_semantic_memory_embeddings enable row level security;

create index if not exists agent_semantic_memory_embeddings_workspace_partition_idx
  on public.agent_semantic_memory_embeddings(workspace_id, context_partition, updated_at desc);

create index if not exists agent_semantic_memory_embeddings_workspace_mode_idx
  on public.agent_semantic_memory_embeddings(workspace_id, mode_id);

-- IVFFlat index for cosine similarity (requires rows to exist before optimal lists;
-- safe to create empty — Postgres builds on first use after ANALYZE).
create index if not exists agent_semantic_memory_embeddings_embedding_cosine_idx
  on public.agent_semantic_memory_embeddings
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- RESTRICTIVE block-all (service-role only).
create policy "agent_semantic_memory_embeddings_block_anon_select"
  on public.agent_semantic_memory_embeddings as restrictive for select to anon using (false);
create policy "agent_semantic_memory_embeddings_block_authenticated_select"
  on public.agent_semantic_memory_embeddings as restrictive for select to authenticated using (false);
create policy "agent_semantic_memory_embeddings_block_anon_insert"
  on public.agent_semantic_memory_embeddings as restrictive for insert to anon with check (false);
create policy "agent_semantic_memory_embeddings_block_authenticated_insert"
  on public.agent_semantic_memory_embeddings as restrictive for insert to authenticated with check (false);
create policy "agent_semantic_memory_embeddings_block_anon_update"
  on public.agent_semantic_memory_embeddings as restrictive for update to anon using (false) with check (false);
create policy "agent_semantic_memory_embeddings_block_authenticated_update"
  on public.agent_semantic_memory_embeddings as restrictive for update to authenticated using (false) with check (false);
create policy "agent_semantic_memory_embeddings_block_anon_delete"
  on public.agent_semantic_memory_embeddings as restrictive for delete to anon using (false);
create policy "agent_semantic_memory_embeddings_block_authenticated_delete"
  on public.agent_semantic_memory_embeddings as restrictive for delete to authenticated using (false);

drop trigger if exists agent_semantic_memory_embeddings_sync_context_partition
  on public.agent_semantic_memory_embeddings;
create trigger agent_semantic_memory_embeddings_sync_context_partition
  before insert or update of mode_id, context_partition on public.agent_semantic_memory_embeddings
  for each row
  execute function public.sync_context_partition_from_mode();

drop trigger if exists agent_semantic_memory_embeddings_enforce_workspace_scope
  on public.agent_semantic_memory_embeddings;
create trigger agent_semantic_memory_embeddings_enforce_workspace_scope
  before insert or update of workspace_id on public.agent_semantic_memory_embeddings
  for each row
  execute function public.enforce_workspace_scope();

drop trigger if exists agent_semantic_memory_embeddings_enforce_context_partition_scope
  on public.agent_semantic_memory_embeddings;
create trigger agent_semantic_memory_embeddings_enforce_context_partition_scope
  before insert or update of context_partition on public.agent_semantic_memory_embeddings
  for each row
  execute function public.enforce_context_partition_scope();

-- Cross-partition contamination guard: a row's mode_id must resolve to its partition.
create or replace function public.agent_semantic_memory_embeddings_validate_partition()
returns trigger
language plpgsql
as $$
begin
  if public.resolve_context_partition(new.mode_id) is distinct from new.context_partition then
    raise exception
      'semantic_memory_partition_mismatch: mode_id % resolves to %, row has %',
      new.mode_id,
      public.resolve_context_partition(new.mode_id),
      new.context_partition
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists agent_semantic_memory_embeddings_validate_partition
  on public.agent_semantic_memory_embeddings;
create trigger agent_semantic_memory_embeddings_validate_partition
  before insert or update on public.agent_semantic_memory_embeddings
  for each row
  execute function public.agent_semantic_memory_embeddings_validate_partition();
