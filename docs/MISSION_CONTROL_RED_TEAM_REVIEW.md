# Mission Control Red Team Review

Last updated: 2026-05-21  
Branch: `codex/mission-control-red-team-review`  
Scope: PRs #7 – #12 (Phase 0 + Mission Control read layer)

---

## 1. Executive Verdict

**CONDITIONAL GO**

| Layer | Verdict |
|-------|---------|
| Read-only Mission UI (`/hq/missions`) | ✅ GO — safe to ship and build further |
| `GET /api/missions` read endpoint | ✅ GO — owner-only, no mutation |
| `MissionApprovalPanel` (mock, disabled buttons) | ✅ GO — pure UI, zero writes |
| Mission Approval Service (activate buttons) | 🔴 NO-GO — guardrails missing |
| Mission Executor / Joris runner | 🔴 NO-GO — 10 required guardrails absent |
| Supabase mission persistence | 🟡 CONDITIONAL — table design needed, RLS policy required |
| POST/PATCH/DELETE `/api/missions` | 🔴 NO-GO — permission engine not wired to Mission types |

---

## 2. Current Architecture Snapshot

### What exists

| Component | Location | State |
|-----------|----------|-------|
| Mission types | `src/core/types.ts` | Stable, typed |
| ActionQueueItem, PermissionPolicy | `src/core/types.ts` | Typed, unused |
| Mission repository | `src/server/missions/` | Read-only, mock |
| `GET /api/missions` | `src/app/api/missions/route.ts` | Read-only, owner-auth |
| Mission Kanban UI | `src/features/missions/` | Static mock, no writes |
| `MissionApprovalPanel` | `src/features/missions/components/` | Disabled buttons, no handlers |
| Action Ledger | `src/server/actions/action-ledger-repository.ts` | Real — Supabase + local fallback |
| Permission engine | `src/server/permissions/permissions.ts` | Seed-based, not linked to Mission |
| Joris brain | `src/server/joris/brain.ts` | Live — executes calendar/brief intents |
| Auth owner gate | `src/server/auth/owner.ts` | Solid for single-owner |

### What is mock / read-only

- All mission data is seed data — no Supabase persistence
- `MissionApprovalPanel` buttons are disabled — no approval flow runs
- `source: "mock"` is labeled on every mission response
- No Mission → ActionQueue bridge exists

### What does not exist yet

- `MissionApprovalService` — service that records an approval decision
- Mission → ActionQueueItem bridge
- Joris Mission Executor — Joris runs chat/calendar, not missions
- Mission Supabase table and migration
- Dry-run mode for missions
- Idempotency keys on mission actions
- Rate limiting on mission execution

---

## 3. Critical Risks Before Execution

### Risk 1 — `PermissionRule` exists in two incompatible forms

`src/features/hq/types.ts`:
```ts
type PermissionRule = { id, action, level: AutonomyLevel, requiresConfirmation, reason }
```

`src/core/types.ts`:
```ts
type PermissionRule = { id, action, autoApprove: boolean, requiresConfirmation, reason? }
```

**Impact:** A future Mission Executor importing from the wrong location silently uses the wrong schema. `autoApprove` vs `level` is a critical semantic difference.

**Required fix before execution:** Consolidate into one canonical `PermissionRule` in `src/core/types.ts`. Deprecate the feature-level type.

---

### Risk 2 — `AutonomyLevel` exists in two incompatible forms

`src/features/hq/types.ts`: `type AutonomyLevel = 0|1|2|3|4|5`  
`src/core/types.ts`: `type MissionAutonomyLevel = 0|1|2|3|4|5`

Same shape, different names, different locations. The permission engine (`checkPermission`) uses `AutonomyLevel` from features. Mission types use `MissionAutonomyLevel` from core. An executor bridging both will need an explicit conversion or consolidation.

**Required fix before execution:** Alias or merge into one type in `src/core/types.ts`. The features layer should re-export, not duplicate.

---

### Risk 3 — Permission engine is not connected to Mission types

`checkPermission(actionId)` reads from `permissionRules` seed in `src/features/hq/seed.ts`. It does not know about `Mission.requiresApproval`, `Mission.riskLevel`, or `Mission.autonomyLevel`.

```ts
// Current: seed-based, no Mission awareness
checkPermission("calendar.book") → { allowed, requiresConfirmation, autonomyLevel }

// Required before executor:
checkMissionPermission(mission, workspace) → { allowed, requiresApproval, evidenceRequired }
```

**Impact:** A Joris Mission Executor that calls `checkPermission` would bypass the Mission's own `requiresApproval` flag entirely.

---

### Risk 4 — Action Ledger is real but not connected to Mission

The `action_ledger` table exists in Supabase with `user_id`, `action_type`, `autonomy_level`, `requires_confirmation`. It is currently written only by Joris calendar/brief actions.

A Mission Executor that executes without writing to the Action Ledger would be **invisible in the audit trail**.

**Required fix before execution:** Every mission state transition (approved, rejected, executing, completed, failed) must produce an Action Ledger entry.

---

### Risk 5 — Joris brain executes directly without Mission awareness

