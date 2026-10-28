-- Migration 0033: G1b — bind approval decisions to an execution intent and
-- consume them atomically (single use).
-- Prepared only: NOT APPLIED. Alters agent_review_approval_events (0010).
--
-- * workspace_id / intent_id / payload_hash: an approval names its workspace, the exact execution intent
--   and the sha-256 (hex) of the exact payload it was granted for.
-- * status gains 'approved' (a live, consumable approval) and 'consumed'
--   (already used once; never consumable again).
-- * consume_approval_decision(): the ONLY sanctioned UPDATE on this otherwise
--   append-only table. One conditional UPDATE … RETURNING: concurrent callers
--   race on the row lock and at most one gets a row back. Zero rows ⇒ the
--   caller must fail closed.

begin;

alter table public.agent_review_approval_events
  add column if not exists workspace_id text        null,
  add column if not exists intent_id    text        null,
  add column if not exists payload_hash text        null,
  add column if not exists consumed_at  timestamptz null;

alter table public.agent_review_approval_events
  drop constraint if exists chk_arae_status;
alter table public.agent_review_approval_events
  add constraint chk_arae_status check (
    status in ('draft', 'valid_human_decision', 'invalid', 'expired', 'revoked', 'approved', 'consumed')
  );

-- A consumable/consumed approval must be bound to an intent and a payload hash.
alter table public.agent_review_approval_events
  add constraint chk_arae_binding_when_consumable check (
    status not in ('approved', 'consumed')
    or (workspace_id is not null and workspace_id <> ''
        and intent_id is not null and intent_id <> ''
        and payload_hash ~ '^[0-9a-f]{64}$'
        and decision = 'approved' and human_approved = true)
  );
alter table public.agent_review_approval_events
  add constraint chk_arae_consumed_at_coherence check (
    (status = 'consumed') = (consumed_at is not null)
  );

create index if not exists idx_arae_workspace_intent
  on public.agent_review_approval_events(workspace_id, intent_id);

create or replace function public.consume_approval_decision(
  p_workspace_id text,
  p_decision_id  uuid,
  p_intent_id    text,
  p_payload_hash text
)
returns setof public.agent_review_approval_events
language sql
volatile
security invoker
set search_path = public, pg_temp
as $$
  update public.agent_review_approval_events
     set status = 'consumed',
         consumed_at = now()
   where id = p_decision_id
     and workspace_id = p_workspace_id
     and consumed_at is null
     and status = 'approved'
     and decision = 'approved'
     and human_approved = true
     and revoked_at is null
     and expires_at > now()
     and intent_id = p_intent_id
     and payload_hash = p_payload_hash
  returning *;
$$;

revoke all on function public.consume_approval_decision(text, uuid, text, text) from public;
revoke all on function public.consume_approval_decision(text, uuid, text, text) from anon, authenticated;
grant execute on function public.consume_approval_decision(text, uuid, text, text) to service_role;

commit;
