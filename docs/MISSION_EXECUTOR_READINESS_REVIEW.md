# Mission Executor Readiness Review

Last updated: 2026-05-21  
Branch: `codex/mission-executor-readiness-review`  
Scope: PRs #14–#18 (MissionApprovalService, type consolidation, StateMachine, Ledger missionId, Dry-run contract)

---

## 1. Executive Verdict

**CONDITIONAL GO — DRY-RUN ENDPOINT ONLY**

| Layer | Verdict |
|-------|---------|
| Dry-run plan evaluation (`buildDryRunMissionExecutionPlan`) | ✅ GO — safe to expose behind GET endpoint |
| Read-only Mission UI, GET /api/missions | ✅ GO — already merged, confirmed safe |
| Approval evaluation service | ✅ GO — pure read |
| State machine (transition evaluation) | ✅ GO — pure read |
| Ledger `missionId` contract | ✅ GO — backward compatible, optional |
| Dry-run POST endpoint (plan only, no execution) | 🟡 CONDITIONAL — see §4 |
| Joris dry-run wiring | 🟡 CONDITIONAL — see §6 |
| Live Mission Executor | 🔴 NO-GO — 7 required items missing |
| Joris chat → live executor bridge | 🔴 NO-GO — bypass path unresolved |

---

## 2. What Is Safe Now

| Capability | Location | Safe because |
|------------|----------|--------------|
| `evaluateMissionApproval()` | `approval-service.ts` | Pure function, no I/O |
| `evaluateMissionTransition()` | `state-machine.ts` | Pure function, no I/O |
| `buildDryRunMissionExecutionPlan()` | `executor-contract.ts` | Pure function, `"live"` hard-blocked |
| `GET /api/missions` | `app/api/missions/route.ts` | Read-only, owner-auth, no mutation |
| `MissionApprovalPanel` (disabled buttons) | `mission-approval-panel.tsx` | No handlers, no writes |
| `RecordActionInput.missionId` | `action-ledger-repository.ts` | Optional, backward compat |
| Type contracts: `PermissionRule`, `AutonomyLevel` | `src/core/types.ts` | Consolidated, no duplication |

The gate chain is coherent and correctly ordered:

```
Mission
  → evaluateMissionApproval()      [PR #14]
  → evaluateMissionTransition()    [PR #16]
  → buildDryRunMissionExecutionPlan()  [PR #18]
  → ledger metadata contract       [PR #17]
```

---

## 3. What Is Still Unsafe

### 3.1 `approvalConfirmed` is a boolean flag, not a verified record

**Critical.** `MissionExecutorInput.approvalConfirmed` is:

```ts
approvalConfirmed?: boolean
```

Any caller can pass `approvalConfirmed: true` without any real approval having been recorded. There is no `MissionApprovalRecord` type, no persistence, no audit trail of who approved what and when.

**Impact:** A future executor that passes `approvalConfirmed: true` freely would bypass Gate 3 entirely. The gate contract exists, but the input that satisfies it is unverified.

**Required fix:** `approvalConfirmed` must be derived from a real `MissionApprovalRecord` retrieved from persistence, not supplied as a raw boolean by the caller.

---

### 3.2 Missing `MissionApprovalRecord` type and persistence

No approval record type exists beyond `MissionApprovalRequirement` (typed but unused). An approval decision needs:

```ts
type MissionApprovalRecord = {
  id: string;
  missionId: string;
  decision: "approved" | "rejected";
  by: string;           // owner user id
  at: string;           // ISO timestamp
  reason?: string;
  expiresAt?: string;   // approval should not be valid indefinitely
};
```

Without this:
- The executor cannot verify that approval came from a real human decision
- The `approvalConfirmed` flag cannot be trusted
- The audit trail has no "who approved this?" record

---

### 3.3 Missing mission persistence

All mission data is seed/mock. A live executor would:

1. Read `mission.status` from the database to know current state
2. Write `mission.status = "running"` before execution begins
3. Write `mission.status = "completed" | "failed"` after

Without persistence, the state machine gates evaluate mock data that never changes. A concurrent second call would see the same `status: "queued"` and attempt to execute again.

---

### 3.4 Missing idempotency key on execution

`MissionExecutorInput` has no `idempotencyKey`. Two concurrent calls with the same mission:

```ts
buildDryRunMissionExecutionPlan({ mission, mode: "dry_run", approvalConfirmed: true })
// → { allowed: true }  ← first caller
// → { allowed: true }  ← concurrent second caller
```

Both return `allowed: true` and both would execute. **No deduplication exists.**

**Required fix:** `idempotencyKey: string` on `MissionExecutorInput`; the executor must reject duplicate keys within a TTL window.

---

### 3.5 Missing rate limiting

No per-workspace rate limit on execution calls. A misconfigured caller looping on `buildDryRunMissionExecutionPlan()` could flood the system with execution attempts when the live path is open.

---

### 3.6 Single-step plan is not realistic

`buildDryRunMissionExecutionPlan()` always produces exactly one step:

```ts
steps: [{ stepId: `step_${mission.id}_01`, actionType: `mission.execute.${mission.assignedAgentId}` }]
```

A real mission (e.g., `brief.generate` + `calendar.book`) requires multiple steps, each individually gated. The current plan is a placeholder, not a real execution decomposition.

**Impact:** An executor that iterates `plan.steps[]` and trusts the list is complete would silently skip steps that were never planned.

---

### 3.7 `transition_blocked` is defined but never emitted

