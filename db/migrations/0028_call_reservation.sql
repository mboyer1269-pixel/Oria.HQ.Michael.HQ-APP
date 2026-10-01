-- 0028_call_reservation.sql
--
-- Durable USD-cent reservation for one HQ provider attempt.
-- Qualification / staging only. Do not apply to production without a separate
-- written GO. Applying this file inserts no ceiling, no quote, and does not
-- turn HQ_CALL_RESERVATION on.
--
-- Contract:
--   * Unit is integer USD cents. Routing weights are not stored and are not
--     converted into cents.
--   * A send requires a server ceiling row and a reliable server quote that
--     covers the max tokens of that attempt. The function takes no amount
--     argument. The client cannot name a price or a cap.
--   * One caller wins hq_call_emit_right for (workspace, subject) while the
--     ceiling row is locked. A unique key is not the mutex. Another caller
--     is lost and cannot emit any provider, including a fallback.
--   * Only the winning caller can reserve an already-authorized fallback,
--     and that fallback repeats the quote and ceiling check.
--   * held may be released before the socket. emitted_unknown stays until
--     an explicit consume. There is no expiry column and no TTL release.
--   * Consumed and emitted rows keep reserved_cents. Nothing writes zero.
--   * The ledger caps reserved quotes. It does not cap a provider invoice.
--
-- Revert: 0028_call_reservation_revert.sql
-- Read-only check: 0028_call_reservation_verify.sql

create table if not exists public.hq_call_budget_ceiling (
  workspace_id text primary key,
  currency text not null
    constraint hq_call_budget_ceiling_currency_check
    check (currency = 'USD'),
  max_amount_cents bigint not null
    constraint hq_call_budget_ceiling_amount_check
    check (max_amount_cents >= 0 and max_amount_cents <= 9007199254740991),
  created_at timestamptz not null default now()
);

create table if not exists public.hq_call_budget_quote (
  provider text not null
    constraint hq_call_budget_quote_provider_check
    check (provider in ('anthropic', 'openai')),
  model_id text not null,
  currency text not null
    constraint hq_call_budget_quote_currency_check
    check (currency = 'USD'),
  not_to_exceed_cents bigint not null
    constraint hq_call_budget_quote_amount_check
    check (not_to_exceed_cents > 0 and not_to_exceed_cents <= 9007199254740991),
  covers_max_tokens integer not null
    constraint hq_call_budget_quote_tokens_check
    check (covers_max_tokens > 0),
  reliable boolean not null,
  created_at timestamptz not null default now(),
  primary key (provider, model_id)
);

-- Winner of the right to emit for one call, including its fallbacks.
-- The ceiling lock below is the mutex. This primary key is the backstop.
create table if not exists public.hq_call_emit_right (
  workspace_id text not null,
  subject_id text not null,
  caller_id text not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, subject_id)
);

create table if not exists public.hq_call_reservation (
  workspace_id text not null,
  subject_id text not null,
  provider text not null
    constraint hq_call_reservation_provider_check
    check (provider in ('anthropic', 'openai')),
  caller_id text not null,
  access_class text not null
    constraint hq_call_reservation_access_class_check
    check (access_class = 'api'),
  currency text not null
    constraint hq_call_reservation_currency_check
    check (currency = 'USD'),
  reserved_cents bigint not null
    constraint hq_call_reservation_cents_check
    check (reserved_cents > 0 and reserved_cents <= 9007199254740991),
  state text not null
    constraint hq_call_reservation_state_check
    check (state in ('held', 'released', 'emitted_unknown', 'consumed')),
  reconciliation_required boolean not null default false,
  model_id text not null,
  max_tokens integer not null
    constraint hq_call_reservation_max_tokens_check
    check (max_tokens > 0),
  network_emitted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, subject_id, provider),
  constraint hq_call_reservation_state_flags_check
    check (
      (state = 'held' and network_emitted = false and reconciliation_required = false)
      or (state = 'released' and network_emitted = false and reconciliation_required = false)
      or (state = 'emitted_unknown' and network_emitted = true and reconciliation_required = true)
      or (state = 'consumed' and network_emitted = true and reconciliation_required = false)
    )
);

alter table public.hq_call_budget_ceiling enable row level security;
alter table public.hq_call_budget_quote enable row level security;
alter table public.hq_call_emit_right enable row level security;
alter table public.hq_call_reservation enable row level security;

create index if not exists hq_call_reservation_workspace_state_idx
  on public.hq_call_reservation (workspace_id, state);

