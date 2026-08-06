-- 0027_shadow_proposal_lookup_index_revert.sql
--
-- Drops the index created by 0027_shadow_proposal_lookup_index.sql.
--
-- Low risk in both directions: an index carries no data, so dropping it loses
-- nothing. The query it serves stays correct without it — the read model is
-- bounded by a row cap and an age window precisely so its correctness never
-- depended on this index, only its cost.

drop index if exists public.action_ledger_shadow_proposal_lookup_idx;
