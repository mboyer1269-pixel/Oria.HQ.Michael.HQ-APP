# Arena Verdict Persistence Contract

**Current status:** PR9 — implemented, in review.

---

## Intention

PR9 adds three things to the Arena API established in PR8.2:

1. **Auth/session guard** — all arena routes require an authenticated owner session via `requireOwnerApiSession()`. Unauthenticated callers receive 401; non-owner callers receive 403.
2. **WorkspaceId isolation** — the `workspaceId` on every evaluated candidate is overridden by the server-resolved workspace (`getActiveWorkspaceContext().activeWorkspace.id`). Client-supplied values are never trusted.
3. **Verdict persistence** — evaluated verdicts are persisted to `public.arena_verdicts` via a repository layer that uses the Supabase admin client when configured, or a local Map fallback in test/dev environments without Supabase.

---

## Non-Goals

All non-goals from PR8.2 (`ARENA_API_CONTRACT.md`) remain in force, plus:

- No migration applied without an explicit CEO GO.
- No client-side exposure of the service role key.
- No LLM calls.
- No batch evaluation.
- No pagination.

---

## Architecture

### Auth pattern

```
requireOwnerApiSession()          — src/server/auth/owner.ts
  → getCurrentAuthUser()          — tries Supabase, returns null if env missing
  → if null → NextResponse 401
  → if not owner → NextResponse 403
  → if owner → null (proceed)
```

Routes call this first. If it returns a response, the route returns it immediately. No business logic executes for unauthenticated callers.

### WorkspaceId override

```typescript
const { activeWorkspace } = getActiveWorkspaceContext();
const candidate = { ...parsed.data.candidate, workspaceId: activeWorkspace.id };
```

The client may send any `workspaceId` value; it is always replaced by the server-resolved value before evaluation and persistence.

### Repository layer

`src/server/arena/arena-verdict-repository.ts`

- Marked `server-only`.
- Uses `createOptionalSupabaseAdminClient()` — returns null if Supabase env vars are absent.
- Falls back to an in-process `Map<string, StoredArenaVerdict>` when the client is null.
- Primary key format: `av_${workspaceId}_${candidateId}` (deterministic upsert — re-evaluating the same candidate overwrites the previous verdict).
- Workspace isolation: all reads filter by `workspace_id` (SQL) or key prefix (local fallback).

### Service changes

`createArenaEvaluationService` now accepts an optional `repository` dep:

```typescript
type RepositoryDep = {
  recordArenaVerdict(workspaceId: string, record: StoredArenaVerdict): Promise<void>;
  getArenaVerdictByCandidateId(workspaceId: string, candidateId: string): Promise<StoredArenaVerdict | null>;
  listArenaVerdicts(workspaceId: string): Promise<StoredArenaVerdict[]>;
};
```

- `evaluateAndStore` is now `async` — calls `recordArenaVerdict` after storing in memory.
- `getVerdict(candidateId, workspaceId?)` and `listVerdicts(workspaceId?)` are now `async` — read from repository when `workspaceId` is provided; fall back to in-memory store otherwise.
- `null` repository → pure in-memory (no persistence, no error). Used in tests.

---

## Migration

File: `db/migrations/0003_arena_verdicts.sql`

```sql
create table if not exists public.arena_verdicts (
  id text primary key,
  workspace_id text not null,
  candidate_id text not null,
  verdict jsonb not null,
  stored_at timestamptz not null default now(),
  expires_at timestamptz null,
  created_at timestamptz not null default now()
);

alter table public.arena_verdicts enable row level security;
```

**NOT applied.** Applying this migration requires an explicit CEO GO.

---

## Test coverage

| Test file | Count | Focus |
|---|---|---|
| `arena-verdict-repository.test.mjs` | 9 | Repository CRUD, workspace isolation, upsert, field mapping, module surface |
| `arena-evaluation-service.test.mjs` | 13 | Service methods (async), repository injection, null-repo fallback |
| `arena-api.test.mjs` | 8 | Auth guard — all routes return 401 for unauthenticated callers |
| `arena-verdict-store.test.mjs` | 9 | In-memory store (unchanged) |
| `roi-arena.test.mjs` | — | Engine (unchanged) |

---

## Known Limits

1. **RLS not configured.** The table has RLS enabled but no policies. Policies must be added before production use.
2. **TTL not enforced in DB.** `expires_at` is stored but not used to filter rows. DB-level expiry (pg cron or application-level purge) is out of scope.
   The repository does not purge expired verdicts automatically; there is no scheduler in PR9/PR10.
3. **Local fallback is process-scoped.** The Map is shared across requests within the same process and is cleared on restart. It is test/dev only.
4. **No pagination.** `GET /verdicts` returns all rows for the workspace. Add pagination at PR10+.
5. **No batch endpoint.** Single-candidate evaluation only. Batch at PR10.
6. **Recent-first reads.** PR10 hardens retrieval order with a `stored_at desc` index so recent verdicts stay cheap to list.

---

## What Comes Next

| Item | Target |
|---|---|
| RLS policies for `arena_verdicts` | PR10 |
| Apply migration to Supabase (with CEO GO) | PR10 |
| Batch evaluation endpoint — `POST /api/arena/batch` | PR10 |
| UI/dashboard integration | PR10+ |
| Pagination for `GET /verdicts` | PR10+ |
