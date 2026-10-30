-- Review-only revert. Removes v2 functions, never recorded decisions/receipts/ledger.
begin;
drop function if exists public.record_atelier_owner_spec_result_v2(text,uuid,text,uuid,text,jsonb,uuid,jsonb);
drop function if exists public.check_atelier_owner_spec_admission_v2(text,uuid,text,uuid,text);
drop function if exists public.admit_atelier_owner_spec_v2(text,uuid,text,text,uuid,uuid,jsonb);
drop function if exists public.prepare_atelier_owner_spec_v2(text,uuid,text,timestamptz,jsonb,text);
drop function if exists public.owner_spec_ledger_content_v2(jsonb,text,uuid,uuid,uuid,jsonb);
drop function if exists public.append_atelier_owner_spec_ledger_v2(text,jsonb,jsonb);
drop function if exists public.valid_atelier_owner_spec_payload_v2(public.missions,uuid,text);
drop function if exists public.owner_spec_source_v2(public.missions);
commit;
