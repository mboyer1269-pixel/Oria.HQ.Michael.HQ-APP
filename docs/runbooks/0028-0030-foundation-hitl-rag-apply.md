# Preflight / Apply Runbook — Foundation HITL + RAG (migrations 0028–0030)

Status: **disposable smoke GREEN · live apply BLOCKED pending CEO GO + DB URL**  
Branch: `cursor/foundation-db-rag-af8b`  
Related: Blocs A+C mandate. Bloc B (SSE / Théâtre d'exécution) is **locked** until this runbook's live/staging verify gate is green.

---

## 1. Review findings (post-audit fixes)

| Finding | Severity | Resolution |
|---|---|---|
| `UNIQUE (workspace_id, intent_id)` on approval events blocked CEO re-approve after rate-limit revert | **Critical** | Removed. Multiple append-only proofs per intent are allowed; intent points at the active `approval_event_id`. |
| Smoke applied 0028 before `action_ledger` / `mission_approvals` existed | High | Smoke bootstraps stubs; 0028 skips absent optional tables safely. |
| IVFFlat vector index poor on empty tables | Medium | Switched to **HNSW** cosine ops. |
| PG 63-char identifier truncation on long policy/trigger names | Medium | Shortened to `aei_approval_events_*` / `semantic_mem_*`. |
| No Oria staging Supabase project | Ops | Per `docs/runbooks/0024-execution-intents-preflight.md`: single live project `Oria.hq`. Rehearsal = disposable Postgres only. |

---

## 2. Disposable smoke — GREEN (evidence)

```bash
# Local throwaway cluster used for this rehearsal:
# PostgreSQL 16.14 + pgvector 0.6.0, database oria_smoke
sudo -u postgres psql -d oria_smoke -v ON_ERROR_STOP=1 \
  -f db/smoke/0028_0030_foundation_hitl_rag_smoke.sql
```

**Result:** exit 0 — NOTICE  
`OK: approval proof gate + re-approve + context partition isolation + GUC scope verified`  
followed by `ROLLBACK` (nothing persisted).

Proven:

1. `pending → executing` without proof → rejected  
2. Proof insert + transition → succeeds  
3. Rate-limit retry: second approval event insertable → re-approve succeeds  
4. Vie/Travail partition mismatch → rejected  
5. Same `memory_id` allowed across partitions; duplicate in same partition → rejected  
6. `app.workspace_id` GUC mismatch → `workspace_scope_violation`

---

## 3. Staging / live apply — BLOCKED here

Canonical ops reality (existing runbooks):

> Live target is the single `Oria.hq` Supabase DB (**no staging project exists**).

This Cloud Agent environment has **no** `DATABASE_URL` / Supabase service connection for live apply, and AGENTS.md forbids inventing credentials.

### Apply checklist (CEO must provide GO + connection)

1. Confirm restorable backup / PITR window on `Oria.hq`.
2. Re-run disposable smoke green on the exact commit being applied.
3. Apply **in order** against the CEO-designated DB:
   ```bash
   psql "$LIVE_DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/0028_foundation_context_partition_rls.sql
   psql "$LIVE_DATABASE_URL" -f db/migrations/0028_foundation_context_partition_rls_verify.sql
   psql "$LIVE_DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/0029_execution_intent_approval_proofs.sql
   psql "$LIVE_DATABASE_URL" -f db/migrations/0029_execution_intent_approval_proofs_verify.sql
   psql "$LIVE_DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/0030_pgvector_semantic_memory.sql
   psql "$LIVE_DATABASE_URL" -f db/migrations/0030_pgvector_semantic_memory_verify.sql
   ```
4. Match every verify expectation (RLS on, 8 restrictive policies per new table, proof trigger present, `vector` extension installed, HNSW index present).
5. Keep revert scripts ready:
   - `0028_foundation_context_partition_rls_revert.sql`
   - `0029_execution_intent_approval_proofs_revert.sql`
   - `0030_pgvector_semantic_memory_revert.sql` (reverse order on rollback)

### GO / NO-GO

| Gate | Status |
|---|---|
| Migration SQL reviewed | ✅ |
| Disposable smoke green | ✅ |
| Static CI migration tests | ✅ (run on branch) |
| Live/staging DB URL available to agent | ❌ |
| Explicit CEO GO for live apply | ❌ (required) |
| **Bloc B (SSE) unlocked** | ❌ until live verify green |

---

## 4. Bloc B lock

Do **not** start SSE / Théâtre d'exécution until:

1. This runbook §3 apply+verify completes on the CEO-designated DB, and  
2. Michael issues an explicit Bloc B mandate.

---

## 5. Files

- `db/migrations/0028_foundation_context_partition_rls.sql` (+ verify/revert)
- `db/migrations/0029_execution_intent_approval_proofs.sql` (+ verify/revert)
- `db/migrations/0030_pgvector_semantic_memory.sql` (+ verify/revert)
- `db/smoke/0028_0030_foundation_hitl_rag_smoke.sql`
