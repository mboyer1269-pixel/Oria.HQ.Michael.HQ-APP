# Live apply runbook — migration 0008 (`governance_decisions`) on `Oria.hq`

> **Procedure document only. Nothing here has been executed.** Applying 0008 to
> live requires an explicit, freshly-stated CEO GO, e.g.
> `GO APPLY 0008 LIVE SUR ORIA.HQ`.

Companion artifacts: [`0008_governance_decisions.sql`](../../db/migrations/0008_governance_decisions.sql) ·
[`_verify.sql`](../../db/migrations/0008_governance_decisions_verify.sql) ·
[`_revert.sql`](../../db/migrations/0008_governance_decisions_revert.sql) ·
[`_VERIFICATION.md`](../../db/migrations/0008_governance_decisions_VERIFICATION.md)

---

## 0. Why this is on the table now

`src/server/joris/brain.ts` calls `recordGovernanceDecision()` on **every**
rendered governance decision. The live table does not exist, so every write
fails. Until V7 Phase 0, that failure was swallowed by a `try/catch` with a
`logger.warn` — decisions looked recorded while nothing was written.

Phase 0 made the failure **visible** (logged at error level, surfaced to the
reviewer). It did not make it **stop**. Two ways to close it:

- **Apply 0008** — decisions persist. This runbook.
- **Remove the call** — no governance audit trail at all.

Strategic note: V7 Phase 1 (shadow mode) measures divergence between an agent's
proposed decision and the CEO's actual one. That comparison needs a durable
history of CEO decisions. Applying 0008 is a **precondition for the learning
loop**, not just a tidy-up.

## 1. Target Supabase — confirmed

- **Single live project: `Oria.hq`.** No Oria staging project exists.
- Configured via `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in
  `.env.local` (not committed). **No secrets are stored in this repo.**
- ⚠️ This machine's `.env.local` already points at the live DB.

## 2. Preconditions (all must hold at apply time)

- [ ] Explicit CEO GO (`GO APPLY 0008 LIVE SUR ORIA.HQ`).
- [ ] PR #352 (V7 Phase 0) merged, so the visible-failure behaviour is on `main`
      before persistence changes underneath it.
- [ ] Read-only confirmation that `governance_decisions` is absent (§4a).
- [ ] Fresh backup / PITR window confirmed (§4b).
- [ ] Conscious acceptance that local `npm run dev` will write governance
      decisions to the live table from then on.

## 3. Operational checklist

1. Read-only target confirmation (project-ref + table absent).
2. Backup / PITR confirmed restorable.
3. Apply `0008_governance_decisions.sql`.
4. Run `0008_governance_decisions_verify.sql`; match every "Expected".
5. GO/NO-GO on the verify result; revert ready if mismatch.
6. Post-apply behaviour check (§4e) — a decision should now persist, and the
   Phase 0 audit-failure notice should stop appearing.

## 4. Exact commands (DO NOT run without the final GO)

### a) Confirm target — read-only, no writes
Preferred via the Supabase MCP: `get_project_url` + `list_tables`
(confirm `governance_decisions` is **not** present). No SQL is executed.

### b) Backup
Dashboard → Database → Backups (PITR), or:
```bash
supabase db dump --db-url "$LIVE_DATABASE_URL" -f backup_pre_0008_$(date +%Y%m%d).sql
```

### c) Apply — **preferred: MCP `apply_migration`**
Auditable and recorded in `supabase_migrations`, matching how 0024/0025 landed.
- MCP: `apply_migration(name: "0008_governance_decisions", query: <contents of db/migrations/0008_governance_decisions.sql>)`
- Fallback (psql):
  ```bash
  psql "$LIVE_DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/0008_governance_decisions.sql
  ```

### d) Verify (read-only)
```bash
psql "$LIVE_DATABASE_URL" -f db/migrations/0008_governance_decisions_verify.sql
```
Expected: table present · RLS enabled · **8** policies, all `RESTRICTIVE`, roles
only `{anon, authenticated}` · **0** permissive policies · **0** policies naming
`service_role` · CHECK constraints for `outcome`, `human_on_the_loop`,
`no_execution_authorized` · 4 indexes + PK · rowcount 0.

### e) Post-apply behaviour check
Render one governance decision through Joris. Expected: it persists, and the
`⚠️ Trace d'audit manquante` notice introduced in Phase 0 no longer appears.
That notice disappearing **is** the acceptance signal.

## 5. Rollback (ready)
```bash
psql "$LIVE_DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/0008_governance_decisions_revert.sql
```
- Idempotent (`drop … if exists`). Low-risk immediately after apply: the table is
  additive and the repository falls back to in-memory when it is absent.
- ⚠️ Once decisions accumulate, the revert **destroys the audit trail**. It is an
  undo for a failed verify, not a routine teardown.
- Ultimate fallback: PITR restore of the §4b backup.

## 6. Risks

- **Persistence switch**: once the table exists, the repository moves from
  in-memory to live persistence of governance decisions. That is the point, and
  it is the real state change.
- **`.env.local` points at live**: local `npm run dev` writes real decisions
  afterward — no "innocent" local governance testing on this path.
- **No induced external action**: this table authorizes nothing. DB-level CHECK
  constraints force `human_on_the_loop = true` and
  `no_execution_authorized = true`, mirroring the TypeScript contract. Applying
  it cannot cause an external effect.
- **Additive apply** (`create table if not exists`): idempotent, low risk.
- **Lower risk than 0024**: 0024 switched a rail that reaches n8n. This table is
  audit-only and touches no execution path.

## 7. GO / NO-GO

**Technically READY**: schema mirrors the TypeScript contract, verify + revert
in place (revert promoted to an executable script in V7 Phase 0), repository
already dual-mode and tested on both paths, CI green.

**GO** only if, at apply time, ALL hold: explicit CEO GO · PR #352 merged ·
backup/PITR confirmed · `verify.sql` matches 100% after apply.

**NO-GO / revert** if: any verify mismatch · fewer or more than 8 policies · any
permissive policy · `service_role` named in a policy · RLS not enabled · any
CHECK constraint absent · backup not confirmed.

## 8. Out of scope of this document
- Applying 0008 to live (or issuing any apply/SQL command).
- Any other Supabase change, enabling remote n8n, or any real external action.
- Any product/code change, or storing secrets.
