-- DRAFT revert for Phase 1 (columns). NOT APPLIED without GO.
--
-- Run the Phase 2 revert FIRST (drop the trigger so the table is mutable again),
-- then this. Dropping the additive chain columns is low-risk PROVIDED no product
-- surface has begun asserting immutability (plan §2.7).

alter table public.action_ledger
  drop column if exists canonical_version,
  drop column if exists hmac,
  drop column if exists entry_hash,
  drop column if exists prev_hash;
