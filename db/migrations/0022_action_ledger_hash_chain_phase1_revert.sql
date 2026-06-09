-- 0022_action_ledger_hash_chain_phase1_revert.sql
-- Source: db/migrations/drafts/action_ledger_hash_chain_01_columns_revert.sql
--
-- Run the Phase 2 revert (0023_..._phase2_revert.sql) FIRST so the trigger is
-- gone and the table is mutable again, THEN this. Dropping the additive chain
-- columns is low-risk PROVIDED no product surface has begun asserting
-- immutability (plan §2.7). STAGING rollback only.

alter table public.action_ledger
  drop column if exists canonical_version,
  drop column if exists hmac,
  drop column if exists entry_hash,
  drop column if exists prev_hash;
