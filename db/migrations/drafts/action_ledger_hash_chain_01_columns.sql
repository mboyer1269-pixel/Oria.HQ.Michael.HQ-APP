-- DRAFT — NOT APPLIED. Requires explicit GO.
-- See docs/security/action-ledger-hash-chain-migration-runbook.md and
--     docs/security/action-ledger-hash-chain-plan.md (§2.1).
-- Intended final name at GO: db/migrations/0021_action_ledger_hash_chain_columns.sql
--
-- Phase 1 of the action_ledger hash-chain migration: additive, NULLABLE chain
-- columns only. Safe and reversible on its own and changes NO behavior — rows
-- are not sealed until the writer runs, and the table stays mutable until
-- Phase 2 adds the immutability trigger.
--
-- Apply order (see runbook):
--   01 columns  ->  backfill via the TS writer (genesis + recompute)  ->  02 seal
--
-- This file lives under db/migrations/drafts/ on purpose: it is NOT in the
-- numbered apply sequence and must never be auto-applied. Promote to a numbered
-- migration only at GO.

alter table public.action_ledger
  add column if not exists prev_hash text,
  add column if not exists entry_hash text,
  add column if not exists hmac text,
  add column if not exists canonical_version smallint not null default 1;

comment on column public.action_ledger.prev_hash is
  'Hash-chain (DRAFT/not yet active): entry_hash of the preceding row in the same workspace chain; NULL only for the genesis row.';
comment on column public.action_ledger.entry_hash is
  'Hash-chain (DRAFT/not yet active): sha256(canonical(row) || prev_hash). Recomputed and verified by the TS verifier.';
comment on column public.action_ledger.hmac is
  'Hash-chain (DRAFT/not yet active): hmac_sha256(LEDGER_HMAC_KEY, entry_hash). The key lives only in environment secrets, never in the repo or a migration.';
comment on column public.action_ledger.canonical_version is
  'Hash-chain: version of the canonicalization rules used for entry_hash. Frozen; bumped (never mutated in place) when serialization evolves.';
