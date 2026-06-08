# Execution Phase Status

Last updated: 2026-06-08  
Maintained by: CEO / Senior Engineer  

---

## Purpose

This document is the single source of truth on **what is currently implemented**
vs. **what is a planned future phase** in the agentic execution pipeline.

It must be read by any agent or engineer before modifying execution-related code.

---

## The Governance Pipeline

```
Agent proposes
     ↓
Human reviews (CEO, in-app)
     ↓
Human approves or rejects
     ↓
Action marked ready_to_send (approved_for_manual_send)
     ↓
[FUTURE] Controlled worker executes — NOT YET ACTIVE
```

---

## Current Status Checklist

| Stage | Status | Where it lives |
|---|---|---|
| Agent proposes action (dry-run) | ✅ **Implemented** | `src/server/joris/brain.ts`, `src/server/agents/work-order-governance-plan.ts` |
| Governance Bundle preview | ✅ **Implemented** | `src/server/joris/governance-bundle-preview.ts` |
| Human review session (approve / reject / changes_requested) | ✅ **Implemented** | `src/server/joris/governance-bundle-review-applicator.ts` |
| Decision recorded (audit trail) | ✅ **Implemented** | `src/server/joris/governance-decision-repository.ts`, `db/migrations/0008_governance_decisions.sql` |
| Mission draft → confirm → calendar booking | ✅ **Implemented** | `src/server/missions/mission-draft-session.ts`, `src/server/joris/brain.ts` |
| Prepared actions queue (CEO review queue) | ✅ **Implemented** | `src/server/ventures/prepared-action-repository.ts`, `db/migrations/0013_prepared_actions.sql` |
| Hermès prep tick (enqueue, dedup, prioritize) | ✅ **Implemented** | `src/server/ventures/hermes-prep-tick.ts` |
| Execution guard (zone-gates live: green allowed, yellow needs approval, red/hard-block blocked) | ✅ **Implemented** | `src/server/runtime/execution-guard.ts` → `evaluateLiveExecution()` |
| Green-lane ledger pre-dispatch guard (journal-then-act) | ✅ **Implemented** | PR #218; `src/server/runtime/green-lane-execution-service.ts`, `src/server/runtime/green-lane-ledger.ts` |
| `ready_to_send` / `approved_for_manual_send` status | ✅ **Implemented as status only** — no dispatch |
| **External dispatch worker** | ❌ **NOT IMPLEMENTED — future phase** | Planned: `src/server/runtime/dispatch-worker.ts` (does not exist) |
| **Auto-send / outbound API call** | ❌ **NOT IMPLEMENTED — by design** | No code triggers external calls automatically |
| **Cron: CEO brief generation** | ❌ **Stub only (501)** | `src/app/api/cron/ceo-brief/route.ts` |
| **Cron: market-scout signal collection** | ❌ **Stub only (501)** | `src/app/api/cron/market-scout/route.ts` |

---

## What `approved_for_manual_send` Means Today

Setting a prepared action status to `approved_for_manual_send` means:

- ✅ The CEO has reviewed and approved this action.
- ✅ The action is ready to be executed **manually** by the CEO.
- ❌ It does **NOT** trigger any automatic send, API call, or dispatch.
- ❌ No worker listens for this status transition.

The action must be executed by the CEO manually (e.g., copy-paste an email,
click a button in an external tool). This is intentional until a controlled
dispatch worker is designed, audited, and approved.

---

## Green-Lane Live Execution (PR #218)

A separate, bounded path exists for **green-zone** actions that the execution
guard returns as ALLOW (`evaluateLiveExecution()`). This is distinct from the
manual-send flow above:

- A ledger **decision** event and a **pending-dispatch** event are recorded
  **before** any skill dispatch.
- If either pre-dispatch ledger write fails, **dispatch does not happen** — the
  request is blocked (HTTP 500). This is the ledger-before-dispatch guarantee.
- On dispatch failure, a `result` event (`failed` / `DISPATCH_FAILED`) is
  recorded; on success, a `result` event is recorded best-effort.

This implements the *Journal → Act → Persist* sequence for the autonomous green
lane. Yellow-zone actions still require explicit CEO approval; red-zone
(level 0/5) and hard-blocked actions are refused.

Lives in `src/server/runtime/green-lane-execution-service.ts` and
`src/server/runtime/green-lane-ledger.ts`, called from
`src/app/api/agents/[agentId]/execute/route.ts`.

---

## Safety Invariants That Must Not Be Changed

The following are enforced at both the TypeScript and database levels:

| Invariant | Enforced in |
|---|---|
| `no_execution_authorized = true` on all prepared actions | DB CHECK constraint (migration 0013), TypeScript row mapping |
| `requires_ceo_approval = true` on all prepared actions | DB CHECK constraint (migration 0013) |
| `requires_manual_send = true` on all prepared actions | DB CHECK constraint (migration 0013) |
| `human_on_the_loop = true` on all governance decisions | DB CHECK constraint (migration 0008) |
| `no_execution_authorized = true` on all governance decisions | DB CHECK constraint (migration 0008) |
| `clientApprovalConfirmed` is always rejected | `src/server/runtime/execution-guard.ts` → `canPrepareExecution()` |
| Red-zone (level 0/5) and hard-blocked actions are always refused — never ALLOW | `src/server/runtime/execution-guard.ts` → `evaluateLiveExecution()` |
| Green-lane live dispatch requires a pre-dispatch ledger entry (journal-then-act) | `src/server/runtime/green-lane-execution-service.ts` |

These invariants must never be relaxed without a security audit and explicit
CEO mandate.

---

## Adding the Dispatch Worker (Future Phase)

When the time comes to build the controlled execution worker, it must:

1. **Have an explicit CEO mandate** documented in this file before any code is written.
2. **Be idempotent** — use the `idempotency_key` pattern from `src/server/missions/idempotency-contract.ts`.
3. **Log every dispatch attempt** to the action ledger before and after the call — follow the green-lane pre-dispatch pattern (`recordDecision` + `recordPendingDispatch` before the side-effect; see PR #218).
4. **Be reversible** where possible — implement undo/cancel within 60 seconds for reversible actions.
5. **Enforce the guard** — call `assertExecutionAllowed()` from `execution-guard.ts` before executing.
6. **Never be triggered by client-side code** — only a server-side authenticated, workspace-scoped trigger.
7. **Pass all 4 validation checks** (typecheck, lint, build, smoke) before merging.

---

## Related Documents

- `docs/DRY_RUN_EXECUTOR_CONTRACT.md` — dry-run plan builder contract
- `docs/RUNTIME_CONTROLLED_EXECUTION_GAP_AUDIT.md` — gap analysis for full execution
- `docs/OPERATIONAL_SAFEGUARDS_V1.md` — broader operational safeguards
- `docs/AGENT_GOVERNANCE_REVIEW_LOOP.md` — governance loop design
- `src/server/runtime/execution-guard.ts` — the enforcement gate
