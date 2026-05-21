# Action Ledger — Mission Traceability Contract

Last updated: 2026-05-21  
Branch: `claude/action-ledger-mission-id-contract`  
Related: `docs/MISSION_CONTROL_RED_TEAM_REVIEW.md` — Risk 4

---

## Why missionId is Required

The Action Ledger is the audit trail for every action Oria takes. Currently it records Joris calendar/brief actions by `action_type` and `summary`, but has no link back to any Mission.

When the Mission Executor runs, every step it takes will create an `ActionLedgerEntry`. Without `missionId`, those entries are orphaned — there is no way to:

- Reconstruct what a mission actually did
- Audit which actions came from which mission
- Correlate failures back to their originating mission
- Answer "what did mission X do?" without a full-text search

**This is Red Team risk 4.** The executor cannot run without this link.

---

## Concept Boundaries

| Concept | Type | What it records | Current state |
|---------|------|-----------------|---------------|
| `Mission` | `src/core/types.ts` | Intent + lifecycle state | Mock data, no persistence |
| `ActionQueueItem` | `src/core/types.ts` | Proposed step for execution | Typed, never instantiated |
| `ActionApproval` | `src/core/types.ts` | Approval decision | Typed, never used |
| `ActionLedgerEntry` | `action-ledger-repository.ts` | Executed action trace | **Live** — Joris writes here |

The intended flow is:
```
Mission (approved)
  → ActionQueueItem[] (one per execution step)
  → each ActionQueueItem checked against PermissionPolicy
  → on execution: ActionLedgerEntry with missionId
```

Without `missionId` on the ledger entry, the last link in this chain is missing.

---

## Current Action Ledger Schema

```sql
create table public.action_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  action_type text not null,
  summary text not null,
  autonomy_level integer not null default 0,
  requires_confirmation boolean not null default true,
  model_id text,
  cost_mode text,
  metadata jsonb not null default '{}',   -- ← mission fields go here
  created_at timestamptz not null default now()
);
```

The `metadata jsonb` column already exists. No schema migration is required to store `missionId` today.

---

## Option A — Dedicated `mission_id` column (future)

```sql
alter table public.action_ledger
  add column mission_id text;

create index action_ledger_mission_id_idx
  on public.action_ledger(mission_id)
  where mission_id is not null;
```

**Pros:** queryable by index, explicit schema contract, foreign key possible  
**Cons:** requires a migration, adds a nullable column to a live table  
**When:** when Mission persistence table exists and `mission_id` needs to be a real FK

---

## Option B — `missionId` in `metadata` jsonb (this PR — recommended now)

Store mission fields inside the existing `metadata` column:

```json
{
  "missionId": "msn_abc123",
  "missionStatus": "running",
  "missionTransition": "queued → running",
  "approvalConfirmed": true
}
```

**Pros:** no migration, available today, backward compatible  
**Cons:** not directly indexable by default (can add a jsonb index later), no FK enforcement  
**When:** now, until the `missions` table is created and PR #N applies the dedicated column migration

---

## TypeScript Contract (this PR)

```ts
// src/server/actions/action-ledger-repository.ts

export type MissionLedgerMetadata = {
  missionId?: string;
  missionStatus?: string;
  missionTransition?: string;
  approvalConfirmed?: boolean;
};

export type RecordActionInput = {
  actionType: string;
  summary: string;
  autonomyLevel: number;
  requiresConfirmation: boolean;
  modelId?: string;
  costMode?: ModelMode;
  metadata?: Json;
  missionId?: string;  // ← merged into metadata.missionId by record()
};
```

A future executor records a mission-linked action:

```ts
await ledger.record({
  actionType: "mission.calendar.book",
  summary: "Booked RDV for mission: CEO Sprint Planning",
  autonomyLevel: 3,
  requiresConfirmation: false,
  missionId: mission.id,            // ← the link
  metadata: {
    missionStatus: "running",
    missionTransition: "queued → running",
    approvalConfirmed: true,
  },
});
```

Existing Joris/calendar callers continue to call `record()` without `missionId` — field is optional, no breaking change.

---

## What Must Exist Before Executor

| Requirement | Status |
|-------------|--------|
| `missionId` field on `RecordActionInput` | ✅ This PR |
| `buildMetadata()` merges it into jsonb | ✅ This PR |
| Mission persistence table in Supabase | ⏳ Future migration (not in this PR) |
| Dedicated `mission_id` column + index | ⏳ After mission table exists |
| Executor calls `record()` with `missionId` | ⏳ PR #18/19 |
| Every mission state transition creates a ledger entry | ⏳ PR #18/19 |

---

## Red Team Risk Tracker

| Risk | Status |
|------|--------|
| 1. Dual `PermissionRule` types | ✅ PR #15 |
| 2. Dual `AutonomyLevel` types | ✅ PR #15 |
| 3. Permission engine not wired to Mission | ✅ Partially — PR #16 Gate 3 |
| 4. Action Ledger has no `missionId` | ✅ Contract in place — PR #17 |
| 5. Joris brain bypasses Mission gate | ⏳ PR #18/19 |
| 6. No idempotency on mission state transitions | ⏳ Future |