`runJorisCommand()` checks `checkPermission()` and then directly calls `createCalendarEvent()`. There is no step where Joris checks: "is there a Mission associated with this intent? Does it require approval?"

A future "Joris runs Mission X" shortcut could create a path where mission-gated actions execute as chat commands, bypassing the entire approval gate.

**Required fix before execution:** Mission Executor must be a separate service from Joris chat. They must share the permission engine but never share an execution path.

---

### Risk 6 — No idempotency on mission state transitions

`Mission` has no `version`, `etag`, or `updatedAt` optimistic lock. Two concurrent POST requests to approve a mission would produce two approval records.

**Required fix before activation:** Any approval endpoint must use an optimistic lock or a state machine that rejects transitions from unexpected states.

---

## 4. Workspace Boundary Review

### Current state

`getActiveWorkspaceContext()` returns the single hardcoded workspace (`michael-hq`). The mission repository filters by `workspaceId` and `modeId` — the pattern is correct.

```ts
listMissionsForWorkspace({ workspaceId: activeWorkspace.id, modeId: activeMode.id })
```

**No query parameter can override the workspace.** The workspace is always resolved from the server-side session. This is the correct pattern.

### Risks for multi-tenant future

- `getDefaultWorkspace()` in `registry.ts` ignores `ownerUserId` for the workspace `id` — it always returns `"michael-hq"`. A second user would resolve the same workspace.
- `isOwnerUser()` in `owner.ts` checks against env vars `MICHAEL_HQ_OWNER_ID` and `MICHAEL_HQ_OWNER_EMAIL`. These are single-tenant by design. Multi-tenant requires a workspace membership table.
- `modeId` filtering in the repository means missions created in `suivia` mode are invisible when the active mode is `hq`. This is intentional isolation but must be documented clearly.

### Required before multi-tenant

- Workspace resolver must derive the workspace from a session claim or URL slug, not a hardcoded slug.
- Owner check must derive from a workspace membership record, not env vars.
- All repositories must assert `workspaceId` on every read and write.

---

## 5. Mission vs ActionQueueItem Boundary

### Current boundaries

| Concept | Type | Purpose | State |
|---------|------|---------|-------|
| `Mission` | `src/core/types.ts` | Intent / plan / unit of work | Typed, mock |
| `ActionQueueItem` | `src/core/types.ts` | Proposed executable step | Typed, unused |
| `ActionApproval` | `src/core/types.ts` | Decision record | Typed, unused |
| `ActionLedgerEntry` | `src/server/actions/` | Historical trace | Live |

### Where the boundaries are currently blurry

- `Mission.requiresApproval` is a flag on the mission, but there is no `MissionApproval` record type yet. The `MissionApprovalRequirement` type in `docs/MISSION_MODEL_PROPOSAL.md` exists in the doc but is not yet in `src/core/types.ts` — only `MissionApprovalRequirement` is exported from `src/core/types.ts` but never used by any service.
- `ActionQueueItem` is typed but never instantiated. The bridge "Mission spawns ActionQueueItems" does not exist.
- `ActionLedgerEntry` records past Joris actions by `actionType` string, not by `missionId`. Future correlation between a Mission and its ledger entries requires a `missionId` foreign key.

### Recommended design before executor

```
Mission (approved) 
  → spawns ActionQueueItem[] (one per execution step)
  → each ActionQueueItem checked against PermissionPolicy
  → auto-approved items execute immediately
  → gated items surface in MissionApprovalPanel
  → on decision: ActionApproval record created
  → on execution: ActionLedgerEntry created with missionId
```

---

## 6. Approval Gate Review

### Current state

`MissionApprovalPanel` filters on:
```ts
m.requiresApproval || m.riskLevel === "high" || m.autonomyLevel >= 4
```

This is correct. But the panel is mock-only — buttons are disabled and no approval state exists.

### Missing before activation

| Component | Status |
|-----------|--------|
| `MissionApprovalService.approve(missionId, by)` | Missing |
| `MissionApprovalService.reject(missionId, by, reason)` | Missing |
| Approval record persisted to Supabase or local store | Missing |
| Mission status transition `needs_approval → approved/cancelled` | Missing |
| Action Ledger entry on approval decision | Missing |
| Optimistic lock on approval | Missing |
| Audit trail: who approved what and when | Missing |

### `requiresApproval` is not enforced at the executor layer

Currently `requiresApproval: true` on a Mission only affects the UI panel filter. Nothing in the server prevents a future executor from running a `requiresApproval: true` mission without an approval record. **This must be a hard server-side check, not a UI filter.**

---

## 7. API Security Review

### `GET /api/missions` — current state ✅

- `requireOwnerApiSession()` guards the route
- `workspaceId` and `modeId` resolved server-side — cannot be overridden via query params
- Read-only — no mutation path
- Error logged server-side, sanitized message to client

### Risks for future `POST /api/missions`

| Risk | Mitigation required |
|------|---------------------|
| Workspace injection via body | Ignore body `workspaceId` — always use context |
| Status spoofing (`status: "completed"`) | State machine: only valid transitions allowed |
| `autonomyLevel: 0` bypass | Permission engine must enforce, not trust input |
| Concurrent mutation | Idempotency key + optimistic lock |
| Missing auth | `requireOwnerApiSession()` on every method, explicit |
| Rate abuse | Rate limit per owner, per minute |

