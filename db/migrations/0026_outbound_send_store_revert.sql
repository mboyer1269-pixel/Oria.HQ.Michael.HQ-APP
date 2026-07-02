-- 0026_outbound_send_store_revert.sql
--
-- Drops the three durable outbound-store tables (and their policies/indexes via
-- CASCADE on the table drop). Low-risk and additive: until the repository is
-- switched to read from these tables, nothing depends on them — the store runs
-- on the in-memory fallback. Run if the 0026 apply must be undone.

drop table if exists public.outbound_send_candidates cascade;
drop table if exists public.outbound_send_outcomes cascade;
drop table if exists public.outbound_suppressions cascade;
