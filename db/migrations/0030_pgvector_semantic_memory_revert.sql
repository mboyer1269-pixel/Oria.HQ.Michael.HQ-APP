-- Revert 0030_pgvector_semantic_memory.sql

drop trigger if exists semantic_mem_validate_partition
  on public.agent_semantic_memory_embeddings;
drop trigger if exists agent_semantic_memory_embeddings_validate_partition
  on public.agent_semantic_memory_embeddings;
drop function if exists public.agent_semantic_memory_embeddings_validate_partition();

drop trigger if exists semantic_mem_enforce_partition
  on public.agent_semantic_memory_embeddings;
drop trigger if exists semantic_mem_enforce_workspace
  on public.agent_semantic_memory_embeddings;
drop trigger if exists semantic_mem_sync_partition
  on public.agent_semantic_memory_embeddings;
drop trigger if exists agent_semantic_memory_embeddings_enforce_context_partition_scope
  on public.agent_semantic_memory_embeddings;
drop trigger if exists agent_semantic_memory_embeddings_enforce_workspace_scope
  on public.agent_semantic_memory_embeddings;
drop trigger if exists agent_semantic_memory_embeddings_sync_context_partition
  on public.agent_semantic_memory_embeddings;

drop policy if exists "semantic_mem_block_anon_select"
  on public.agent_semantic_memory_embeddings;
drop policy if exists "semantic_mem_block_auth_select"
  on public.agent_semantic_memory_embeddings;
drop policy if exists "semantic_mem_block_anon_insert"
  on public.agent_semantic_memory_embeddings;
drop policy if exists "semantic_mem_block_auth_insert"
  on public.agent_semantic_memory_embeddings;
drop policy if exists "semantic_mem_block_anon_update"
  on public.agent_semantic_memory_embeddings;
drop policy if exists "semantic_mem_block_auth_update"
  on public.agent_semantic_memory_embeddings;
drop policy if exists "semantic_mem_block_anon_delete"
  on public.agent_semantic_memory_embeddings;
drop policy if exists "semantic_mem_block_auth_delete"
  on public.agent_semantic_memory_embeddings;

drop policy if exists "agent_semantic_memory_embeddings_block_anon_select"
  on public.agent_semantic_memory_embeddings;
drop policy if exists "agent_semantic_memory_embeddings_block_authenticated_select"
  on public.agent_semantic_memory_embeddings;
drop policy if exists "agent_semantic_memory_embeddings_block_anon_insert"
  on public.agent_semantic_memory_embeddings;
drop policy if exists "agent_semantic_memory_embeddings_block_authenticated_insert"
  on public.agent_semantic_memory_embeddings;
drop policy if exists "agent_semantic_memory_embeddings_block_anon_update"
  on public.agent_semantic_memory_embeddings;
drop policy if exists "agent_semantic_memory_embeddings_block_authenticated_update"
  on public.agent_semantic_memory_embeddings;
drop policy if exists "agent_semantic_memory_embeddings_block_anon_delete"
  on public.agent_semantic_memory_embeddings;
drop policy if exists "agent_semantic_memory_embeddings_block_authenticated_delete"
  on public.agent_semantic_memory_embeddings;

drop index if exists public.agent_semantic_memory_embeddings_embedding_cosine_idx;
drop index if exists public.agent_semantic_memory_embeddings_workspace_mode_idx;
drop index if exists public.agent_semantic_memory_embeddings_workspace_partition_idx;

drop table if exists public.agent_semantic_memory_embeddings;

-- Note: we intentionally do NOT drop the vector extension — it may be shared.
