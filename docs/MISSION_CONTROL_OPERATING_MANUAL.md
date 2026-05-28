# Mission Control Operating Manual

Last updated: 2026-05-27  
Branch at time of writing: `main` at `f38aa12`+ (post-PR #96–#99)

> **Canonical inventory:** `docs/ORIA_HQ_CURRENT_STATE.md` — calendar ledger (#88–#90), Operator Snapshot (#92), Ledger Activity (#94–#95), Joris Mission Draft gate (#96), HQ draft control (#98), missions page alignment (#99).

---

## What Mission Control Is

Mission Control (`/hq/missions`) is the human oversight layer for all agent work in Oria HQ.

**Core contract:** no autonomous **live executor** run without explicit approval records (Phase 2). Calendar booking uses a separate **Mission Draft gate** on `/hq` (#96–#98): propose → confirm → local draft + `calendar.book`. `/hq/missions` is a **read-only pipeline view** plus a **mock** executor-approval panel (buttons disabled).

---

## Where to act (operator map)

| What you see | Where to act | Notes |
| --- | --- | --- |
| Proposition calendrier (pending, TTL 10 min) | `/hq` bandeau `#mission-draft-pending` | Approuver / Refuser (#98 API ou chat Joris) |
| Pending visible depuis missions | `/hq/missions` encart embedded | Read-only + lien « Ouvrir sur Michael HQ » (#99) |
| Mission `mission_draft_*` / `calendar.book` | Kanban **Brouillon** | Déjà confirmée — badge « Calendrier confirmé » |
| `mission.plan` dry-run | Joris chat | Texte seulement — pas de mission créée |
| Missions `needs_approval` (seed) | `/hq/missions` panneau orange | **Mock Phase 2** — boutons désactivés |
| Exécuteur live | Nulle part | Verrouillé |

---

## Current System State

| Component | Status | Detail |
|---|---|---|
| Calendar.book gate | ✅ enabled | Pending + confirm on `/hq`; local draft + ledger `missionId` |
| Joris `mission.plan` | ✅ enabled | Dry-run text only — no mission row created |
| Live executor | 🔴 locked | Requires Red Team pass before activation |
| Approval records (executor) | 🟡 mock UI | Contract defined; `/hq/missions` panel is Phase 2 mock only |
| Mission persistence | 🟡 partial | Local in-memory drafts (#96); seed on missions page; Supabase migration not applied |
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

## HQ Mission Draft Control (#98)

When a pending draft exists, `/hq` shows the **Mission draft en attente** banner (`#mission-draft-pending`).

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/missions/draft/pending` | GET | Owner-gated read of pending preview + TTL |
| `/api/missions/draft/confirm` | POST | Owner-gated confirm → local mission + `calendar.book` |
| `/api/missions/draft/cancel` | POST | Owner-gated cancel → clears pending |

Confirm/cancel from the UI use these routes (banner variant). Chat short-words still work via Joris brain delegating to the same control module.

**Do not** duplicate confirm/cancel on `/hq/missions` — embedded panel (#99) links back to `/hq` only.

### Approval UX states (banner `/hq`)

The pending panel uses an explicit client UX state machine: `loading`, `active`, `confirming`, `cancelling`, `confirmed`, `cancelled`, `expired`, `unavailable`, `error`, `idle`.

| UX state | Operator meaning |
| --- | --- |
| `active` | Pending calendar proposal — use **Confirmer le rendez-vous** or **Refuser la proposition** |
| `confirming` / `cancelling` | In-flight — all actions disabled (no double POST) |
| `confirmed` | Calendar booked + local mission draft; not executor Phase 2 approval |
| `cancelled` | Neutral temporary banner — no calendar write |
| `unavailable` | No matching pending (e.g. already cleared, mismatch id) |
| `expired` | TTL elapsed — ask Joris for a fresh proposal |

Copy distinguishes **calendar confirmation** from **executor approval (Phase 2 mock)** on `/hq/missions`.

**Tests:** `npm run test:mission-draft-control` (response mapping); `npm run test:mission-draft` (server gate).

---

## Missions page alignment (#99)

`/hq/missions` adds:

- **Flux calendrier Joris** — legend + optional embedded pending (read-only).
- **Mission system status** chips — distinguishes calendar gate vs `mission.plan` dry-run vs mock approval.
- **Mission cards** — « Calendrier confirmé » for `mission_draft_*` / `calendar.book`.
- **Approval panel** — relabeled « Approbation exécuteur (Phase 2 — mock) ».

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
- Viewing mission pipeline on `/hq/missions` (including legend and embedded pending read-only)
- Viewing **Operator Snapshot** and **Ledger Activity** on `/hq` (read-only — no execution)
- Proposing then confirming calendar bookings on `/hq` (#98 banner/API) or via Joris chat (Mission Draft gate → local draft + `calendar.book` with `missionId`; ledger #88–#96)
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
