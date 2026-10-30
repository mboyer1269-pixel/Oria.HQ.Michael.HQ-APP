-- LOCAL REVIEW ONLY. Removes RPCs, never decisions, intents or ledger rows.
begin;
drop function if exists public.admit_execution_intent_v1(text,uuid,text,uuid,uuid,text,text,jsonb);
drop function if exists public.check_execution_intent_admission_v1(text,uuid,text,uuid,uuid,text,text);
commit;
