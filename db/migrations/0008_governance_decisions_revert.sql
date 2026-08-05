-- 0008_governance_decisions_revert.sql
--
-- Drops the restrictive policies, indexes, and the table created by
-- 0008_governance_decisions.sql. Reversible and low-risk while unapplied: the
-- table is additive and the governance decision repository falls back to an
-- in-memory store when it is absent.
--
-- ⚠️ Once 0008 is applied and decisions accumulate, this script DESTROYS the
-- governance audit trail. It exists so an apply can be undone immediately after
-- a failed verify — not as a routine teardown. Take a backup first.
--
-- Mirrors the rollback block commented at the foot of 0008_governance_decisions.sql,
-- promoted here to an executable script so a rollback is a single command rather
-- than a copy-paste under pressure.

drop policy if exists "governance_decisions_block_anon_select" on public.governance_decisions;
drop policy if exists "governance_decisions_block_authenticated_select" on public.governance_decisions;
drop policy if exists "governance_decisions_block_anon_insert" on public.governance_decisions;
drop policy if exists "governance_decisions_block_authenticated_insert" on public.governance_decisions;
drop policy if exists "governance_decisions_block_anon_update" on public.governance_decisions;
drop policy if exists "governance_decisions_block_authenticated_update" on public.governance_decisions;
drop policy if exists "governance_decisions_block_anon_delete" on public.governance_decisions;
drop policy if exists "governance_decisions_block_authenticated_delete" on public.governance_decisions;

drop index if exists public.governance_decisions_created_at_idx;
drop index if exists public.governance_decisions_workspace_decided_idx;
drop index if exists public.governance_decisions_workspace_work_order_idx;
drop index if exists public.governance_decisions_workspace_id_idx;

drop table if exists public.governance_decisions;
