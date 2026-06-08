# ORIA HQ — A-to-Z Roadmap, Reconciled with Repo Truth (2026-06)

Status: **Reconciliation record. Doc-only.**
Repo: `C:\Users\micha\Dev\Oria.HQ` (canonical — never the OneDrive copy).
Reconciled on: 2026-06-08. Author: roadmap auditor.
Method: GitHub merged-PR state and current repo files were treated as ground
truth; the A-to-Z strategic plan was treated as vision, not execution state.

> This document does NOT replace the A-to-Z plan. It pins the A-to-Z plan against
> what is actually merged so agents stop acting on stale instructions (e.g.
> "start PR #221", which is already merged).

---

## 1. Executive verdict

**The A-to-Z plan is useful as vision, but it is NOT canonical execution state.**
It must be reconciled against repo/PR truth before any agent acts on it. Its PR
numbers, file paths, tooling commands, and "next PR" pointer have drifted from
the real repository and must not be followed literally.

Two things are simultaneously true:

- The plan's **doctrine** is sound and still holds: *Observe → Journal → Approve
  → Persist → Audit → Execute*, autonomy zones, two-gate composition, fail-safe
  defaults, no live execution without an aligned guard and an auditable ledger.
- The plan's **execution pointers are stale**: the work it calls "next" (PR #221)
  is merged, its PR numbering collides with real GitHub PR numbers, and several
  file paths / commands do not exist in this repo.

Agents must read **this** document for current state and **§5/§7** for what to do
next. Use the A-to-Z plan only for direction and phase intent.

---

## 2. Confirmed merged work (GitHub truth)

All four confirmed via `gh pr view`. Dates are GitHub `mergedAt` (UTC).

| PR | GitHub title | Merged | What it actually delivered |
|----|--------------|--------|----------------------------|
| **#221** | `fix(runtime): enforce autonomy hard blocks in execution guard` | 2026-06-05 | Closes the divergence the A-to-Z plan flagged as risk #1. `src/server/runtime/execution-guard.ts` now consults the autonomy gate (`canExecuteAutonomously`) first; a `blocked` tier returns BLOCK before any other check. The "decision-then-action divergence" is fixed. |
| **#227** | `audit: harden action ledger workspace scope` | 2026-06-07 | Migration `db/migrations/0020_action_ledger_workspace_scope.sql`: `workspace_id` backfilled to `michael-hq`, set `NOT NULL`, RLS enabled on `public.action_ledger`, workspace index added. **No** unsupported `app.workspace_id` policy; **no** `using(true)`. Schema hardening only. |
| **#228** | `security: document workspace auth context contract` | 2026-06-07 | `docs/security/workspace-auth-context-contract.md`: documents that workspace context is app-derived (single-owner env identity), service-role bypasses RLS and is server-only, app-level filtering is the current isolation boundary, and full workspace DB RLS is deferred. Doc-only. |
| **#229** | `test(runtime): add execution guard autonomy matrix` | 2026-06-08 | `src/server/runtime/execution-guard-autonomy-matrix.test.mjs`: the full **36-case** autonomy matrix (6 levels × 2 agent known/unknown × 3 action classes green/yellow/unknown) **plus** a cross-check that no `blocked` gate decision becomes `ALLOW` in the guard. File runs **67 tests** (36 matrix + 28 blocked cross-check + 3 structural). Test-only; no source/migration change. |

These map onto the strategic-order items the plan cares about: **#221** = the
execution-guard alignment the plan called "the next PR"; **#229** = the 36-case
matrix the plan attached to that work; **#227/#228** = ledger workspace hardening
and the workspace-auth boundary that gate any future RLS.

---

## 3. Outdated items in the A-to-Z plan (do not follow literally)

1. **"Next PR = #221" is wrong.** PR #221 is **merged** (2026-06-05). No agent
   should "start", "diagnose", or "create" #221. The Section F prompt ("align
   execution-guard / propagate hard-blocks") is **complete**.
2. **The 36-case matrix is already delivered by #229**, expanded to **67 tests**
   in the live file (matrix + the "no blocked → ALLOW" cross-check + structural
   guards). Do not re-create it.
3. **PR numbers in the A-to-Z plan are roadmap labels, not GitHub truth.** The
   plan reuses #221–#271 for its own sequence, but those GitHub numbers are
   already taken by unrelated, real work — e.g. GitHub **#226** = HQ topbar
   language toggle, **#227** = action-ledger hardening, **#228** = workspace auth
   contract, **#229** = autonomy matrix. So the plan's "PR #226 cockpit
   dashboard", "#227 missions draft→confirm", "#228 Joris chat", "#244 ledger
   hash chain", etc. are **labels**. Never translate an A-to-Z number into a
   `gh pr` action.
4. **Wrong/old file paths must not be reused blindly.** Verified mismatches:
   - Guard lives at `src/server/runtime/execution-guard.ts` — **not**
     `src/server/agents/execution-guard.ts`.
   - The gate function is `canExecuteAutonomously()` (in
     `src/server/agents/autonomy-tier.ts`) — **not** `resolveAutonomyTier()`.
   - Migrations live in `db/migrations/*.sql` — **not** `supabase/migrations/*.sql`.
   - Tests are `node:test` files `*.test.mjs` — **not** Jest/Vitest `*.spec.ts`
     under `tests/`.
   - Package manager is **npm** (`npm run typecheck|lint|test`) — **not** `pnpm`.
   - The pinned HEAD `d088e2c` and "#220 maybe-not-merged" guards are stale.