create or replace function public.hq_reserve_call_attempt(
  p_workspace_id text,
  p_subject_id text,
  p_caller_id text,
  p_provider text,
  p_model_id text,
  p_access_class text,
  p_max_tokens integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ceiling bigint;
  v_quote bigint;
  v_owner text;
  v_active boolean;
  v_used bigint;
  v_existing public.hq_call_reservation%rowtype;
  v_had_existing boolean := false;
begin
  if p_workspace_id is null or char_length(btrim(p_workspace_id)) not between 1 and 160
     or p_subject_id is null or char_length(btrim(p_subject_id)) not between 1 and 200
     or p_caller_id is null or char_length(btrim(p_caller_id)) not between 1 and 80
     or p_provider is null or p_provider not in ('anthropic', 'openai')
     or p_model_id is null or char_length(btrim(p_model_id)) not between 1 and 160 then
    return jsonb_build_object('status', 'refused', 'reason', 'identity', 'currency', null, 'reservedCents', null);
  end if;

  if p_access_class is distinct from 'api' then
    return jsonb_build_object(
      'status', 'refused',
      'reason', 'access_class',
      'accessClass', p_access_class,
      'currency', null,
      'reservedCents', null
    );
  end if;

  if p_max_tokens is null or p_max_tokens < 1 or p_max_tokens > 200000 then
    return jsonb_build_object('status', 'refused', 'reason', 'estimate_insufficient', 'currency', null, 'reservedCents', null);
  end if;

  select max_amount_cents into v_ceiling
  from public.hq_call_budget_ceiling
  where workspace_id = p_workspace_id
    and currency = 'USD'
  for update;

  if not found then
    return jsonb_build_object('status', 'unavailable', 'reason', 'ceiling_not_configured', 'currency', null, 'reservedCents', null);
  end if;

  select not_to_exceed_cents into v_quote
  from public.hq_call_budget_quote
  where provider = p_provider
    and model_id = p_model_id
    and currency = 'USD'
    and reliable = true
    and covers_max_tokens >= p_max_tokens;

  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'estimate_insufficient', 'currency', null, 'reservedCents', null);
  end if;

  select caller_id into v_owner
  from public.hq_call_emit_right
  where workspace_id = p_workspace_id
    and subject_id = p_subject_id
  for update;

  select exists (
    select 1
    from public.hq_call_reservation
    where workspace_id = p_workspace_id
      and subject_id = p_subject_id
      and state in ('held', 'emitted_unknown', 'consumed')
  ) into v_active;

  if v_owner is not null and v_owner is distinct from p_caller_id and v_active then
    return jsonb_build_object('status', 'lost', 'reason', 'emit_right_held', 'currency', null, 'reservedCents', null);
  end if;

  if v_owner is null then
    insert into public.hq_call_emit_right (workspace_id, subject_id, caller_id)
    values (p_workspace_id, p_subject_id, p_caller_id);
  elsif v_owner is distinct from p_caller_id then
    update public.hq_call_emit_right
    set caller_id = p_caller_id
    where workspace_id = p_workspace_id
      and subject_id = p_subject_id;
  end if;

  select * into v_existing
  from public.hq_call_reservation
  where workspace_id = p_workspace_id
    and subject_id = p_subject_id
    and provider = p_provider
  for update;
  v_had_existing := found;

  if v_had_existing and v_existing.state <> 'released' then
    return jsonb_build_object(
      'status', 'duplicate',
      'currency', 'USD',
      'reservedCents', v_existing.reserved_cents,
      'networkEmitted', v_existing.network_emitted,
      'reconciliationRequired', v_existing.reconciliation_required
    );
  end if;

  select coalesce(sum(reserved_cents), 0) into v_used
  from public.hq_call_reservation
  where workspace_id = p_workspace_id
    and state in ('held', 'emitted_unknown', 'consumed');

  if v_used + v_quote > v_ceiling then
    return jsonb_build_object('status', 'refused', 'reason', 'ceiling_exhausted', 'currency', null, 'reservedCents', null);
  end if;

  if v_had_existing then
    update public.hq_call_reservation
    set caller_id = p_caller_id,
        access_class = 'api',
        currency = 'USD',
        reserved_cents = v_quote,
        state = 'held',
        reconciliation_required = false,
        model_id = p_model_id,
        max_tokens = p_max_tokens,
        network_emitted = false,
        updated_at = now()
    where workspace_id = p_workspace_id
      and subject_id = p_subject_id
      and provider = p_provider;
  else
    insert into public.hq_call_reservation (
      workspace_id, subject_id, provider, caller_id, access_class, currency,
      reserved_cents, state, reconciliation_required, model_id, max_tokens, network_emitted
    ) values (
      p_workspace_id, p_subject_id, p_provider, p_caller_id, 'api', 'USD',
      v_quote, 'held', false, p_model_id, p_max_tokens, false
    );
  end if;

  return jsonb_build_object(
    'status', 'held',
    'currency', 'USD',
    'reservedCents', v_quote,
    'networkEmitted', false,
    'reconciliationRequired', false
  );
