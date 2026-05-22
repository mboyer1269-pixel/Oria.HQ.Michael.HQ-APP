# Mission Persistence Schema Proposal

Last updated: 2026-05-21  
Branch: `claude/mission-persistence-schema-proposal`  
Status: **PROPOSAL — no migration applied, no db/schema.sql modified**

---

## Executive Summary

This document proposes the Supabase schema for three tables required before a live mission
executor can be safely enabled:

1. `missions` — persistent mission state (replaces in-memory seed data)
2. `mission_approval_records` — typed approval decisions (closes the `approvalConfirmed: boolean` risk)
3. `mission_execution_attempts` — idempotency + rate limit enforcement store

**No migration is applied in this PR.** The SQL below is proposal-only. Applying any of these
tables to the Supabase project requires Michael sign-off (see §Sign-off Required).

**`db/schema.sql` is not modified.**

---

## Context: Why These Tables Are Required

From `MISSION_EXECUTOR_READINESS_REVIEW.md`:

| Risk | Blocker for |
|------|-------------|
| §3.1 — `approvalConfirmed` is a free boolean | Live executor, dry-run endpoint with approval |
| §3.3 — No mission persistence | Live executor, any state-writing operation |
| §3.4 — No idempotency key store | Dry-run endpoint, live executor |
| §3.5 — No rate limiting store | Dry-run endpoint, live executor |