5. **Repo path trap stands.** Canonical repo is `C:\Users\micha\Dev\Oria.HQ`. Any
   `OneDrive\...\Oria.HQ.Michael.HQ-APP` path is a trap and must be refused — this
   part of the plan is still correct and binding.
6. **Stale companion doc to flag (do not edit here):**
   `docs/EXECUTION_PHASE_STATUS.md` still lists "Live mode blocked →
   `LIVE_MODE_NOT_SUPPORTED`" as an invariant. Since the PR3 zone model,
   `LIVE_MODE_NOT_SUPPORTED` is retained only for reference and is no longer
   emitted; green-zone live execution can return ALLOW. That status doc should be
   refreshed in a separate doc-only PR.

---

## 4. Current strategic state (repo truth)

| Capability | State | Evidence |
|---|---|---|
| Autonomy-tier guardrails (fail-safe, unknown=blocked) | ✅ In place | `src/server/agents/autonomy-tier.ts` (`canExecuteAutonomously`) |
| Execution-guard hard-block propagation | ✅ In place | PR #221; `execution-guard.ts` calls the gate first, BLOCK on `blocked` |
| Execution-guard autonomy matrix (36 cases + no-blocked→ALLOW) | ✅ In place | PR #229; `execution-guard-autonomy-matrix.test.mjs` (67 tests) |
| Action-ledger workspace schema hardening | ✅ In place | PR #227; migration `0020` (`workspace_id` NOT NULL, RLS enabled, index) |
| Workspace auth/session context | ✅ Documented (contract only) | PR #228; `docs/security/workspace-auth-context-contract.md` |
| Full workspace **DB** RLS enforcement | ⏸️ **Deferred** | RLS enabled on `action_ledger` but **no workspace policy**; runtime uses service-role (bypasses RLS); deferred per #228 until a real workspace auth/session context exists |
| Hash-chained immutable ledger | ❌ **Not delivered** | No `prev_hash` / `entry_hash` / `hmac` / `ledger_writer` anywhere in `db/` or `src/` (verified by search). The A-to-Z "PR #244" is unbuilt. |
| Live external dispatch / executor | ❌ Not implemented (by design) | `docs/EXECUTION_PHASE_STATUS.md`; no dispatch worker |

Net: the **governance/guard layer is now aligned and tested**; the **ledger
integrity layer (append-only hash chain) and true DB RLS are still open**. Live
execution remains correctly gated.

---

## 5. Real next-PR candidates (top 3, ranked)

Ranked against repo truth, not the A-to-Z numbering.

1. **Ledger pre-dispatch guard** — *already in flight as open **PR #218*** (
   `security(runtime): enforce ledger pre-dispatch sequence for live exec…`,
   branch `claude/security-ledger-pre-dispatch-clean`, OPEN, not draft). Highest
   leverage: it extends the just-merged #221/#229 guard work and is the missing
   runtime safety step before any live execution. Finish/review/land this rather
   than open anything new.
2. **Repo-truth / roadmap audit script** — a read-only diagnostic (git log,
   migrations list, RLS coverage, test count, TODO count) emitting a dated
   `docs/audit/REPO_TRUTH_*.md`. Directly prevents the exact drift this
   reconciliation had to fix. Medium urgency; cheap; doc/script only.
3. **Ledger hash-chain planning / proof doc (NOT a migration)** — a design+proof
   document for append-only + `prev_hash`/`entry_hash`/HMAC + advisory lock +
   immutability trigger. **No SQL, no migration** until explicitly approved. This
   de-risks the eventual 🔴 ledger migration without touching prod.

---

## 6. Stop rules for agents (binding)

No agent may, without an explicit GO from Michael:

- Build SaaS, billing, marketplace, multi-tenant, RAG, a live executor, or a
  hash-chain **migration**.
- Run any production migration.
- Expose a runtime public endpoint.
- Use the service-role client anywhere client-side.
- Create a fake/decorative RLS policy, or any `using(true)` policy.
- Act on an A-to-Z PR number as if it were a GitHub PR.
- Touch any `OneDrive\...\Oria.HQ.Michael.HQ-APP` path. Canonical repo is
  `C:\Users\micha\Dev\Oria.HQ` only.

Defaults remain: finish on a local diff + green checks (typecheck, lint, test),
no commit/push/merge without explicit approval.

---

## 7. Final recommendation — one next PR

**Land PR #218 (ledger pre-dispatch guard) as the single next step.**

Rationale: it is already open and non-draft, it sits exactly on top of the
guard alignment that just merged (#221) and is now matrix-proven (#229), and it
closes the remaining runtime-sequencing gap before any live execution is
contemplated. The repo-truth audit script (candidate #2) and the hash-chain
*planning* doc (candidate #3) are valuable but lower-urgency and can follow once
#218 is reviewed and merged. The hash-chain **migration** stays deferred (🔴, GO
required) — only its planning/proof doc is in scope before approval.

One PR at a time. Review #218 first; do not open parallel runtime work.
