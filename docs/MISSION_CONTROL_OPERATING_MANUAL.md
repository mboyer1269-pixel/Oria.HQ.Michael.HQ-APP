# Mission Control Operating Manual

Last updated: 2026-05-27  
Branch at time of writing: `main` at `4af014c` (post-PR #96)

> **Canonical inventory:** `docs/ORIA_HQ_CURRENT_STATE.md` — calendar ledger (#88–#90), Operator Snapshot (#92), Ledger Activity (#94–#95), Joris Mission Draft gate (#96).

---

## What Mission Control Is

Mission Control (`/hq/missions`) is the human oversight layer for all agent work in Oria HQ.

**Core contract:** no autonomous action executes without an explicit human approval. Every mission goes through a visible pipeline with mandatory checkpoints before anything runs. The live executor is permanently locked until all safety guardrails pass a Red Team review.

---

## Current System State

| Component | Status | Detail |
|---|---|---|
| Joris planning | ✅ enabled | Dry-run only — produces a plan, never executes |
| Live executor | 🔴 locked | Requires Red Team pass before activation |
| Approval records | 🟡 partial | Contract defined (`MissionApprovalRecord`); persistence not yet wired |
| Mission persistence | 🟡 partial | Read path exists, but no mission write path is implemented yet; schema proposed in `docs/MISSION_PERSISTENCE_SCHEMA_PROPOSAL.md`, migration not applied |
| Idempotency / rate limit | 🟡 partial | Local in-memory store only; production requires Supabase/Redis |

---

## How to Request a Dry-Run Plan via Joris

Ask Joris in natural language to plan a mission. Joris detects planning intent when your message contains:

- a mission ID (`mission_…` or `msn_…`)
- or a known mission title
- plus a planning signal word: `plan`, `planifie`, `prépare`, `schedule`, `dry-run`, `exécute`, `lance`, `run`

**Examples:**

```
planifie mission_ceo_brief_2026_05_21
plan msn_abc123 for today
prépare le CEO Brief du jour
```

**What Joris does:**

1. Detects `mission.plan` intent
2. Resolves the mission from your message (ID match → exact title → fuzzy substring)
3. Calls `buildDryRunMissionExecutionPlan()` with `approvalConfirmed: false`
4. Returns the plan with `requiresConfirmation: true` — you must explicitly approve before anything proceeds

`approvalConfirmed` is **always `false`** in Joris responses. It can only be set `true` server-side via a verified `MissionApprovalRecord`.

---

## How to Book Calendar via Joris (Mission Draft Gate, #96)

Actionable calendar booking is **not** immediate. Joris requires a **proposal** then an **explicit human confirm** before `calendar.book` runs.

| Step | You send | Joris returns |
| --- | --- | --- |
| 1 | Natural-language booking (e.g. « Book RDV demain 10h00 ») | `intent: mission.draft`, structured Mission Draft preview, `requiresConfirmation: true` — **no** calendar event |
| 2 | Short confirm (`confirme`, `oui`, `go`) or cancel (`annule`) | On confirm: local mission draft (`status: draft`) + `calendar.book` with `missionId` on ledger decision/action |

**Pending draft rules:**

- One pending draft per `workspaceId` + `userId`; TTL **10 minutes**.
- Confirm/cancel words apply only when a non-expired pending draft exists.
- Re-sending the same confirm is idempotent (no double booking for the same `pendingDraftId`).

**Boundaries (same as Mission Control):**

- Mission drafts are **local in-memory only** — not Supabase mission persistence.
- This is **not** live mission execution; no executor runs beyond draft + calendar write.
- Ledger Activity on `/hq` may show **Liée** when `missionId` is present on decision/action rows (#95).

**Smoke:** `npm run smoke:joris` (two messages). **Tests:** `npm run test:mission-draft`.

---

## What Happens in POST /api/missions/plan

The dry-run plan endpoint lives at `src/app/api/missions/plan/route.ts`.

**Gate sequence:**

```
1. Auth check          → 401 if no session, 403 if not workspace owner
2. Body validation     → 400 if missing `missionId` / `idempotencyKey`
3. Workspace resolve   → server-side only via `getActiveWorkspaceContext()`
4. Mission resolve     → 404 if mission not found in active workspace
5. Idempotency check   → 409 if same key already processed (within TTL window)
6. Rate limit check    → 429 if > 10 attempts / 60s for this workspace
7. Reserve key         → `recordAttempt()` called BEFORE plan generation
8. approvalConfirmed   → hardcoded false — never accepts caller value
9. Build plan          → `buildDryRunMissionExecutionPlan()` — no execution
10. Return plan
```

The route does not accept `workspaceId` from the caller. Workspace scope is always resolved server-side.

**Reserve-before-build:** the idempotency key is reserved (step 7) **before** the plan is built (step 9). This closes the concurrent double-submit window where two requests with the same key could both pass the idempotency check before either recorded it.

---

## Why the Live Executor Is Locked

The live executor (`MissionExecutorMode = "live"`) is permanently blocked until:

1. A real `MissionApprovalRecord` is persisted and verified via `verifyMissionApprovalRecord()` (7 checks)
2. The persistence layer (`mission_approval_records`, `mission_execution_attempts`, and mission writes) is applied and reviewed
3. The idempotency store is backed by atomic Supabase/Redis semantics — not local in-memory
4. A Red Team review pass is completed

Until all four are true, every execution plan is dry-run only. `buildDryRunMissionExecutionPlan()` produces a safe, non-executing plan regardless of input, and the local runtime remains echo-only.

---

## Mission Status Reference

| Status | Meaning |
|---|---|
| `pending` | Queued, not yet picked up |
| `running` | Active — requires a valid approval record to enter |
| `needs_approval` | Waiting for explicit human approval |
| `completed` | Done successfully |
| `failed` | Execution failed |
| `cancelled` | Cancelled before completion |

**Terminal statuses:** `completed`, `failed`, `cancelled` — missions in these states are excluded from available-mission suggestions in `resolveMissionFromText`.

---

## What Is Safe vs Unsafe Today

**Safe (current state):**
- Requesting dry-run plans via Joris or POST /api/missions/plan
- Viewing mission pipeline on /hq/missions
- Viewing **Operator Snapshot** and **Ledger Activity** on `/hq` (read-only — no execution)
- Proposing then confirming calendar bookings via Joris (Mission Draft gate → local draft + `calendar.book` with `missionId`; ledger decision→create→action #88–#96)
- Creating `MissionApprovalRecord` drafts via `createMissionApprovalRecordDraft()`
- Running `verifyMissionApprovalRecord()` — pure function, no I/O

**Unsafe / blocked:**
- Setting `approvalConfirmed: true` from any client — server-side only
- Calling the live executor — hardcoded unavailable
- Calling `/api/missions/execute` — no such route exists today
- Applying the persistence migration without CEO sign-off (documented in `docs/MISSION_PERSISTENCE_SCHEMA_PROPOSAL.md`)
- Any code that bypasses `evaluateMissionApproval()` or `evaluateMissionTransition()` gates

---

## The Approval Record Contract

File: `src/server/missions/approval-record.ts`

A `MissionApprovalRecord` is the single source of truth for whether a mission is approved. The contract exists in TypeScript only today; `mission_approval_records` is not applied in Supabase yet. `verifyMissionApprovalRecord(mission, record)` runs 7 checks before `approvalConfirmed` can be set `true`:

1. Record exists
2. Mission ID matches
3. Status is `"approved"` (rejects `pending`, `rejected`, `changes_requested`, `expired`)
4. Approver email present
5. Approval timestamp present
6. Record not expired (TTL default: 3600s)
7. Scope covers the requested transition

Until the persistence migration is applied, records exist only in memory and do not survive restarts.

---

## Mission Resolver

File: `src/server/missions/mission-resolver.ts`

`resolveMissionFromText(query, missions)` maps free text to a mission. Resolution order:

1. **ID match** — regex `\b((?:mission|msn)_\w+)\b` — fast, precise, no ambiguity
2. **Exact title match** — case-insensitive
3. **Fuzzy match** — query contains the full title as a substring

Returns `found | no_match | ambiguous`. When ambiguous, callers must surface the candidate list and ask for clarification. When no match, `available` lists all non-terminal missions.

---

## Next Step Toward Persistence

The path to activating full mission persistence:

1. CEO sign-off on 6 open questions in `docs/MISSION_PERSISTENCE_SCHEMA_PROPOSAL.md` ✅ (done 2026-05-21)
2. Write migration files for `missions`, `mission_approval_records`, and `mission_execution_attempts` (proposal only; not applied yet)
3. Apply migration on staging, validate, apply on production
4. Replace local in-memory idempotency store with Supabase atomic insert
5. Wire `createMissionApprovalRecordDraft()` → Supabase insert once `mission_approval_records` exists
6. Add `verifyMissionApprovalRecord()` call in POST /api/missions/plan before returning plan
7. Red Team review → unlock live executor

Each step is a separate PR. No step skips the 4-validation gate.
