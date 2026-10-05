-- Candidate migration only — NOT applied by this change. Mirrors
-- 0029_account_identities.sql's pattern: a bounded, server-only table with
-- no client policies, enforced by RLS + explicit revoke/grant.
--
-- Holds a single attestation per (workspace_id, provider_id): the result a
-- real OpenHands runner-host SSH probe (runner-executor-connection-probe.ts,
-- unmodified) observed for the claude-code-cli executor account, persisted
-- by an operator-adjacent host (never by HQ's own public server process —
-- see recordRunnerConnectionEvidence's own environment gate) so that HQ's
-- cloud process can consume it as data per an explicit, approved consumption
-- binding (see runner-connection-evidence.ts) instead of attempting the SSH
-- probe itself, which it must never do.
begin;

create table public.provider_connection_evidence (
  workspace_id text not null check (
    char_length(workspace_id) between 1 and 160
    and workspace_id = btrim(workspace_id)
    and workspace_id !~ '[[:cntrl:]]'
  ),
  provider_id text not null check (provider_id ~ '^[a-z][a-z0-9_-]{0,79}$'),
  runner_id text not null check (
    char_length(runner_id) between 1 and 160
    and runner_id = btrim(runner_id)
    and runner_id !~ '[[:cntrl:]]'
  ),
  container text not null check (container ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$'),
  contract_version integer not null check (contract_version = 1),
  -- The canonical launch policy digest (providerProfile.policySha256) in
  -- effect when this row was recorded. Compared against the live digest on
  -- every read, so a changed policy invalidates existing rows on its own.
  policy_sha256 text not null check (policy_sha256 ~ '^[a-f0-9]{64}$'),
  connection_state text not null check (connection_state in ('connected', 'connection_required', 'unknown')),
  source text not null check (source in (
    'env-key-presence', 'oauth-external-marker', 'cli-subscription-login', 'declared-capability', 'exercised-capability'
  )),
  account_id text check (account_id is null or char_length(account_id) between 1 and 160),
  evidence jsonb not null default '[]'::jsonb check (
    jsonb_typeof(evidence) = 'array' and jsonb_array_length(evidence) <= 10
  ),
  required_action text check (required_action is null or char_length(required_action) <= 400),
  checked_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  recorded_by text not null check (char_length(recorded_by) between 1 and 160),
  constraint provider_connection_evidence_pkey primary key (workspace_id, provider_id),
  -- Mirrors recordRunnerConnectionEvidence's own write-time refusal: a
  -- "connected" row must always carry an attested account and an
  -- evidence-grade source, enforced here too in case any other writer is
  -- ever added to this table.
  constraint provider_connection_evidence_connected_needs_account check (
    connection_state <> 'connected' or (account_id is not null and source <> 'declared-capability')
  )
);

alter table public.provider_connection_evidence enable row level security;
alter table public.provider_connection_evidence force row level security;

-- No client policies: only the server's service role may insert, update or read.
revoke all on table public.provider_connection_evidence from public, anon, authenticated, service_role;
grant select, insert, update on table public.provider_connection_evidence to service_role;

commit;
