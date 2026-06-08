-- DRAFT — NOT APPLIED. Requires explicit GO.
-- See docs/security/action-ledger-hash-chain-migration-runbook.md and
--     docs/security/action-ledger-hash-chain-plan.md (§2.3, §2.4).
-- Intended final name at GO: db/migrations/0022_action_ledger_hash_chain_seal.sql
--
-- Phase 2 of the action_ledger hash-chain migration: fork-prevention indexes and
-- the append-only immutability trigger.
--
-- ⛔ APPLY ONLY AFTER Phase 1 columns are live AND the TS writer has backfilled
-- every existing row (genesis + recompute). Reasons:
--   * the unique indexes assume a fully sealed chain (before backfill, every row
--     has NULL prev_hash, which the genesis index would reject as duplicates);
--   * the trigger makes the table append-only, so no further UPDATE — including
--     the backfill UPDATE — is possible once it exists.

-- ── Fork prevention (plan §2.4) ───────────────────────────────────────────────
-- At most one genesis row per workspace chain.
create unique index if not exists action_ledger_genesis_unique
  on public.action_ledger(workspace_id)
  where prev_hash is null;

-- No two rows in a workspace may claim the same predecessor (no fork).
create unique index if not exists action_ledger_prev_hash_unique
  on public.action_ledger(workspace_id, prev_hash)
  where prev_hash is not null;

-- A sealed entry_hash is unique within its workspace chain.
create unique index if not exists action_ledger_entry_hash_unique
  on public.action_ledger(workspace_id, entry_hash)
  where entry_hash is not null;

-- ── Immutability trigger (plan §2.3) ──────────────────────────────────────────
-- Append-only at the database level; defense in depth on top of the future
-- least-privilege ledger_writer role (plan §2.6).
create or replace function public.action_ledger_block_mutations()
  returns trigger
  language plpgsql
as $$
begin
  raise exception
    'action_ledger is append-only: % on ledger row % is not permitted',
    tg_op, coalesce(old.id::text, '(unknown)')
    using errcode = 'restrict_violation';
end;
$$;

create trigger action_ledger_immutable
  before update or delete on public.action_ledger
  for each row
  execute function public.action_ledger_block_mutations();
