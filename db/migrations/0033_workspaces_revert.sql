-- DESTRUCTIVE rollback; requires explicit approval. Revert 0036 first (FK dependency).
begin;
drop table if exists public.workspaces;
commit;
