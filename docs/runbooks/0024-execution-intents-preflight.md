# Preflight — `agent_execution_intents` (migration 0024)

Preparation artifact only. **This document does not apply 0024 and nothing here
touches Supabase live.** It records the read-only audit and gives the checklist
for a *future, separate* live migration that requires an explicit CEO GO.

Related code already on `main`: PR #311 (rail), #312 (approval UI), #313
(rejection), #314 (atomic, caller-keyed transitions).

---

## 1. Audit summary (read-only)

### Schema ↔ repository parity — exact
`db/migrations/0024_agent_execution_intents.sql` declares precisely the columns
`AgentExecutionIntentRow` / `AgentExecutionIntentInsert` (`src/server/db/types.ts`)
read and write. Enforced in CI by
`src/server/db/agent-execution-intents-migration.test.mjs`.

| Column | Type (0024) | Notes |
|---|---|---|
| `id` | `uuid` PK default `gen_random_uuid()` | |
| `workspace_id` | `text not null` | non-empty CHECK |
| `created_by_user_id` | `uuid not null` | |
| `intent_id` | `text not null` | non-empty CHECK |
| `agent_id` | `text not null` | non-empty CHECK |
| `skill_id` | `text not null` | non-empty CHECK |
| `tool_name` | `text not null` | non-empty CHECK |
| `autonomy_level` | `integer not null` | CHECK between 0 and 5 |
| `status` | `text not null` | CHECK in pending/executing/executed/failed |
| `payload` | `jsonb not null` | mirrors `AgentExecutionIntentPayload` |
| `action_ref` | `text null` | set on dispatch |
| `failure_code` | `text null` | e.g. `CEO_REJECTED` |
| `requires_ceo_approval` | `boolean not null` | CHECK `= true` (governance lock) |
| `created_at` | `timestamptz` default `now()` | |
| `updated_at` | `timestamptz` default `now()` | |

### Keys & indexes (lookup + atomic UPDATE)
- `unique (workspace_id, intent_id)` — single-row pinpoint for both
  `getAgentExecutionIntent` and the atomic
  `UPDATE … WHERE workspace_id = ? AND intent_id = ? AND status = <expectedFrom>`.
  No extra index is required for the `status` predicate (the unique constraint
  already isolates the row).
- `(workspace_id, status)` — backs `listPendingAgentExecutionIntents`.
- `(workspace_id, created_at desc)` and `(created_at desc)` — ordering.

### RLS — service-role only
RLS enabled + **8 RESTRICTIVE block-all policies** (anon + authenticated ×
select/insert/update/delete, all `using/​with check (false)`). No permissive
read/write. Only the Supabase service-role key (bypassrls) can touch the table,
matching the repository's admin-client design.

---

## 2. Preflight proof artifacts

| Proof | What it covers | How it runs |
|---|---|---|
| `src/server/db/agent-execution-intents-migration.test.mjs` | Schema↔repo parity, column types, status/governance CHECKs, unique key, indexes, RLS block-all | **CI** (`npm test`) — static SQL analysis, no DB |
| `src/server/agents/execution-intent-atomic-transition.test.mjs` (#314) | JS transition guard keys on caller `expectedFromStatus`; stale reject → concurrency error | **CI** (`npm test`) — fake client + in-memory |
| `db/migrations/0024_agent_execution_intents_smoke.sql` | Real-Postgres: apply 0024 → approve-claim (1 row) → stale reject (0 rows, blocked) → reject pending→failed/CEO_REJECTED → pending list excludes non-pending → governance CHECK | **Manual**, disposable Postgres |

Disposable smoke command (throwaway DB only — never live):
```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/0024_agent_execution_intents_smoke.sql
```
The smoke runs inside one transaction and `ROLLBACK`s — it persists nothing and
is repeatable. A non-zero exit means the rail is **not** ready.

---

## 3. Future LIVE migration checklist (separate op, explicit CEO GO required)

> Do **not** run any of this without an explicit CEO mandate. Live target is the
> single `Oria.hq` Supabase DB (no staging project exists).

1. **Backup** — confirm a fresh, restorable backup / PITR window of the live DB.
2. **Disposable rehearsal** — run the smoke above on a throwaway Postgres; it
   must pass clean.
3. **Apply** — apply `db/migrations/0024_agent_execution_intents.sql` to live.
4. **Verify** — run `db/migrations/0024_agent_execution_intents_verify.sql`
   (read-only) and match every "Expected" note: table present, status CHECK,
   `requires_ceo_approval` CHECK, RLS enabled, **8** restrictive policies, unique
   `(workspace_id, intent_id)`, 4 indexes present.
5. **Smoke (optional, isolated)** — only on a disposable clone, never live data.
6. **Rollback ready** — `db/migrations/0024_agent_execution_intents_revert.sql`
   on hand; know the restore path before applying.

### GO / NO-GO
- **GO** only if: backup confirmed · disposable smoke green · CI preflight +
  atomic-transition tests green on the deployed commit · verify.sql matches all
  expectations after apply.
- **NO-GO / rollback** if: verify.sql mismatch · any unexpected policy/index ·
  RLS not enabled · status or `requires_ceo_approval` CHECK absent.

---

## 4. Out of scope (deliberately)
- Applying 0024 to live (or issuing the apply command).
- A full local Supabase stack / a `pg` dependency / a migration runner.
- Any change to 0024, the repository, routes, or the agent registry.
