-- 0028_call_reservation_verify.sql — READ-ONLY post-apply check.
-- Expected notes are comments. This file does not insert a ceiling or a quote.

-- Expected: the four ledger tables.
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'hq_call_budget_ceiling',
    'hq_call_budget_quote',
    'hq_call_emit_right',
    'hq_call_reservation'
  )
order by table_name;

-- Expected: 0. No routing weight, no USD-null column, no TTL column.
select count(*) as forbidden_columns
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'hq_call_budget_ceiling',
    'hq_call_budget_quote',
    'hq_call_emit_right',
    'hq_call_reservation'
  )
  and (
    column_name = 'relative_weight'
    or column_name = 'monetary_usd'
    or column_name = 'expires_at'
    or column_name like '%ttl%'
  );

-- Expected: currency constrained to USD, cents strictly positive on a hold.
select conname
from pg_constraint
where conname in (
  'hq_call_budget_ceiling_currency_check',
  'hq_call_budget_quote_currency_check',
  'hq_call_reservation_currency_check',
  'hq_call_reservation_cents_check',
  'hq_call_reservation_state_flags_check',
  'hq_call_budget_quote_scope_check',
  'hq_call_budget_quote_version_check',
  'hq_call_budget_quote_input_check',
  'hq_call_budget_quote_output_check'
)
order by conname;

-- Expected: both rowsecurity values true on every ledger table.
select relname, relrowsecurity
from pg_class
where relname in (
  'hq_call_budget_ceiling',
  'hq_call_budget_quote',
  'hq_call_emit_right',
  'hq_call_reservation'
)
order by relname;

-- Expected: 4 functions. None of them expires a hold.
select proname
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'hq_reserve_call_attempt',
    'hq_release_call_attempt',
    'hq_mark_call_emitted',
    'hq_consume_call_attempt'
  )
order by proname;

-- Expected: 0 and 0. Migration does not seed a ceiling or a quote.
select
  (select count(*) from public.hq_call_budget_ceiling) as ceiling_rows,
  (select count(*) from public.hq_call_budget_quote) as quote_rows;