The TypeScript contracts for `MissionApprovalRecord` (PR #20) and idempotency (PR #21) are
already in place. These tables are their persistence backing — none of the code in those PRs
reads from or writes to any DB yet.

---

## Table 1 — `missions`

### Purpose

Persistent storage for `Mission` objects (currently seed/in-memory). Required before:
- `mission.status` can be read from real state
- The executor can write `status: "running"` before execution begins
- Concurrent calls can see each other's state

### Proposed SQL

```sql
create table if not exists public.missions (
  id           text        primary key,                           -- e.g. "msn_abc123"
  workspace_id text        not null,
  mode_id      text        not null,
  title        text        not null,
  objective    text        not null,
  assigned_agent_id text   not null,
  autonomy_level integer   not null default 0
                           check (autonomy_level between 0 and 5),
  status       text        not null default 'draft'
                           check (status in (
                             'draft', 'queued', 'running',
                             'needs_approval', 'completed', 'failed', 'cancelled'
                           )),
  risk_level   text        not null default 'low'
                           check (risk_level in ('low', 'medium', 'high')),
  requires_approval boolean not null default false,
  input        jsonb       not null default '{}',
  expected_output text     not null default '',
  cost_budget_cents integer,
  result       jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  completed_at timestamptz
);
```

### RLS Policy

```sql
alter table public.missions enable row level security;

-- Missions are private to the workspace owner.
-- Service role bypasses RLS for executor writes.
drop policy if exists "missions are private" on public.missions;
create policy "missions are private" on public.missions
  for all
  using  (auth.uid()::text = workspace_id)
  with check (auth.uid()::text = workspace_id);
```

**Note:** `workspace_id` in the current seed is `"michael-hq"` (a string, not a UUID).
Before applying, confirm whether `workspace_id` should reference `auth.users.id` (UUID)
or remain a workspace slug string. **Sign-off required — see §Sign-off Required #1.**

### Indexes

```sql
create index if not exists missions_workspace_id_idx    on public.missions(workspace_id);
create index if not exists missions_status_idx          on public.missions(status);
create index if not exists missions_workspace_status_idx on public.missions(workspace_id, status);
```

### Relation to `action_ledger`

`action_ledger.metadata.missionId` (text, inside jsonb) references `missions.id` by convention.
No FK constraint is added — the ledger's `metadata` column is untyped jsonb and the relation
is traceability-only. A future GIN index on `metadata->>'missionId'` can support audit queries.

```sql
-- Optional future index for mission audit queries:
-- create index if not exists action_ledger_mission_id_idx
--   on public.action_ledger ((metadata->>'missionId'));
```

---

## Table 2 — `mission_approval_records`

### Purpose

Persistent backing for `MissionApprovalRecord` (defined in `src/server/missions/approval-record.ts`,
merged in PR #20). Closes the `approvalConfirmed: boolean` weakness: the live executor reads
from this table and verifies via `verifyMissionApprovalRecord()` before setting
`approvalConfirmed: true` internally.

### Proposed SQL

```sql
create table if not exists public.mission_approval_records (
  id              text        primary key,                        -- e.g. "apr_abc123"
  mission_id      text        not null references public.missions(id) on delete cascade,
  status          text        not null default 'pending'
                              check (status in (
                                'pending', 'approved', 'rejected',
                                'changes_requested', 'expired'
                              )),
  approval_scope  text[]      not null default '{}',             -- e.g. '{transition_to_running}'
  approved_by     text,                                           -- auth.users.id of the owner
  approved_at     timestamptz,
  expires_at      timestamptz,
  reason          text,
  created_at      timestamptz not null default now()
);
```

### RLS Policy

```sql
alter table public.mission_approval_records enable row level security;

drop policy if exists "approval records are private" on public.mission_approval_records;
create policy "approval records are private" on public.mission_approval_records
  for all
  using (
    exists (
      select 1 from public.missions m
      where m.id = mission_id
        and auth.uid()::text = m.workspace_id
    )
  )
  with check (
    exists (
      select 1 from public.missions m
      where m.id = mission_id
        and auth.uid()::text = m.workspace_id
    )
  );
```

**Note:** The same `workspace_id` UUID vs. slug question applies here (inherited via FK).
**Sign-off required — see §Sign-off Required #1.**

### Indexes

```sql
create index if not exists mission_approval_records_mission_id_idx
  on public.mission_approval_records(mission_id);

create index if not exists mission_approval_records_status_idx
  on public.mission_approval_records(status);

-- Fast lookup: "latest approved non-expired record for a mission"
create index if not exists mission_approval_records_lookup_idx
  on public.mission_approval_records(mission_id, status, expires_at desc nulls last);
```

---

## Table 3 — `mission_execution_attempts`

### Purpose

Persistent backing for the idempotency + rate limit enforcement from
`src/server/missions/idempotency-contract.ts` (merged in PR #21).

The dry-run endpoint (PR #19D) and live executor (PR #21 in the roadmap) must:
1. Look up the idempotency key here before processing
2. Count recent attempts per workspace for rate limiting
3. Insert a new row after a valid attempt

### Proposed SQL

```sql
create table if not exists public.mission_execution_attempts (
  id                text        primary key,                     -- e.g. "att_abc123"
  idempotency_key   text        not null unique,                 -- e.g. "michael-hq:msn_1:req_abc"
  mission_id        text        not null references public.missions(id) on delete cascade,
  workspace_id      text        not null,
  mode              text        not null default 'dry_run'
                                check (mode in ('dry_run', 'live')),
  first_seen_at     timestamptz not null default now(),
  expires_at        timestamptz not null,                        -- idempotency TTL
  created_at        timestamptz not null default now()
);
```

### RLS Policy

```sql
alter table public.mission_execution_attempts enable row level security;

drop policy if exists "execution attempts are private" on public.mission_execution_attempts;
create policy "execution attempts are private" on public.mission_execution_attempts
  for all
  using  (auth.uid()::text = workspace_id)
  with check (auth.uid()::text = workspace_id);
```

### Indexes

```sql
-- Primary idempotency lookup
create index if not exists mission_execution_attempts_key_idx
  on public.mission_execution_attempts(idempotency_key);

-- Rate limit query: count recent attempts per workspace in rolling window
create index if not exists mission_execution_attempts_workspace_time_idx
  on public.mission_execution_attempts(workspace_id, first_seen_at desc);

-- Cleanup expired rows
create index if not exists mission_execution_attempts_expires_idx
  on public.mission_execution_attempts(expires_at);
```

### Cleanup Strategy

Expired rows accumulate. Options (choose one — **sign-off required**):

| Option | Mechanism | Notes |
|--------|-----------|-------|
| A | Supabase scheduled function (pg_cron) | Clean up where `expires_at < now()` |
| B | Application-side cleanup on insert | Cheap but only runs when traffic exists |
| C | Retention policy on Supabase (pg_partman) | Complex, overkill at current scale |

**Recommendation:** Option A — a nightly `pg_cron` job deleting rows with `expires_at < now() - interval '1 day'`. Requires Michael to confirm `pg_cron` is available on the Supabase plan.

---

## Migration Phases

| Phase | Tables | Trigger | Risk |
|-------|--------|---------|------|
| **Phase 0 (now)** | None — seed data only | — | None |
| **Phase 1** | `missions` only | After Michael sign-off on schema + RLS | Low — read-only first |
| **Phase 2** | `mission_approval_records` | After Phase 1 live + tested | Low |
| **Phase 3** | `mission_execution_attempts` | Before dry-run endpoint (PR #19D) | Low |
| **Phase 4** | Live executor writes to all 3 tables | After third Red Team pass (PR #21 in roadmap) | Medium |

**Phase 1 can proceed independently.** It only requires that the `missions` table exists —
the seed loader can then populate it, and reads can switch from in-memory to Supabase.

---

## Relation Diagram

```
auth.users
  │
  └── missions (workspace_id → auth.uid(), or workspace slug — sign-off needed)
        │
        ├── mission_approval_records (mission_id → missions.id)
        │
        └── mission_execution_attempts (mission_id → missions.id)
              │
              └── [soft reference] action_ledger.metadata.missionId
```

---

## Sign-off Required (Michael)

| # | Question | Impact if wrong |
|---|----------|----------------|
| **1** | `workspace_id` — store as `auth.users.id` (UUID) or workspace slug (text like `"michael-hq"`)? | Affects FK constraint and RLS policy on all 3 tables |
| **2** | `missions.id` — keep as text (`"msn_abc123"`) or migrate to UUID (`gen_random_uuid()`)? | Affects FK in approval records and attempts tables |
| **3** | Cleanup for `mission_execution_attempts`: pg_cron (Option A), app-side (B), or other? | Determines how expired rows are removed |
| **4** | Apply migrations as: single script to `db/schema.sql`, or separate migration files? | Affects how future devs replay the schema |
| **5** | Should `mission_approval_records` have a unique constraint on `(mission_id, status = 'approved')`? | Prevents two concurrent approvals for the same mission |
| **6** | Phase 1 migration timing — apply now, or hold until PR #19D dry-run endpoint is ready? | Earlier = more test coverage; later = less risk during sprint |

---

## What This PR Does NOT Do

- No modification to `db/schema.sql`
- No Supabase migration applied
- No repository implementation (future PR after sign-off)
- No route API, no UI, no Joris wiring, no executor changes
- No new TypeScript dependencies

---

## Validation

- `npm run typecheck` ✅
- `npm run lint` ✅
- `npm run build` ✅
- `npm run smoke:joris` ✅

This PR adds only a documentation file. No TypeScript is modified.
