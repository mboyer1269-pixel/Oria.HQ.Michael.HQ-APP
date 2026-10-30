-- LOCAL REVIEW DRAFT. No data is removed and original consume0033 is untouched.
-- Applying even this reversal requires a separate database-operation mandate.
begin;
drop function if exists public.create_approval_decision(text,uuid,text,uuid,text,text,jsonb,boolean,text,timestamptz);
drop function if exists public.classify_approval_decision(text,uuid,text,uuid,text);
commit;
