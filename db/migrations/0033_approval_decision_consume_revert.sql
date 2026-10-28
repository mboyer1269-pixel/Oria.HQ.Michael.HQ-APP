-- Prepared only: NOT APPLIED. Reverts 0033. Fails if any row uses the new statuses
-- (re-adding the 0010 CHECK would reject them) — resolve those rows first.
begin;
drop function if exists public.consume_approval_decision(text, uuid, text, text);
drop index if exists public.idx_arae_workspace_intent;
alter table public.agent_review_approval_events drop constraint if exists chk_arae_consumed_at_coherence;
alter table public.agent_review_approval_events drop constraint if exists chk_arae_binding_when_consumable;
alter table public.agent_review_approval_events drop constraint if exists chk_arae_status;
alter table public.agent_review_approval_events
  add constraint chk_arae_status check (
    status in ('draft', 'valid_human_decision', 'invalid', 'expired', 'revoked')
  );
alter table public.agent_review_approval_events
  drop column if exists consumed_at,
  drop column if exists payload_hash,
  drop column if exists intent_id,
  drop column if exists workspace_id;
commit;
