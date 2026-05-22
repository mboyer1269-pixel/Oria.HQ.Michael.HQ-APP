# Oria Runtime Contract — Proposal

Status: **PROPOSAL** — no code, no VPS, no Docker, no runtime API exists yet.  
Date: 2026-05-21  
Branch at time of writing: `main` (post-PR #34)

---

## Purpose

This document defines the contract between **Oria HQ** (the Next.js control plane) and a **future agent runtime** (where Hermes agents would actually execute). It exists so that *before* any VPS is provisioned or any worker is written, the boundary, payloads, security rules, and the dry-run/live line are agreed and documented.

**Nothing in this document activates anything.** It is a specification to be ratified by the CEO, then implemented in later PRs.

---

## Roles

| Side | Role |
|---|---|
| **Oria HQ** | Control plane. Owns auth, approvals, the mission state machine, the agent registry, the skills catalog. Decides *what* may run. Never executes agent work itself. |
| **Runtime** | Execution plane (future). Receives approved, scoped instructions. Executes a single skill invocation in a sandbox. Reports results back. Never decides *whether* it may run — it only obeys signed instructions. |

**Trust direction:** Oria HQ is the source of truth. The runtime is untrusted by default and must prove every action is authorized by a signed instruction from HQ.

---

## Boundary Overview

```
┌────────────────────┐         signed instruction          ┌──────────────────┐
│      Oria HQ        │ ──────────────────────────────────▶ │     Runtime      │
│  (control plane)    │                                      │ (execution plane)│
│                     │ ◀────────────────────────────────── │                  │
│  auth, approvals,   │         result + events              │  sandbox, single │
│  state machine      │                                      │  skill execution │
└────────────────────┘                                       └──────────────────┘
```

Two channels:
1. **HQ → Runtime** — instruction dispatch (HQ initiates; runtime never pulls work it wasn't handed)
2. **Runtime → HQ** — result reporting + event stream (webhook callbacks)

---

## HQ → Runtime: Instruction Payload

A runtime instruction is only ever issued for a **single skill invocation** tied to **one approved mission step**. Batch execution is not permitted at the contract level.

```
RuntimeInstruction {
  instructionId        string   // unique, idempotency key
  issuedAt             ISO8601
  expiresAt            ISO8601   // short TTL — runtime must reject expired
  signature            string    // HMAC/asymmetric sig over the canonical payload

  mission {
    missionId          string
    workspaceId        string
    status             MissionStatus
    transition         string    // the exact state transition this authorizes
  }

  agent {
    agentId            string    // must be status: "active" in the registry
    role               AgentRoleId
    autonomyLevel      0..5
  }

  skill {
    skillId            string    // must be status: "active" in the catalog
    category           SkillCategory
    inputPayload       object    // skill-specific, schema-validated by HQ first
    outputConstraint   string    // echoed from catalog — runtime must honor
  }

  approval {
    approvalRecordId   string    // references a persisted, verified MissionApprovalRecord
    approvalConfirmed  boolean   // see Dry-Run vs Live Boundary below
    approverEmail      string
    scope              MissionApprovalScope
  }

  mode                 "dry_run" | "live"
}
```

**HQ-side preconditions before an instruction may be issued** (all must hold):
1. Agent `status === "active"` in `src/features/agents/seed.ts`
2. Skill `status === "active"` in `src/features/skills/seed.ts`
3. `validateAgentSkillMapping().valid === true` and the skill is assigned to the agent's role
4. A persisted `MissionApprovalRecord` passes all 7 checks in `verifyMissionApprovalRecord()`
5. The mission transition passes `evaluateMissionTransition()`
6. Idempotency + rate-limit gates pass (`validateExecutionAttempt()`)
7. `inputPayload` validated against the skill's schema

If any precondition fails, **no instruction is issued.** The runtime never sees the request.

---

## Runtime → HQ: Result Payload

```
RuntimeResult {
  instructionId        string    // echoes the instruction
  runtimeId            string    // which runtime node handled it
  startedAt            ISO8601
  finishedAt           ISO8601
  outcome              "completed" | "failed" | "rejected"
  rejectionReason      string?   // present when outcome === "rejected"
  output               object?   // skill output, schema-validated by HQ on receipt
  ledgerMetadata {
    missionId          string
    missionStatus      string
    missionTransition  string
    approvalConfirmed  boolean
  }
  signature            string    // runtime signs its result
}
```

HQ **re-validates** every result on receipt — it does not trust `outcome` blindly. The ledger entry is written by HQ, never by the runtime.

---

## Runtime → HQ: Webhook Events

The runtime emits a bounded set of events during execution. HQ accepts only known event types; anything else is logged and dropped.

| Event | Meaning | HQ action |
|---|---|---|
| `instruction.received` | Runtime acknowledged the instruction | Mark dispatched |
| `instruction.rejected` | Runtime refused (expired, bad sig, constraint) | Log, no state change |
| `skill.started` | Execution began | Update mission to running (if authorized) |
| `skill.progress` | Intermediate progress | Append to mission log |
| `skill.completed` | Skill finished successfully | Trigger result validation |
| `skill.failed` | Skill errored | Record failure, no retry without new instruction |
| `runtime.heartbeat` | Liveness ping (see Health Check) | Update runtime status |

---

## Forbidden Events / Actions

The runtime is **never** permitted to:

| Forbidden | Why |
|---|---|
| Pull or self-assign work | All work is HQ-dispatched via signed instruction |
| Execute more than one skill per instruction | Batch execution bypasses per-step approval |
| Set or modify `approvalConfirmed` | Approval is HQ-owned, server-side only |
| Write to the ledger directly | Ledger is HQ-owned |
| Call back into HQ with elevated scope | Scope is fixed at instruction issue time |
| Persist secrets or credentials | Runtime is stateless re: secrets |
| Initiate external sends/spends without level-5 instruction | Hard autonomy boundary |
| Execute an expired or unsigned instruction | Replay / forgery protection |
| Modify `db/schema.sql` or run migrations | Immutable — HQ-owned |

---

## Health Check

```
GET  /runtime/health   →  { status, runtimeId, version, activeInstructions, uptime }
POST /runtime/heartbeat  (runtime → HQ, every N seconds)
```

- HQ marks a runtime **stale** if no heartbeat within 2× the interval.
- A stale runtime receives **no new instructions**.
- Health check carries no secrets and no mission data — liveness only.

---

## Dry-Run vs Live Boundary

This is the single most important line in the contract.

| | Dry-Run | Live |
|---|---|---|
| `mode` | `"dry_run"` | `"live"` |
| `approvalConfirmed` | always `false` | requires verified `MissionApprovalRecord` |
| Side effects | none — plan only | real (only after Red Team pass) |
| Current state | ✅ available | 🔴 **locked** |
| Builder | `buildDryRunMissionExecutionPlan()` | not implemented — rejects `mode: "live"` |

**Today, every instruction would carry `mode: "dry_run"` and `approvalConfirmed: false`.** The runtime would compute and return a plan, never perform a side effect.

**Live mode stays locked until ALL of the following are true:**
1. Mission persistence migration applied (Supabase)
2. Idempotency store backed by atomic Supabase/Redis
3. `MissionApprovalRecord` persistence wired and `verifyMissionApprovalRecord()` enforced in the dispatch path
4. Hermes Auditor completes a Red Team pass (`redteam.pass`)
5. Explicit CEO mandate in the unlocking PR

No single PR may flip dry-run to live. The unlock is its own gated PR after 1–4.

---

## Security Rules

1. **Every instruction is signed.** Runtime rejects unsigned or bad-signature payloads.
2. **Short TTL.** Instructions expire quickly (`expiresAt`); expired instructions are rejected.
3. **Idempotency.** `instructionId` is the idempotency key; the runtime must not double-execute.
4. **Least privilege.** The instruction carries only the scope needed for one skill on one step.
5. **No standing credentials in the runtime.** Any external access uses short-lived, scoped tokens issued per-instruction (future design — out of scope here).
6. **HQ re-validates all returns.** Results and events are untrusted until HQ verifies signature + schema + state legality.
7. **Mutual TLS or equivalent** on both channels (transport hardening — to be specified in the VPS Readiness PR).
8. **Audit everything.** Every instruction issued and every result received is logged with `instructionId` correlation.

---

## What This Proposal Does NOT Cover

Deliberately out of scope — these come in later, separately gated PRs:

- VPS provisioning, sizing, region, cost (→ VPS Readiness PR)
- Docker / container images
- Concrete API framework, ports, transport implementation
- Token issuance mechanics
- Live executor implementation
- Any actual runtime code

---

## Open Questions for CEO Sign-Off

1. **Signature scheme** — HMAC (shared secret) vs asymmetric (HQ signs, runtime verifies with public key)? Asymmetric preferred for least-trust.
2. **Instruction TTL** — proposed 60s. Acceptable, or shorter?
3. **One runtime or a pool?** Single node first, or design for N nodes from day one?
4. **Heartbeat interval** — proposed 30s.
5. **Event transport** — webhooks (HQ exposes an endpoint) vs runtime polls a queue? Webhooks proposed.
6. **First skill to run live** — when unlocked, which skill is the canary? Proposed: `opportunity.scan` (read-only, lowest blast radius).

---

## Next Step

After CEO sign-off on the open questions:
**PR #36 — VPS Readiness Checklist** (docs-only): provisioning prerequisites, transport hardening, token issuance design, monitoring/alerting, rollback plan. Still no infrastructure spun up.

---

## Reference Docs

- `docs/ORIA_HQ_PHASE2_SNAPSHOT.md` — system state this contract builds on
- `docs/MISSION_CONTROL_OPERATING_MANUAL.md` — gate sequence and approval contract
- `docs/ORIA_AGENT_OPERATING_MANUAL.md` — agent/skill roles and unlock paths
- `src/server/missions/executor-contract.ts` — `MissionExecutorPlan` / `MissionExecutorInput` (the in-process analogue of the runtime instruction)
