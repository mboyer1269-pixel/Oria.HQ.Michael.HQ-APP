---
name: Orya Runtime Ledger
description: >
  Skill for inspecting and validating the Orya action ledger. Covers
  read-only ledger analysis, state machine compliance, mission traceability,
  and idempotency verification. Ledger writes are Yellow zone and require
  human approval.
---

# Orya Runtime Ledger

## Purpose

This skill provides a structured workflow for inspecting, validating, and reasoning about the Orya action ledger. The ledger records all binding decisions and mission-related actions. This skill focuses on **read-only analysis** — ledger writes are Yellow zone and require explicit human approval.

## When to Use

- When reviewing ledger entries for correctness or completeness.
- When verifying idempotency guarantees on mission operations.
- When tracing a mission through the state machine.
- When auditing ledger entries for compliance with mission contracts.
- When investigating unexpected mission states or failures.
- When validating that `agentRegistry` and `skillsCatalog` remain in sync.

## When NOT to Use

- When the task requires writing new ledger entries (Yellow zone — request approval first).
- When debugging production ledger data (Red zone — no production access).
- For general code debugging unrelated to the ledger.

## Agent Mapping

| Agent | Role |
|-------|------|
| QA / Security Agent | Primary — audit and compliance |
| Builder Agent | Secondary — verification during implementation |
| Architect Agent | Secondary — design validation |

## Key Concepts

### Action Ledger

The action ledger is the system of record for all binding decisions. Per the SOVRA invariant: **no Mission without a Ledger entry**.

### Mission State Machine

Missions follow a defined state machine (from [MISSION_STATE_MACHINE.md](../../docs/MISSION_STATE_MACHINE.md)):

```
pending → running → completed
                  → failed
                  → cancelled
       → needs_approval → running
```

### Idempotency

Per [MISSION_IDEMPOTENCY_CONTRACT.md](../../docs/MISSION_IDEMPOTENCY_CONTRACT.md), mission operations must be idempotent. The reserve-before-build pattern ensures an idempotency key is reserved BEFORE plan generation.

### Agent-Skill Coherence

Per [ORIA_AGENT_OPERATING_MANUAL.md](../../docs/ORIA_AGENT_OPERATING_MANUAL.md), `agentRegistry` and `skillsCatalog` must stay in sync, validated by `validateAgentSkillMapping()`.

## Inspection Workflow

### Step 1: Ledger Entry Scan

1. Identify the scope of inspection (all entries, specific mission, specific agent, time range).
2. Locate ledger data in the local persistence layer (dev mode uses in-memory fallback via `isLocalPersistenceFallbackAllowed()`).
3. List entries with their key fields:
   - Mission ID
   - Agent ID
   - Action type
   - Status
   - Timestamp
   - Idempotency key

### Step 2: State Machine Compliance

For each mission in scope:

1. Trace the full state transition history.
2. Verify each transition is valid per the state machine:
   - `pending` can transition to `running` or `needs_approval`.
   - `needs_approval` can transition to `running` or `cancelled`.
   - `running` can transition to `completed`, `failed`, or `cancelled`.
   - `completed`, `failed`, and `cancelled` are terminal states.
3. Flag any invalid transitions.
4. Verify no mission is stuck in a non-terminal state without a timeout or recovery mechanism.

### Step 3: Mission Traceability

Per [ACTION_LEDGER_MISSION_TRACEABILITY.md](../../docs/ACTION_LEDGER_MISSION_TRACEABILITY.md):

1. Verify every mission has a corresponding ledger entry.
2. Verify every ledger entry traces back to a valid mission.
3. Check for orphaned entries (ledger entries without a mission).
4. Check for unrecorded missions (missions without a ledger entry).

### Step 4: Idempotency Verification

1. Verify the reserve-before-build pattern is followed:
   - Idempotency key is reserved BEFORE plan generation.
   - Duplicate key submissions return the existing result, not a new operation.
2. Check for idempotency key collisions or reuse violations.
3. Verify rate limiting is applied at the mission planning gate.

### Step 5: Agent-Skill Coherence Check

1. Load `agentRegistry` and `skillsCatalog` (from seed files or runtime config).
2. Run `validateAgentSkillMapping()` logic:
   - Every agent references only skills that exist in the catalog.
   - Every active skill is referenced by at least one agent.
   - No agent references a locked skill without proper unlock status.
3. Flag any mismatches.

## Output Format

```markdown
## Ledger Inspection Report

### Scope
- Missions inspected: [count]
- Ledger entries inspected: [count]
- Time range: [start] — [end]

### State Machine Compliance
| Mission ID | Status | Transitions | Valid | Issue |
|-----------|--------|-------------|-------|-------|
| ... | ... | ... | ✅/❌ | ... |

### Traceability
- Missions with ledger entries: [count] / [total]
- Orphaned ledger entries: [count]
- Unrecorded missions: [count]

### Idempotency
- Reserve-before-build pattern: ✅ / ❌
- Key collisions detected: [count]
- Rate limiting active: ✅ / ❌

### Agent-Skill Coherence
- Registry-catalog sync: ✅ / ❌
- Mismatches: [list or "None"]

### Verdict
- [ ] HEALTHY — All checks pass
- [ ] ISSUES FOUND — [summary of issues]
- [ ] CRITICAL — [immediate action required]
```

## Boundary Constraints

| Action | Zone | Rule |
|--------|------|------|
| Read ledger entries | Green | Always permitted in dev mode |
| Analyze state transitions | Green | Read-only analysis |
| Validate idempotency | Green | Read-only checks |
| Write new ledger entries | **Yellow** | Requires Michael's approval |
| Modify existing entries | **Yellow** | Requires Michael's approval |
| Delete ledger entries | **Red** | Destructive — forbidden |
| Access production ledger | **Red** | No production access |

## Checklist

- [ ] Inspection scope defined
- [ ] Ledger entries scanned
- [ ] State machine compliance verified
- [ ] Mission traceability confirmed
- [ ] Idempotency guarantees validated
- [ ] Agent-skill coherence checked
- [ ] Report generated with verdict
