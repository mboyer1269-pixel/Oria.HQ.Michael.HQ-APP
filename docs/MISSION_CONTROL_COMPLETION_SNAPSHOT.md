# Mission Control — Completion Snapshot

Date: 2026-05-21  
Branch: `main` (post-PR #28)  
Author: CEO checkpoint — Michael Boyer

---

## What Was Built (PRs #20–#28)

| PR | Title | Type | Status |
|---|---|---|---|
| #20 | Mission approval record contract | Contract | ✅ merged |
| #21 | Idempotency + rate limit contract | Contract | ✅ merged |
| #22 | Mission persistence schema proposal | Docs | ✅ merged |
| #23 | Dry-run plan endpoint POST /api/missions/plan | API | ✅ merged |
| #24 | Joris dry-run wiring (mission.plan intent) | AI wiring | ✅ merged |
| #25 | Mission resolver extraction | Refactor | ✅ merged |
| #26 | Mission ID normalization (mission_ + msn_) | Fix | ✅ merged |
| #27 | Mission Control status dashboard | UI | ✅ merged |
| #28 | Mission Control operating manual | Docs | ✅ merged |

**9 PRs. All squash-merged. All 4/4 validations passed.**

---

## What Is Safe to Use Now

| Capability | Safe? | Notes |
|---|---|---|
| View mission pipeline at `/hq/missions` | ✅ | Auth-gated, read-only |
| Request dry-run plan via Joris | ✅ | `approvalConfirmed: false` always |
| POST `/api/missions/plan` | ✅ | Dry-run only; 10-gate sequence |
| `resolveMissionFromText()` | ✅ | Pure function, no I/O |
| `buildDryRunMissionExecutionPlan()` | ✅ | Mode `dry_run` only |
| `evaluateMissionApproval()` | ✅ | Read-only evaluation |
| `evaluateMissionTransition()` | ✅ | Read-only state machine |
| `createMissionApprovalRecordDraft()` | ✅ | No I/O — shapes a draft only |
| `verifyMissionApprovalRecord()` | ✅ | Pure function — 7 checks |
| `validateExecutionAttempt()` | ✅ | Pure contract function |
| `checkExecutionAttempt()` + `recordAttempt()` | ✅ (dev) | Local in-memory only |

---

## What Is Blocked

| Capability | Blocked by | Unlock path |
|---|---|---|
| Live executor | Red Team review + all 4 prerequisites | See operating manual §"Why the live executor is locked" |
| Persistence (Supabase) | Migration not applied | CEO sign-off done; migration PR not yet written |
| Idempotency in production | Requires atomic Supabase/Redis insert | Depends on persistence PR |
| `approvalConfirmed: true` from any source | Server-side contract + hardcoded `false` | Requires persisted + verified `MissionApprovalRecord` |
| Joris auto-executing anything | `requiresConfirmation: true` always | Intentional — not a bug |

---

## Immutable Constraints (Still Active)

These constraints apply to every future PR in this repo:

- Never modify secrets, `.env`, API keys, or credentials
- Never modify `db/schema.sql` directly — migrations go in separate files
- Never modify existing API routes without explicit mandate
- Never start live execution without: persisted approval record + Red Team pass
- `approvalConfirmed: true` is server-side only, enforced by `verifyMissionApprovalRecord()`
- `src/server/joris/conversation-repository.ts` remains stashed — do not re-apply
- All merges: squash and merge only
- Every PR: `npm run typecheck` + `npm run lint` + `npm run build` + `npm run smoke:joris`

---

## Architecture Snapshot

```
/hq/missions  (page.tsx)
  ├── MissionSystemStatus      — display only, 5 status badges
  ├── MissionApprovalPanel     — pending approvals
  └── MissionKanbanBoard       — full pipeline

POST /api/missions/plan  (route.ts)
  └── 10-gate sequence
        auth → body → workspace → mission
        → idempotency check → rate limit
        → reserve key ← BEFORE plan generation
        → approvalConfirmed = false (hardcoded)
        → buildDryRunMissionExecutionPlan()

src/server/joris/brain.ts
  └── mission.plan intent
        → resolveMissionFromText()
        → buildDryRunMissionExecutionPlan({ approvalConfirmed: false })
        → requiresConfirmation: true (always)

src/server/missions/
  ├── approval-record.ts       — MissionApprovalRecord contract
  ├── approval-service.ts      — read-only evaluation
  ├── executor-contract.ts     — dry-run plan builder
  ├── execution-attempt-store.ts — local in-memory idempotency
  ├── idempotency-contract.ts  — pure contract functions
  ├── mission-repository.ts    — listMissionsForWorkspace
  ├── mission-resolver.ts      — resolveMissionFromText
  ├── state-machine.ts         — read-only transitions
  └── index.ts                 — public exports
```

---

## CEO Decision: Next Phase

Three options ranked by ROI and risk:

### Option A — Agent Registry + Skills Catalog (recommended)
**What:** Mock registry of agents (Joris, Hermes, future agents) with their capabilities, constraints, and current status. Skills catalog listing what each agent can do.  
**Why now:** Makes HQ genuinely strategic — a CEO can see what agents exist, what they can do, and what's locked. No DB migration required. No live executor risk.  
**Scope:** 2–3 PRs, docs + display components + mock data. Consistent with current sprint rules.

### Option B — Persistence Migration (medium ROI, medium risk)
**What:** Write the Supabase migration files for `missions`, `mission_approval_records`, `mission_execution_attempts`. Apply on staging.  
**Why not yet:** High coordination cost — requires staging environment, migration review, and CEO sign-off before production. Best done after agent registry gives you a reason to persist more than just missions.

### Option C — Red Team Review Pass (low ROI now, required eventually)
**What:** Formal review of all mission safety guardrails before enabling live execution.  
**Why not yet:** Nothing to execute yet. Live executor unlock is the final gate, not the next gate.

---

**Recommended next PR:** PR #29 (this document) → then PR #30 starts Agent Registry.

---

## Reference Docs

- `docs/MISSION_CONTROL_OPERATING_MANUAL.md` — how to use the current system
- `docs/MISSION_PERSISTENCE_SCHEMA_PROPOSAL.md` — DB schema decisions and sign-off
- `docs/ORIA_SKILLS_CATALOG_PROPOSAL.md` — stashed, pending activation mandate
