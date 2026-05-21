# Mission State Machine

Last updated: 2026-05-21  
Branch: `claude/mission-state-machine-readonly`  
File: `src/server/missions/state-machine.ts`

---

## Transition Map

```
draft ──────────────────────────────────────────────── cancelled
  │
  ▼
queued ─────────────────────────────────────────────── cancelled
  │                 │
  ▼                 ▼
running ──── needs_approval ──── queued (re-queue after review)
  │   │            │
  │   │            └──────────────────────────────── cancelled
  │   │
  ▼   ▼
completed  failed  cancelled (from running)
```

### Allowed transitions table

| From | To (allowed) |
|------|-------------|
| `draft` | `queued`, `cancelled` |
| `queued` | `running`, `needs_approval`, `cancelled` |
| `running` | `needs_approval`, `completed`, `failed`, `cancelled` |
| `needs_approval` | `queued`, `running`, `cancelled` |
| `completed` | *(terminal — no transitions)* |
| `failed` | *(terminal — no transitions)* |
| `cancelled` | *(terminal — no transitions)* |

---

## Safety Gates

### Gate 1 — Terminal state guard

If the current status is `completed`, `failed`, or `cancelled`, **no transition is allowed**, regardless of the target state. `blockReasons` will contain `"terminal_state"`.

### Gate 2 — Structural transition guard

Any `from → to` pair not in the allowed transitions table is rejected. `blockReasons` will contain `"invalid_transition"`.

### Gate 3 — Approval gate (the critical one)

When transitioning into `running`, `evaluateMissionApproval(mission)` is called. If `approval.blocksExecution === true` and `input.approvalConfirmed !== true`, the transition is blocked with `"approval_required"` and `"approval_not_confirmed"`.

**This is a server-side hard stop.** The executor cannot transition a mission into `running` without an explicit `approvalConfirmed: true` flag, which must only be set after a real `MissionApprovalService.approve()` call records the decision.

```
evaluateMissionTransition({
  mission,         // mission with current status
  to: "running",
  approvalConfirmed: false  // default — will be blocked if blocksExecution
})
→ { allowed: false, blockReasons: ["approval_required", "approval_not_confirmed"] }

evaluateMissionTransition({
  mission,
  to: "running",
  approvalConfirmed: true   // only set after real approval record exists
})
→ { allowed: true, blockReasons: [] }  // if no other blocks
```

---

## API Surface

```ts
// All valid next states from a given status
getAllowedMissionTransitions(status: MissionStatus): MissionStatus[]

// Fast structural check, no approval evaluation
canTransitionMissionStatus(from: MissionStatus, to: MissionStatus): boolean

// Full evaluation: structure + approval gate
evaluateMissionTransition(input: MissionTransitionInput): MissionTransitionEvaluation
```

---

## What This Does Not Do

- Does not mutate any state — pure function, no I/O
- Does not write to the Action Ledger (future: every transition must log)
- Does not set `approvalConfirmed` itself — that flag must come from `MissionApprovalService` (future PR)
- Does not enforce idempotency (future: optimistic lock / etag on Mission)

---

## Red Team Risk Tracker

| Risk | Status |
|------|--------|
| 1. Dual `PermissionRule` types | ✅ PR #15 |
| 2. Dual `AutonomyLevel` types | ✅ PR #15 |
| 3. Permission engine not wired to Mission | ✅ Partially — Gate 3 wires approval to transition | 
| 4. Action Ledger has no `missionId` | ⏳ Future PR |
| 5. Joris brain bypasses Mission gate | ⏳ Future PR |
| 6. No idempotency on mission state transitions | ⏳ Future PR |

**Risk 3 is now partially resolved:** the state machine's Gate 3 calls `evaluateMissionApproval()` before allowing any `→ running` transition. A future `MissionApprovalService` will provide the `approvalConfirmed` input. The gate is wired; the confirmation source is not yet real.
