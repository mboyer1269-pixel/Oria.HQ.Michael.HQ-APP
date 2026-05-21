# Dry-Run Mission Executor Contract

Last updated: 2026-05-21  
Branch: `claude/dry-run-executor-contract`  
File: `src/server/missions/executor-contract.ts`

---

## What This Is

A pure function contract that describes what a Mission Executor would do — without doing it.

`buildDryRunMissionExecutionPlan()` runs every safety gate and returns either a blocked result or a detailed plan of what real execution would look like, including the exact ledger metadata that would be written.

**No writes. No AI calls. No ledger.record(). No side effects.**

---

## Safety Gates (in order)

### Gate 1 — Live mode hard block

```ts
if (mode === "live") → blocked: "live_mode_not_implemented"
```

`"live"` is reserved. Any caller passing `mode: "live"` is immediately rejected. The live executor requires a second Red Team pass covering PRs #14–#18. This cannot be bypassed.

### Gate 2 — State machine transition check

Delegates to `evaluateMissionTransition({ mission, to: "running", approvalConfirmed })`.

Three sub-checks run internally:
- Terminal state guard (`completed`/`failed`/`cancelled` → blocked)
- Structural transition guard (must be in the allowlist)
- Approval gate (`→ running` blocked if `blocksExecution && !approvalConfirmed`)

### All gates clear → dry-run plan returned

The plan includes:
- `steps[]` — what each executor step would do
- `ledgerMetadata` per step — exact fields that `ledger.record()` would receive
- `estimatedAutonomyCost` — autonomy level of the mission (not enforced yet)

---

## API

```ts
buildDryRunMissionExecutionPlan(input: MissionExecutorInput): MissionExecutorResult
```

### Input

```ts
type MissionExecutorInput = {
  mission: Mission;
  mode: MissionExecutorMode;       // "dry_run" | "live"
  approvalConfirmed?: boolean;     // must be true when approval gate requires it
};
```

### Result (union)

```ts
type MissionExecutorResult =
  | { allowed: true;  plan: MissionExecutorPlan;  approvalEvaluation; transitionEvaluation }
  | { allowed: false; blockReasons: MissionExecutorBlockedReason[]; approvalEvaluation; transitionEvaluation };
```

### Example — allowed

```ts
const result = buildDryRunMissionExecutionPlan({
  mission: { id: "msn_1", status: "queued", autonomyLevel: 2, riskLevel: "low", requiresApproval: false, ... },
  mode: "dry_run",
});
// → { allowed: true, plan: { steps: [...], ledgerMetadata: { missionId: "msn_1", ... } } }
```

### Example — blocked (live mode)

```ts
buildDryRunMissionExecutionPlan({ mission, mode: "live" });
// → { allowed: false, blockReasons: ["live_mode_not_implemented"] }
```

### Example — blocked (approval required, not confirmed)

```ts
buildDryRunMissionExecutionPlan({
  mission: { requiresApproval: true, status: "queued", ... },
  mode: "dry_run",
  approvalConfirmed: false,
});
// → { allowed: false, blockReasons: ["approval_required", "approval_not_confirmed"] }
```

### Example — allowed after approval confirmed

```ts
buildDryRunMissionExecutionPlan({
  mission: { requiresApproval: true, status: "queued", ... },
  mode: "dry_run",
  approvalConfirmed: true,   // set only after MissionApprovalService.approve() records the decision
});
// → { allowed: true, plan: { ... } }
```

---

## What the Live Executor Must Implement (PR #19)

The live executor wraps `buildDryRunMissionExecutionPlan()` and adds:

1. Call `buildDryRunMissionExecutionPlan(input)` — if `allowed: false`, throw/return blocked
2. Persist `mission.status = "running"` (requires Mission persistence table — future)
3. For each `step` in `plan.steps`:
   a. Execute the real action (Joris intent, calendar, etc.)
   b. Call `ledger.record({ ...step.ledgerMetadata, missionId: step.ledgerMetadata.missionId })`
4. Persist final `mission.status = "completed" | "failed"`
5. Write final ledger entry with outcome

**The live executor must never be called without `buildDryRunMissionExecutionPlan()` passing first.**

---

## Red Team Risk Tracker

| Risk | Status |
|------|--------|
| 1. Dual `PermissionRule` types | ✅ PR #15 |
| 2. Dual `AutonomyLevel` types | ✅ PR #15 |
| 3. Permission engine not wired to Mission | ✅ Gates 2+3 — PRs #16 + #18 |
| 4. Action Ledger missing `missionId` | ✅ PR #17 |
| 5. Joris brain bypasses Mission gate | ⚠️ Partially — executor contract exists; Joris not wired yet |
| 6. No idempotency on mission state transitions | ⏳ Future |

**Risk 5 status:** The executor contract enforces that Joris cannot execute a mission without passing through `buildDryRunMissionExecutionPlan()` first. However, `runJorisCommand()` in `src/server/joris/brain.ts` still runs independently. Wiring Joris to use the executor is PR #19.

---

## Required Before PR #19 (Live Executor)

- [ ] Second Red Team pass on PRs #14–#18
- [ ] `MissionApprovalService.approve()` — real approval record, not just `approvalConfirmed: true` flag
- [ ] Mission Supabase persistence (table + migration, Michael sign-off required)
- [ ] Idempotency key on execution attempts
- [ ] Rate limiting per workspace per minute
