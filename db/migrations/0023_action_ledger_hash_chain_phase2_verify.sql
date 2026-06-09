-- 0023_action_ledger_hash_chain_phase2_verify.sql — READ-ONLY post-apply check.
-- Source: db/migrations/drafts/action_ledger_hash_chain_verify.sql (Phase 2 part)
--
-- Run AFTER applying Phase 1 (0022) + backfill + Phase 2 seal (0023) on STAGING.
-- Every statement is a SELECT; it never writes, alters, or drops anything.
-- Compare each result to its "Expected" note. Full GO/rollback procedure:
-- docs/security/action-ledger-hash-chain-migration-runbook.md.

-- 1) Fork-prevention indexes exist -----------------------------------------
-- Expected: action_ledger_entry_hash_unique, action_ledger_genesis_unique,
--           action_ledger_prev_hash_unique
select indexname
from pg_indexes
where schemaname = 'public'
  and tablename = 'action_ledger'
  and indexname like 'action_ledger_%_unique'
order by indexname;

-- 2) Append-only trigger is present ----------------------------------------
-- Expected: one row, action_ledger_immutable, fires_before + on_update + on_delete all true
select tgname,
       (tgtype & 2) = 2 as fires_before,
       (tgtype & 16) = 16 as on_update,
       (tgtype & 8) = 8 as on_delete
from pg_trigger
where tgrelid = 'public.action_ledger'::regclass
  and not tgisinternal
order by tgname;

-- 3) Trigger function exists -----------------------------------------------
-- Expected: 1 row (action_ledger_block_mutations)
select proname
from pg_proc
where proname = 'action_ledger_block_mutations';

-- 4) No genesis fork: at most one NULL prev_hash per workspace --------------
-- Expected: 0 rows (no workspace has more than one genesis row)
select workspace_id, count(*) as genesis_rows
from public.action_ledger
where prev_hash is null
group by workspace_id
having count(*) > 1;

-- 5) Unsealed rows after backfill ------------------------------------------
-- Expected: 0 (every row sealed once backfill + Phase 2 are complete)
select count(*) as unsealed_rows
from public.action_ledger
where entry_hash is null;