end;
$$;

create or replace function public.hq_release_call_attempt(
  p_workspace_id text,
  p_subject_id text,
  p_caller_id text,
  p_provider text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.hq_call_reservation%rowtype;
begin
  select * into v_existing
  from public.hq_call_reservation
  where workspace_id = p_workspace_id
    and subject_id = p_subject_id
    and provider = p_provider
  for update;

  if not found then
    return jsonb_build_object('status', 'unavailable', 'reason', 'not_found', 'currency', null, 'reservedCents', null);
  end if;

  if v_existing.caller_id is distinct from p_caller_id
     or v_existing.network_emitted
     or v_existing.state <> 'held' then
    return jsonb_build_object(
      'status', v_existing.state,
      'reason', 'release_refused',
      'currency', case when v_existing.network_emitted then 'USD' else null end,
      'reservedCents', case when v_existing.network_emitted then v_existing.reserved_cents else null end,
      'networkEmitted', v_existing.network_emitted,
      'reconciliationRequired', v_existing.reconciliation_required
    );
  end if;

  update public.hq_call_reservation
  set state = 'released',
      updated_at = now()
  where workspace_id = p_workspace_id
    and subject_id = p_subject_id
    and provider = p_provider;

  return jsonb_build_object(
    'status', 'released',
    'currency', null,
    'reservedCents', null,
    'networkEmitted', false,
    'reconciliationRequired', false
  );
end;
$$;

create or replace function public.hq_mark_call_emitted(
  p_workspace_id text,
  p_subject_id text,
  p_caller_id text,
  p_provider text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.hq_call_reservation%rowtype;
begin
  select * into v_existing
  from public.hq_call_reservation
  where workspace_id = p_workspace_id
    and subject_id = p_subject_id
    and provider = p_provider
  for update;

  if not found
     or v_existing.caller_id is distinct from p_caller_id
     or v_existing.state <> 'held'
     or v_existing.network_emitted then
    return jsonb_build_object('status', 'refused', 'reason', 'not_held', 'currency', null, 'reservedCents', null);
  end if;

  update public.hq_call_reservation
  set state = 'emitted_unknown',
      network_emitted = true,
      reconciliation_required = true,
      updated_at = now()
  where workspace_id = p_workspace_id
    and subject_id = p_subject_id
    and provider = p_provider;

  return jsonb_build_object(
    'status', 'emitted_unknown',
    'currency', 'USD',
    'reservedCents', v_existing.reserved_cents,
    'networkEmitted', true,
    'reconciliationRequired', true
  );
end;
$$;

create or replace function public.hq_consume_call_attempt(
  p_workspace_id text,
  p_subject_id text,
  p_caller_id text,
  p_provider text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.hq_call_reservation%rowtype;
begin
  select * into v_existing
  from public.hq_call_reservation
  where workspace_id = p_workspace_id
    and subject_id = p_subject_id
    and provider = p_provider
  for update;

  if not found
     or v_existing.caller_id is distinct from p_caller_id
     or v_existing.state <> 'emitted_unknown'
     or not v_existing.network_emitted then
    return jsonb_build_object('status', 'refused', 'reason', 'not_emitted', 'currency', null, 'reservedCents', null);
  end if;

  update public.hq_call_reservation
  set state = 'consumed',
      reconciliation_required = false,
      updated_at = now()
  where workspace_id = p_workspace_id
    and subject_id = p_subject_id
    and provider = p_provider;

  return jsonb_build_object(
    'status', 'consumed',
    'currency', 'USD',
    'reservedCents', v_existing.reserved_cents,
    'networkEmitted', true,
    'reconciliationRequired', false
  );
end;
$$;

revoke all on function public.hq_reserve_call_attempt(text, text, text, text, text, text, integer) from public;
revoke all on function public.hq_release_call_attempt(text, text, text, text) from public;
revoke all on function public.hq_mark_call_emitted(text, text, text, text) from public;
revoke all on function public.hq_consume_call_attempt(text, text, text, text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.hq_reserve_call_attempt(text, text, text, text, text, text, integer) to service_role;
    grant execute on function public.hq_release_call_attempt(text, text, text, text) to service_role;
    grant execute on function public.hq_mark_call_emitted(text, text, text, text) to service_role;
    grant execute on function public.hq_consume_call_attempt(text, text, text, text) to service_role;
  end if;
end
$$;
