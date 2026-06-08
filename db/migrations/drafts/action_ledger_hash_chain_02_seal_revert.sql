-- DRAFT revert for Phase 2 (trigger + fork-prevention indexes). NOT APPLIED
-- without GO.
--
-- Run this BEFORE the Phase 1 columns revert: dropping the trigger restores
-- mutability so the columns can then be dropped.

drop trigger if exists action_ledger_immutable on public.action_ledger;
drop function if exists public.action_ledger_block_mutations();
drop index if exists public.action_ledger_entry_hash_unique;
drop index if exists public.action_ledger_prev_hash_unique;
drop index if exists public.action_ledger_genesis_unique;
