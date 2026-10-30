-- DRAFT ONLY — NOT APPLIED. Remove the dormant API, NEVER delete consumed
-- decisions, mission receipts or append-only ledger evidence. Revert G1 separately.
begin;
drop function if exists public.lookup_atelier_execution(text,uuid,text,text,uuid);
drop function if exists public.claim_atelier_execution(text,uuid,text,timestamptz,jsonb,text,uuid,uuid,jsonb);
drop function if exists public.read_atelier_ledger_tail(text);
commit;
