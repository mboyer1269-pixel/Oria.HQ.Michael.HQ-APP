# Agent Approval Packet → Action Ledger Mapping

**Status:** Future integration map. Documentation only.
**Last updated:** 2026-06-01
**Branch at time of writing:** `main` (post-PR #166)

---

## Status — read this first

This document is a **future integration map**. It describes a contract that does
not exist yet and the guardrails any future implementation must satisfy.

- **No Action Ledger write is implemented by this document.**
- **No approval action is implemented.**
- **No runtime execution is enabled.**
- No DB table, migration, RLS policy, API route, UI control, or worker is created
  or modified by this document.

The only thing that exists today is the pure, local `AgentReviewApprovalPacket`
contract (PR #166). Everything downstream of it is described here as a *target*,
not as a shipped capability.

Related documents:
- `docs/AGENT_GOVERNANCE_REVIEW_LOOP.md` — the phase narrative (Phases 1–6)
- `docs/ACTION_LEDGER_MISSION_TRACEABILITY.md` — the live Action Ledger contract
- `docs/MISSION_APPROVAL_RECORD_CONTRACT.md` — the precedent approval-record pattern
- `docs/ORIA_RUNTIME_CONTRACT.md` — the runtime boundary specification
- `docs/OPERATIONAL_SAFEGUARDS_V1.md` — operational safeguards

---

## Current source contract

The current source contract is `AgentReviewApprovalPacket`, built by
`buildAgentReviewApprovalPacket()` in
`src/features/agents/agent-review-approval-packet.ts`.

It is a pure, deterministic, read-only transformation of an
`AgentReviewQueueItem` into a structured packet that **prepares** a human
decision. It does not approve, execute, persist, mutate autonomy, or write to
the Action Ledger.

Current fields:

| Field | Type | Notes |
|---|---|---|
| `packetId` | `string` | Derived as `packet-${queueItemId}` — stable, not random |
| `queueItemId` | `string` | Source review queue item |
| `agentId` | `string` | Agent the observation concerns |
| `outcomeId` | `string` | Specific observed outcome under review |
| `priority` | `AgentReviewPriority` | `critical \| high \| medium \| low` |
| `status` | `AgentReviewApprovalPacketStatus` | `draft_for_human_review \| ready_for_human_review \| blocked_pending_more_evidence` |
| `requestedDecision` | `AgentReviewApprovalPacketDecision` | What the reviewer is asked to decide |
| `sourceDecision` | `AgentOutcomeReviewDecision` | Underlying recommendation it was derived from |
| `sourceNextAction` | `string` | The recommended next step text |
| `riskSummary` | `AgentReviewApprovalRiskSummary` | Level, flag count, flags, `requiresHumanApproval: true`, `requiresLedgerBeforeExecution: true` |
| `requiredReview` | `AgentReviewApprovalRequirement` | Reviewer tier + `approvalRequired`/`noAutoApproval`/`ledgerEntryRequiredBeforeExecution` (all `true`) |
| `rationale` | `string[]` | Evidence strings (copied, not referenced) |
| `executiveSummary` | `string` | One-sentence plain-English summary |
| `guardrails` | `string[]` | Named constraints copied onto every packet |
| `approvalRequired` | `true` | Literal field, not a flag |
| `humanOnTheLoop` | `true` | Literal field, not a flag |
| `noExecutionAuthorized` | `true` | Literal field, not a flag |
| `createdAt` | `string` | Caller-provided ISO timestamp; builder never calls `Date.now()` |
| `expiresAt?` | `string` | Optional ISO timestamp, forwarded when provided |

The packet deliberately carries **no** `approved` field and **no**
`executionAuthorized` field. A packet is an input to a decision — never the
decision itself.

---

## Core principles

These hold at every phase, including all future ones.

- **Queue item is not approval.** A review queue item is a structured prompt.
- **Approval packet is not approval.** The packet prepares a decision; it is not
  a decision.
- **Approval packet is not execution.** No packet authorizes any action.
- **Human decision must be explicit.** No decision is derived on the reviewer's
  behalf.
- **A ledger entry must exist before any future dangerous execution.** Approval
  alone is insufficient; the action must be recorded first.
- **Runtime may only consume approved, bounded, ledgered actions.** Never raw
  packets.
- **`noExecutionAuthorized: true` stays `true`** on the packet until a future,
  separately-approved, ledgered action exists. The packet's value never flips;
  authorization lives in a *different* record downstream, not in the packet.

---

## Future Action Ledger mapping

This table maps current approval-packet fields to the fields a **future** ledger
entry would need. The "Future ledger field" column names are **proposed**, not
implemented. They would live in the existing `action_ledger.metadata jsonb`
column first (no migration), exactly as mission fields do today — see
`docs/ACTION_LEDGER_MISSION_TRACEABILITY.md` Option B.

| Approval packet field | Future ledger field | Purpose | Required? | Notes |
|---|---|---|---|---|
| `packetId` | `sourcePacketId` | Trace the ledgered action back to the packet that prepared it | Yes | One packet may relate to at most one approved action |
| `queueItemId` | `sourceQueueItemId` | Trace back to the originating review queue item | Yes | Preserves the full review chain |
| `agentId` | `subjectAgentId` | Which agent the decision concerns | Yes | Not the actor; the agent under review |
| `outcomeId` | `sourceOutcomeId` | Which observed outcome triggered the review | Yes | Correlates ledger to evidence |
| `requestedDecision` | `proposedDecision` | The decision the reviewer was asked to make | Yes | What was on the table |
| `sourceDecision` | `sourceRecommendationDecision` | Underlying recommendation | Yes | Audit of the machine recommendation |
| `sourceNextAction` | `proposedNextAction` | The recommended next step | Yes | Human-readable intent |
| `riskSummary` | `riskSnapshot` | Frozen risk picture at decision time | Yes | Immutable copy; never recomputed later |
| `requiredReview` | `requiredReviewerTier` | Minimum reviewer authority required | Yes | e.g. CEO / operator / routine |
| `rationale` | `decisionRationaleSnapshot` | Evidence strings shown to the reviewer | Yes | Frozen at decision time |
| `executiveSummary` | `summary` | Plain-English summary | Yes | Maps to existing `action_ledger.summary` semantics |
| `guardrails` | `guardrailSnapshot` | Named constraints in force at decision time | Yes | Frozen; proves which guardrails applied |
| `createdAt` | `packetCreatedAt` | When the packet was prepared | Yes | Distinct from ledger write time |
| `expiresAt` | `packetExpiresAt` | When the packet stopped being valid input | No | Only if the packet carried an expiry |
| `noExecutionAuthorized` | `mustBeFalseOnlyAfterApprovalAndLedger` | Invariant guard | Yes | Execution may proceed only once a separate approved + ledgered action exists |

The packet's own `approvalRequired`, `humanOnTheLoop`, and `noExecutionAuthorized`
literals are **not** transcribed as authorization into the ledger. They are
recorded only as evidence that the packet was, by construction, non-authorizing.

---

## Required future approval event (conceptual)

Before any ledger write, a **future** explicit human approval event must exist.
This mirrors the existing `MissionApprovalRecord` pattern
(`docs/MISSION_APPROVAL_RECORD_CONTRACT.md`): the approval is a verified record,
and downstream authorization is *derived* from it — never caller-supplied.

Conceptual shape (no code, not implemented):

| Field | Purpose |
|---|---|
| `approvalId` | Stable identifier for the decision |
| `sourcePacketId` | Links the decision to the packet it answered |
| `reviewerId` | The human who decided |
| `reviewerRole` | The reviewer's authority tier |
| `decision` | `approved \| rejected \| changes_requested` |
| `decisionAt` | ISO timestamp of the decision |
| `decisionRationale` | Why the reviewer decided as they did |
| `constraints` | Explicit bounds the reviewer attached to any approval |
| `expiresAt` | When the approval stops being valid |
| `ledgerEntryId` | The ledger entry that must be written before execution |
| `noRuntimeExecutionUntilLedgered` | `true` — execution is blocked until the ledger entry exists |

The approval event is a separate record from the packet. The packet never
mutates into an approval; an approval references the packet.

---

## Required future ledger guarantees

Any future ledger entry derived from an agent approval must guarantee:

- An **immutable** audit record (append-only; no in-place edits).
- A link to the **approval packet** (`sourcePacketId`).
- A link to the **human reviewer** (`reviewerId` / `reviewerRole`).
- An **explicit decision** (no implied or defaulted approval).
- An **explicit scope** (which single action is authorized).
- An **explicit expiry or revalidation rule**.
- A **risk snapshot** frozen at decision time.
- **Rollback or mitigation notes** where applicable.
- **No secret exposure** anywhere in the entry or its metadata.
- **No runtime execution before the ledger write** completes.
- **RLS enforced** from the first migration if persisted in a database.

---

## Runtime boundary

The runtime contract (`docs/ORIA_RUNTIME_CONTRACT.md`) governs execution. With
respect to approval packets specifically:

- Runtime must **not** read raw approval packets as authorization.
- Runtime may **only** consume a future approved, ledgered action.
- An approval packet **cannot** be used as a runtime token.
- An approval packet **cannot** authorize: network calls, DB writes, external
  workers, messages, purchases, deployments, CRM writes, or autonomy changes.

A packet reaching the runtime, by itself, is a no-op by design. The runtime's
authorization input is the ledgered approved action, not the packet.

---

## Non-negotiable checks before implementation

No phase below may begin until its preconditions are met. This is a checklist for
*future* work, not a record of completed work.

- [ ] RLS design exists before any DB persistence.
- [ ] Ledger schema reviewed before any migration.
- [ ] Approval event contract reviewed before any UI buttons.
- [ ] Runtime contract reviewed before any execution hooks.
- [ ] Tests prove a packet alone cannot execute.
- [ ] Tests prove a missing ledger entry blocks execution.
- [ ] Tests prove an expired approval blocks execution.
- [ ] Tests prove high-risk actions require an explicit reviewer tier.
- [ ] No public runtime endpoint without an audit trail.
- [ ] No hardcoded secret in source, config, or committed files.
- [ ] No background worker without defined control boundaries and a kill switch.

---

## Recommended future PR sequence

A recommendation, **not** an implementation plan to start now. Each step is a
separate, deliberately-scoped PR with its own review.

1. `docs(agents): map approval packets to action ledger requirements` — **this PR**.
2. `feat(agents): add approval event contract` — pure/local, no DB, no runtime.
3. `docs(db): design approval + ledger persistence with RLS`.
4. `db: add approval/ledger schema with RLS` — schema only, no runtime consumption.
5. `feat(agents): show approval packet preview read-only` — display only, no controls.
6. `feat(agents): add approval action draft` — writes the ledger only, never runtime.
7. `feat(runtime): consume ledgered approved actions` — bounded, tested, reversible
   where possible.

No step beyond #1 is authorized by this document.

---

## Implementation map

| Concept | File / Doc |
|---|---|
| Approval packet contract (current) | `src/features/agents/agent-review-approval-packet.ts` |
| Review queue builder | `src/features/agents/agent-review-queue.ts` |
| Review recommendations | `src/features/agents/observed-agent-outcome-review.ts` |
| Observed outcome contract + pipeline | `src/features/agents/observed-agent-outcome.ts` |
| Governance review loop (phase narrative) | `docs/AGENT_GOVERNANCE_REVIEW_LOOP.md` |
| Action Ledger contract | `docs/ACTION_LEDGER_MISSION_TRACEABILITY.md` |
| Approval-record precedent | `docs/MISSION_APPROVAL_RECORD_CONTRACT.md` |
| Runtime boundary spec | `docs/ORIA_RUNTIME_CONTRACT.md` |
| Operational safeguards | `docs/OPERATIONAL_SAFEGUARDS_V1.md` |
</content>
</invoke>
