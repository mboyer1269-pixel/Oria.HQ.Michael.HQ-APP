# Live apply runbook — migration 0024 (`agent_execution_intents`) on `Oria.hq`

> **Procedure document only.** Nothing here has been executed. Applying 0024 to
> live is a separate operation that requires an explicit, freshly-stated CEO GO,
> e.g. `GO APPLY 0024 LIVE SUR ORIA.HQ`. Until then, the execution-intent rail
> runs on the in-memory local fallback.

Companion of the preflight audit: [`0024-execution-intents-preflight.md`](./0024-execution-intents-preflight.md).

---

## 1. Target Supabase — confirmed

- **Single live project: `Oria.hq`.** It is the only target — no Oria staging
  project exists.
- Configured via `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in
  `.env.local` (not committed; the exact project-ref lives in that URL and is
  held by the CEO). **No secrets are stored in this repo.**
- ⚠️ This machine's `.env.local` already points at the live DB. The first live
  action of the operation is a **read-only** confirmation (project-ref + that
  0024 is absent) — see §4b.

## 2. Preconditions (all must hold at apply time)

- [ ] Explicit CEO GO for this apply (the final `GO APPLY 0024 LIVE SUR ORIA.HQ`).
- [ ] `main` contains #311–#315 (rail, approval UI, rejection, **atomic
  transitions #314**, **preflight #315**) — atomic guard
  (`expectedFromStatus` + conditional `UPDATE … WHERE status = …`) is live in
  `src/server/agents/execution-intent-repository.ts`.
- [ ] Disposable-Postgres smoke replayed green (§4a).
- [ ] Fresh, restorable backup / PITR window confirmed (§4c).
- [ ] Conscious acceptance that the live `agent_execution_intents` table — and
  local `npm run dev` writing to it — is intended from now on.

## 3. Operational checklist

1. Disposable smoke → green.
2. Read-only target confirmation (project-ref + 0024 absent).
3. Backup / PITR confirmed restorable.
4. Apply `0024_agent_execution_intents.sql`.
5. Run `0024_…_verify.sql`; match every "Expected".
6. (Optional) smoke on a disposable clone only — never live.
7. GO/NO-GO on the verify result; rollback ready if mismatch.

## 4. Exact commands (DO NOT run without the final GO)

### a) Disposable rehearsal (throwaway DB only — never live)
```bash
psql "$DISPOSABLE_DATABASE_URL" -v ON_ERROR_STOP=1 -f db/smoke/0024_agent_execution_intents_smoke.sql
```

### b) Confirm target — read-only, no writes
Preferred via the Supabase MCP: `get_project_url` and `list_migrations`
(confirm `0024` is **not** present). Or from the dashboard. No SQL is executed.

### c) Backup
Dashboard → Database → Backups (PITR), or:
```bash
supabase db dump --db-url "$LIVE_DATABASE_URL" -f backup_pre_0024_$(date +%Y%m%d).sql
```

### d) Apply — **preferred: MCP `apply_migration`**
The chosen path for the real apply is the Supabase MCP `apply_migration`
(auditable, recorded in `supabase_migrations`). The exact method is reconfirmed
at the moment of the final GO.
- MCP: `apply_migration(name: "0024_agent_execution_intents", query: <contents of db/migrations/0024_agent_execution_intents.sql>)`
- Fallback (psql):
  ```bash
  psql "$LIVE_DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/0024_agent_execution_intents.sql
  ```

### e) Verify (read-only)
```bash
psql "$LIVE_DATABASE_URL" -f db/migrations/0024_agent_execution_intents_verify.sql
```
Expected: table present · status CHECK (pending/executing/executed/failed) ·
`requires_ceo_approval = true` CHECK · RLS enabled · **8** RESTRICTIVE policies ·
unique `(workspace_id, intent_id)` · 4 indexes.

## 5. Rollback (ready)
```bash
psql "$LIVE_DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/0024_agent_execution_intents_revert.sql
```
- `revert.sql` is idempotent (`drop … if exists`), reversible, low-risk: the
  table is additive and nothing depends on it until applied (in-memory fallback).
- Ultimate fallback: PITR restore of the §4c backup.

## 6. Risks

- **Persistence switch**: once the table exists + a Supabase client is
  configured, the repository moves from in-memory to **live persistence** of
  intents. Expected, but it is the real state change.
- **`.env.local` points at live**: after apply, local `npm run dev` writes to
  the live table — no "innocent" local dev on intents afterward.
- **No Supabase-parity staging**: rehearsal is on raw disposable Postgres (no
  PostgREST / roles); `verify.sql` covers the real RLS/policies post-apply.
- **No induced external action**: the apply triggers nothing; approve fires n8n
  only if `N8N_WEBHOOK_URL` is set (it is not). Concurrency atomicity is covered
  by #314 + the smoke.
- **Additive apply** (`create table if not exists`): low risk, idempotent.

## 7. GO / NO-GO

**Technically READY**: atomic transition code merged, schema audited (exact
parity, RLS, indexes), verify + revert + smoke in place, CI green on `main`.

**GO** only if, at apply time, ALL hold: explicit CEO GO · backup/PITR confirmed ·
disposable smoke green · conscious acceptance of live persistence · `verify.sql`
matches 100% after apply.

**NO-GO / rollback** if: any verify.sql mismatch · unexpected policy/index · RLS
not enabled · status or `requires_ceo_approval` CHECK absent · backup not
confirmed.

---

## 8. Out of scope of this document
- Applying 0024 to live (or issuing any apply/SQL command).
- Touching Supabase live, enabling remote n8n, or any real external action.
- Any product/code/migration change, or storing secrets.
