# Mission Approval Record Contract

Last updated: 2026-05-21  
Branch: `claude/mission-approval-record-contract`  
File: `src/server/missions/approval-record.ts`

---

## What This Is

A pure-function contract that defines the typed shape of a mission approval decision and provides
two functions: one to create a pending draft, one to verify an existing record before execution.

**No I/O. No writes. No AI calls. No side effects.**

This contract closes the critical gap identified in PR #19 (MISSION_EXECUTOR_READINESS_REVIEW §3.1):
`approvalConfirmed: boolean` was a free caller-supplied flag. The live executor must derive
`approvalConfirmed` from a verified `MissionApprovalRecord` — not accept it from the outside.

---

## Types

### `MissionApprovalRecordStatus`

```ts
type MissionApprovalRecordStatus =
  | "pending"             // awaiting human decision
  | "approved"            // explicitly approved
  | "rejected"            // explicitly rejected
  | "changes_requested"   // conditionally approved pending revisions
  | "expired";            // expiresAt is in the past
```

### `MissionApprovalScope`

```ts
type MissionApprovalScope =
  | "transition_to_running"         // required to unlock the executor gate
  | "transition_to_needs_approval"  // reserved
  | "full_mission";                 // reserved
```

A record must include `"transition_to_running"` in its `approvalScope` to pass verification for
the `queued → running` transition.

### `MissionApprovalRecord`

```ts
type MissionApprovalRecord = {
  id: string;
  missionId: string;
  status: MissionApprovalRecordStatus;
  approvalScope: MissionApprovalScope[];
  approvedBy?: string;    // user ID of the owner who decided
  approvedAt?: string;    // ISO timestamp of the decision
  expiresAt?: string;     // ISO timestamp after which approval is no longer valid
  reason?: string;
  createdAt: string;      // ISO timestamp when the draft was first created
};
```

### `MissionApprovalRecordInput`

```ts
type MissionApprovalRecordInput = {
  missionId: string;
  approvalScope: MissionApprovalScope[];
  reason?: string;
  expiresAt?: string;
};
```

### `MissionApprovalVerificationResult`

```ts
type MissionApprovalVerificationResult =
  | { verified: true;  record: MissionApprovalRecord }
  | { verified: false; record: MissionApprovalRecord | null; reason: MissionApprovalVerificationFailReason };
```

### `MissionApprovalVerificationFailReason`

| Value | Meaning |
|-------|---------|
| `no_record` | No record provided to the verifier |
| `mission_mismatch` | `record.missionId !== mission.id` |
| `not_approved` | `record.status !== "approved"` |
| `missing_approver` | `record.approvedBy` is absent |
| `missing_timestamp` | `record.approvedAt` is absent |
| `expired` | `record.expiresAt` exists and is in the past |
| `scope_missing` | `"transition_to_running"` not in `record.approvalScope` |

---

## Functions

### `createMissionApprovalRecordDraft(input)`

```ts
function createMissionApprovalRecordDraft(
  input: MissionApprovalRecordInput,
): Omit<MissionApprovalRecord, "id">
```

Creates a typed draft with `status: "pending"` and a stable `createdAt` timestamp.
The draft must be persisted by the caller (persistence layer, future PR #19C).
This function only shapes the data — it does not write anything.

**Example:**

```ts
const draft = createMissionApprovalRecordDraft({
  missionId: "msn_1",
  approvalScope: ["transition_to_running"],
  reason: "High autonomy level requires explicit approval",
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h window
});
// → { missionId: "msn_1", status: "pending", approvalScope: [...], createdAt: "..." }
```

---

### `verifyMissionApprovalRecord(mission, record)`

```ts
function verifyMissionApprovalRecord(
  mission: Mission,
  record: MissionApprovalRecord | null | undefined,
): MissionApprovalVerificationResult
```

Verifies that a record is valid for the `queued → running` transition. Seven checks run in order:

1. `record` is not null/undefined → else `"no_record"`
2. `record.missionId === mission.id` → else `"mission_mismatch"`
3. `record.status === "approved"` → else `"not_approved"` (rejects `pending`, `rejected`, `changes_requested`, `expired`)
4. `record.approvedBy` exists → else `"missing_approver"`
5. `record.approvedAt` exists → else `"missing_timestamp"`
6. `record.expiresAt` is absent or in the future → else `"expired"`
7. `record.approvalScope` includes `"transition_to_running"` → else `"scope_missing"`

**Example — verified:**

```ts
const result = verifyMissionApprovalRecord(mission, {
  id: "apr_abc123",
  missionId: "msn_1",
  status: "approved",
  approvalScope: ["transition_to_running"],
  approvedBy: "usr_owner_1",
  approvedAt: "2026-05-21T10:00:00.000Z",
  createdAt: "2026-05-21T09:55:00.000Z",
});
// → { verified: true, record: { ... } }
```

**Example — expired:**

```ts
verifyMissionApprovalRecord(mission, {
  ...approvedRecord,
  expiresAt: "2026-05-20T00:00:00.000Z", // yesterday
});
// → { verified: false, record: { ... }, reason: "expired" }
```

**Example — wrong mission:**

```ts
verifyMissionApprovalRecord({ id: "msn_2" }, recordForMsn1);
// → { verified: false, record: { ... }, reason: "mission_mismatch" }
```

---

## How the Live Executor Must Use This

The pattern below shows how the live executor (PR #21) must derive `approvalConfirmed`
from a verified record — never accepting it as a free boolean from the caller:

```ts
// 1. Look up the approval record from persistence (future PR #19C)
const record = await approvalRecordRepository.findByMissionId(mission.id);

// 2. Verify — all gates must pass
const verification = verifyMissionApprovalRecord(mission, record);
if (!verification.verified) {
  return { blocked: true, reason: verification.reason };
}

// 3. Pass verified: true into the executor — derived, not caller-supplied
const plan = buildDryRunMissionExecutionPlan({
  mission,
  mode: "live",
  approvalConfirmed: true,  // ← safe: derived from verified record above
});
```

**The caller must never pass `approvalConfirmed: true` without calling `verifyMissionApprovalRecord()` first.**

---

## What This PR Does NOT Do

| Item | Status | Next PR |
|------|--------|---------|
| Persist `MissionApprovalRecord` to Supabase | ❌ Not included | #19C (Michael sign-off required) |
| Modify `buildDryRunMissionExecutionPlan()` | ❌ Not modified | Not needed yet |
| Approval panel button handlers | ❌ Not included | After #19C persistence |
| Idempotency key on execution | ❌ Not included | #19B |
| Rate limiting | ❌ Not included | #19B |

---

## Red Team Status After This PR

| Risk | Status |
|------|--------|
| `approvalConfirmed` is a free boolean | ✅ Typed contract exists — verifier enforces 6 gates |
| No `MissionApprovalRecord` type | ✅ Type defined |
| No audit trail shape | ✅ `approvedBy`, `approvedAt`, `expiresAt`, `approvalScope` all required |
| Persistence layer | ⏳ Future — PR #19C, Michael sign-off required |
| Approval panel writes | ⏳ Future — after #19C |