`MissionExecutorBlockedReason` includes `"transition_blocked"` but `evaluateMissionTransition()` never returns it — it returns `"terminal_state"`, `"invalid_transition"`, `"approval_required"`, `"approval_not_confirmed"`. Minor type inconsistency; harmless now but confusing for future callers.

---

## 4. Gate Chain Review

```
Mission
  ↓
evaluateMissionApproval(mission)
  blocksExecution: boolean
  ↓
evaluateMissionTransition({ mission, to: "running", approvalConfirmed })
  Gate 2: terminal state
  Gate 3: structural transition
  Gate 4: approval gate
  ↓
buildDryRunMissionExecutionPlan()
  Gate 1: mode === "live" hard block
  ↓
MissionExecutorPlan
  steps[].ledgerMetadata.missionId
```

**Chain quality:** correct structure, correct ordering. The weakness is at the entry point: `approvalConfirmed` enters from outside the chain without verification (§3.1).

---

## 5. Approval Confirmation Risk

### Why `approvalConfirmed: true` cannot be trusted today

```ts
// Current — a caller sets this freely:
buildDryRunMissionExecutionPlan({
  mission,
  mode: "dry_run",
  approvalConfirmed: true,   // nothing verifies this
})
```

For `approvalConfirmed` to be trustworthy, the live executor must:

1. Look up `MissionApprovalRecord` for this `missionId`
2. Verify `record.decision === "approved"` and `record.by` is a valid owner user id
3. Verify `record.at` is recent (not a stale approval from days ago)
4. Set `approvalConfirmed = true` internally — **the caller must never supply this flag**

Until `MissionApprovalRecord` persistence exists, Gate 3 is structurally correct but semantically unverified.

---

## 6. Joris Wiring Risk

### Current Joris execution path

```
runJorisCommand(message)
  → detectIntent()
  → checkPermission("calendar-simple")   ← seed-based, not mission-aware
  → createCalendarEvent()                ← direct execution, no mission check
```

Joris knows nothing about Missions. If a user types "book a meeting for Mission X", Joris would book the meeting as a chat action, bypassing:
- Mission status check
- `evaluateMissionApproval()`
- `evaluateMissionTransition()`
- `buildDryRunMissionExecutionPlan()`
- Mission ledger traceability (`missionId` would be absent from the ledger entry)

### Why this is not an immediate risk

Today, Joris is not wired to execute missions. There is no "start mission X via chat" command. The risk is latent — it exists only if a future PR adds that shortcut without going through the executor contract.

### Safe wiring pattern (for PR #20 or later)

```
runJorisCommand("execute mission X")
  → resolve mission by id
  → buildDryRunMissionExecutionPlan({ mission, mode: "dry_run" })
  → if (!result.allowed) return blocked summary
  → surface plan to user for confirmation (requiresConfirmation: true)
  → never auto-execute from chat without explicit confirmation
```

**Joris must never call a live executor directly.** Chat is low-latency and user-initiated; missions are system-initiated and must carry the full gate chain.

---

## 7. Required Before Any Live Executor

| Requirement | Status | Proposed PR |
|-------------|--------|------------|
| `MissionApprovalRecord` type + persistence | ❌ Missing | #19A |
| Approval verification: `approvalConfirmed` derived from record | ❌ Missing | #19A |
| Mission persistence table (Supabase) + migration | ❌ Missing (Michael sign-off required) | #19C |
| Idempotency key on `MissionExecutorInput` | ❌ Missing | #19B |
| Rate limiting per workspace per minute | ❌ Missing | #19B |
| Multi-step plan decomposition | ❌ Placeholder only | #19D |
| `transition_blocked` type inconsistency resolved | ❌ Minor | #19A or inline |
| Live executor calls `buildDryRunMissionExecutionPlan()` first | ✅ Contract enforced | PR #18 |
| Ledger entry includes `missionId` | ✅ Contract in place | PR #17 |
| Joris cannot set `approvalConfirmed` freely | 🟡 Pattern documented, not enforced | PR #20 |

---

## 8. Recommended Next PRs

| PR | Title | Risk | Prerequisite |
|----|-------|------|-------------|
| **#19A** | `MissionApprovalRecord` — type + persistence contract | Medium | This review |
| **#19B** | Idempotency + rate limit contract | Medium | #19A |
| **#19C** | Mission persistence schema proposal | Medium | #19A (Michael sign-off required before apply) |
| **#19D** | Dry-run endpoint only: `POST /api/missions/plan` (dry-run, no execution) | Medium | #19B |
| **#20** | Joris dry-run wiring — surface plan, never auto-execute | High | #19D + second Red Team pass |
| **#21** | Live executor prototype — gated, single intent, mission persistence required | 🔴 High | PRs #19A–#19D + third Red Team pass |

**PR #21 (live executor) must not start until a third Red Team pass covers PRs #19A–#19D.**

---

## 9. Final Decision

| Question | Decision |
|----------|----------|
| Live executor: GO / NO-GO? | **NO-GO** — 7 required items missing (§3) |
| Dry-run endpoint (`POST /api/missions/plan`, no execution): GO / NO-GO? | **CONDITIONAL GO** — safe if caller cannot supply `approvalConfirmed` |
| Joris dry-run wiring: GO / NO-GO? | **CONDITIONAL GO** — only if Joris surfaces the plan and requires user confirmation before any execution; Joris must never set `approvalConfirmed` |
| Continue building approval record / idempotency? | **YES — PR #19A next** |
| Activate approval panel buttons? | **NO — approval record required first** |
| Apply mission persistence migration? | **NO — Michael sign-off required** |
