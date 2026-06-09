-- 0022_action_ledger_hash_chain_phase1_verify.sql — READ-ONLY post-apply check.
-- Source: db/migrations/drafts/action_ledger_hash_chain_verify.sql (Phase 1 part)
--
-- Run AFTER applying 0022_action_ledger_hash_chain_phase1.sql on STAGING and
-- BEFORE the backfill + Phase 2 seal. Every statement is a SELECT; it never
-- writes, alters, or drops anything. Compare each result to its "Expected" note.

-- 1) Chain columns exist ---------------------------------------------------
-- Expected: 4 rows (canonical_version, entry_hash, hmac, prev_hash)
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'action_ledger'
  and column_name in ('prev_hash', 'entry_hash', 'hmac', 'canonical_version')
order by column_name;

-- 2) canonical_version default is present and NOT NULL ---------------------
-- Expected: is_nullable = NO, column_default references 1
select is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'action_ledger'
  and column_name = 'canonical_version';