**Do not add `POST /api/missions` until a `MissionStateMachine` and `MissionApprovalService` are implemented and tested.**

---

## 8. Data Persistence / Supabase Readiness

### What is ready

- `action_ledger` table exists with RLS, used by Joris
- Supabase admin client + optional client patterns exist
- Local fallback pattern (`isLocalPersistenceFallbackAllowed`) is established
- `source: "mock" | "supabase"` label in `ListMissionsResult` is the right seam for swapping

### What is needed for mission persistence

**Minimum table design:**
```sql
create table missions (
  id text primary key,
  workspace_id text not null,
  mode_id text not null,
  title text not null,
  objective text not null,
  assigned_agent_id text not null,
  autonomy_level smallint not null check (autonomy_level between 0 and 5),
  status text not null,
  risk_level text not null,
  input jsonb not null default '{}',
  expected_output text not null,
  requires_approval boolean not null default false,
  cost_budget_cents integer,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

-- RLS
alter table missions enable row level security;
create policy "owner_read" on missions
  for select using (workspace_id = current_setting('app.workspace_id', true));
```

**Not yet approved** — migration requires explicit Michael sign-off per `docs/MISSION_MODEL_PROPOSAL.md` safety rules.

---

## 9. Joris Executor Go/No-Go

### Verdict: 🔴 NO-GO

Joris executor cannot be activated until all of the following exist:

| Guardrail | Status |
|-----------|--------|
| `MissionApprovalService` with server-side enforcement | ❌ Missing |
| `ActionQueue` bridge: Mission → ActionQueueItem[] | ❌ Missing |
| `ActionLedger` write on every mission state transition | ❌ Missing |
| `PermissionPolicy` linked to Mission types (not seed) | ❌ Missing |
| Dry-run mode with explicit `dryRun: true` flag | ❌ Missing |
| Idempotency key on mission execution | ❌ Missing |
| `MissionStateMachine` with invalid-transition guards | ❌ Missing |
| Rate limit on mission execution per workspace | ❌ Missing |
| Explicit owner confirmation before any `autonomyLevel >= 4` mission | ❌ Missing |
| `missionId` on Action Ledger entries for correlation | ❌ Missing |

### Why Joris chat must stay separate from Mission Executor

`runJorisCommand()` executes in the context of a chat message. It is low-latency and user-initiated. A Mission Executor would be system-initiated, potentially deferred, and must carry a different set of guardrails. Merging the two paths would make it impossible to enforce approval gates on mission-originated actions.

---

## 10. Required Guardrails Checklist

Before enabling any real mission execution:

- [ ] Auth/session check on every mutation endpoint
- [ ] Workspace boundary enforced server-side on every mutation
- [ ] `PermissionPolicy` engine linked to `Mission` types — not seed rules
- [ ] `requiresApproval === true` enforced as a server-side hard stop, not UI filter
- [ ] Approval record created before any `approved` status transition
- [ ] Action Ledger entry on every mission state transition with `missionId`
- [ ] Dry-run flag: executor defaults to dry-run unless `dryRun: false` is explicit
- [ ] Rollback plan for reversible actions (calendar, draft); explicit irreversibility flag for others
- [ ] No external side effects (email, send, publish, bill) without `autonomyLevel === 5` + approval record
- [ ] Secrets and `.env` never appear in `Mission.input`, `Mission.result`, or Action Ledger metadata
- [ ] Smoke test covers mission approval path end-to-end
- [ ] Idempotency key on every execution attempt

---

## 11. Recommended Next PRs

| PR | Title | Prerequisite |
|----|-------|-------------|
| #14 | `MissionApprovalService` mock/read — types, service contract, no DB | PR #12 merged |
| #15 | `PermissionPolicy` consolidation — merge duplicate `PermissionRule` types | PR #14 |
| #16 | Mission persistence schema proposal — migration file, no apply | PR #15 |
| #17 | `MissionStateMachine` — valid transition map, pure function, tested | PR #16 |
| #18 | Dry-run executor contract — interface only, no Joris wiring | PR #17 |
| #19 | Joris executor prototype — gated, dry-run only, single intent | PR #18 + Red Team pass |

**PR #19 (Joris executor) must not start until a second Red Team review passes on PRs #14–#18.**

---

## 12. Final Decision

| Question | Decision |
|----------|----------|
| Merge current Mission Control read stack (PRs #8–#12)? | **YES** |
| Continue building read-only layers (summary, approval panel, API)? | **YES** |
| Add `MissionApprovalService` mock with server types? | **YES — PR #14** |
| Consolidate duplicate `PermissionRule` / `AutonomyLevel` types? | **YES — before PR #17** |
| Enable live mission approval (activate buttons)? | **NO — PR #14 required first** |
| Add mission Supabase persistence? | **NO — migration not approved** |
| Enable Joris Mission Executor? | **NO — 10 guardrails missing** |
| Add `POST /api/missions`? | **NO — state machine required first** |
