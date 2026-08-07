-- 0030_pgvector_semantic_memory_verify.sql — READ-ONLY post-apply check.

-- 1) pgvector extension installed
select extname, extversion
from pg_extension
where extname = 'vector';

-- 2) Table exists
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name = 'agent_semantic_memory_embeddings';

-- 3) Partition uniqueness constraint
select conname
from pg_constraint
where conrelid = 'public.agent_semantic_memory_embeddings'::regclass
  and contype = 'u';

-- 4) RLS + block policies
select relrowsecurity as rls_enabled
from pg_class
where oid = 'public.agent_semantic_memory_embeddings'::regclass;

select count(*) as restrictive_policies
from pg_policies
where schemaname = 'public'
  and tablename = 'agent_semantic_memory_embeddings'
  and permissive = 'RESTRICTIVE';

-- 5) Cosine index present
select indexname
from pg_indexes
where schemaname = 'public'
  and tablename = 'agent_semantic_memory_embeddings'
  and indexname = 'agent_semantic_memory_embeddings_embedding_cosine_idx';
