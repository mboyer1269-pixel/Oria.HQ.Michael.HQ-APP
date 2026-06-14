# Migration plan — document store: `db/documents.json` → Supabase `documents`

**Status:** planned (not implemented). `db/documents.json` is a **dev/test fixture only**.
In production the file store is **fail-closed** (see `src/server/documents/file-document-store-guard.ts`).

## Current state

- `db/documents.json` is a tracked, empty (`[]`) JSON array.
- Runtime read: `src/server/brief/document-index.ts` (`getDocumentBriefSnapshot`,
  consumed by `src/server/brief/ceo-brief-service.ts`). Now guarded: dev/test only.
- Dev write: `src/scripts/process-document.ts` (CLI). Now guarded: dev/test only.
- `src/app/dashboard/documents/page.tsx` no longer reads the file (placeholder module).

## Target table (already in `db/schema.sql`)

`public.documents` exists with RLS (`"documents are private"`) and indexes on
`user_id` and `hat`:

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK, `gen_random_uuid()` |
| `user_id` | `uuid` | FK `auth.users(id)`, RLS scope |
| `filename` | `text` | |
| `hat` | `text` | default `'hq'` |
| `filepath` | `text` | |
| `processed_at` | `timestamptz` | default `now()` |
| `task_id` | `text` | optional |
| `created_at` | `timestamptz` | default `now()` |

The existing `DocumentIndexEntry` (`id`, `filename`, `hat`, `created_at`) is a strict
subset, so the read mapping is direct.

## Strategy (additive, reversible)

1. **Read path first.** Add a Supabase-backed reader behind the existing
   `getDocumentBriefSnapshot` contract: when `hasSupabaseAdminConfig()` is true,
   read from `public.documents` (scoped by owner `user_id`); otherwise use the
   guarded dev/test file fixture. No interface change for callers.
2. **Write path second.** Point `process-document.ts` (or its successor) at the
   `documents` table when configured; keep the guarded file write for local dev.
3. **Backfill (optional).** The prod file is empty, so no data backfill is needed
   in the current state; if a populated fixture exists, insert rows mapping the
   columns above.
4. **No schema change required** — the table and RLS already exist.

## Risks

- **RLS / ownership** — every read/write must be `user_id`-scoped; the file store
  had no ownership concept.
- **Dual-source drift** — while both paths exist, treat the DB as source of truth
  in any env where Supabase is configured.
- **Empty prod data** — the brief will show 0 documents until rows are inserted;
  acceptable and honest.
- **No live writes in tests** — keep the file fixture path for tests; never point
  tests at live Supabase.

## Criteria to remove the JSON runtime

- `document-index.ts` reads exclusively from `public.documents` when Supabase is
  configured; the file path is reached only in dev/test.
- No runtime (non-test) code references `db/documents.json`.
- `process-document.ts` writes to the DB (or is retired) when configured.
- typecheck + `npm test` + build green; `git diff -- db/documents.json` empty.

Once met, `db/documents.json` can be deleted (or moved under a `fixtures/` test
directory) and the guard simplified.
