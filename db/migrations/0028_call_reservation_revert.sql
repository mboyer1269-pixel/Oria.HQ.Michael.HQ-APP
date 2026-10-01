-- 0028_call_reservation_revert.sql
-- Drops the USD-cent reservation ledger. Rows still marked emitted_unknown
-- are deleted with the tables. Do not run this while a hold still needs
-- reconciliation unless that loss is accepted in writing.

drop function if exists public.hq_consume_call_attempt(text, text, text, text);
drop function if exists public.hq_mark_call_emitted(text, text, text, text);
drop function if exists public.hq_release_call_attempt(text, text, text, text);
drop function if exists public.hq_reserve_call_attempt(text, text, text, text, text, text, integer, integer);
drop function if exists public.hq_reserve_call_attempt(text, text, text, text, text, text, integer);

drop table if exists public.hq_call_reservation;
drop table if exists public.hq_call_emit_right;
drop table if exists public.hq_call_budget_quote;
drop table if exists public.hq_call_budget_ceiling;
