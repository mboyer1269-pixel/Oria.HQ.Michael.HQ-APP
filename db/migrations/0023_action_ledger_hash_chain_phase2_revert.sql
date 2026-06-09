-- 0023_action_ledger_hash_chain_phase2_revert.sql
-- Source: db/migrations/drafts/action_ledger_hash_chain_02_seal_revert.sql
--
-- Run this BEFORE the Phase 1 columns revert (0022_..._phase1_revert.sql):
-- dropping the trigger restores mutability so the columns can then be dropped.
-- STAGING rollback only.

drop trigger if exists action_ledger_immutable on public.action_ledger;
drop function if exists public.action_ledger_block_mutations();
drop index if exists public.action_ledger_entry_hash_unique;
drop index if exists public.action_ledger_prev_hash_unique;
drop index if exists public.action_ledger_genesis_unique;
