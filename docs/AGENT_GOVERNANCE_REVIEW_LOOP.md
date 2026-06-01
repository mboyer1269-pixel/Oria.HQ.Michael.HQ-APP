# Agent Governance Review Loop

**Status:** Implemented (Phase 1 — local/read-only). Phases 2–6 are future work.  
**Last updated:** 2026-06-01  
**Branch at time of writing:** `main` (post-PR #164)

---

## Purpose

This document describes the current agent governance review loop: how local quality
evaluations flow into governance recommendations and a prioritized human-review queue,
what boundaries are enforced at every step, and what future phases will need before
any action is authorized.

**Nothing in this pipeline executes, approves, or changes agent autonomy.**
Every output is advisory; a human stays on the loop for every decision.

---

## Core Principles

| Principle | What it means |
|---|---|
| **Evaluation ≠ execution** | Running the evaluation pipeline does not trigger any agent action |
| **Recommendation ≠ approval** | A governance recommendation is advice, not a decision |
| **Queue item ≠ action** | A review queue item is a structured prompt for a human reviewer, not a command |
| **Cockpit visibility is read-only** | The agents cockpit displays data; it contains no approve, execute, or mutation controls |
| **No autonomy change from the queue** | No autonomy level is modified by any function in this pipeline |
| **No runtime execution from the queue** | No skill, calendar, ledger, or external call is made by this pipeline |

---

## Current Pipeline (Phase 1)

```
Autonomy Policy
      │
      ▼
Knowledge Pack Blueprints          (per-agent: skills, guardrails, context, metrics)
      │
      ▼
Quality Evaluation Scorecards      (baseline until real observations are attached)
      │
      ▼
Observed Outcome Evaluation        (validate → adapt → score)
      │
      ▼
Review Recommendations             (decide: continue / more observations / expand / block / reduce)
      │
      ▼
Review Queue Builder               (prioritize: critical → high → medium → low)
      │
      ▼
Agents Cockpit (read-only)         (display to human reviewer)
```

All steps are pure, deterministic functions. No step writes to a database, calls a
network endpoint, reads environment variables, or triggers runtime execution.

---

## Stage Reference

### 1. Autonomy Policy

**File:** `src/features/agents/autonomy-policy.ts`

Defines capability risk tiers (`low` / `elevated` / `high` / `critical`) and the
default policy that maps each tier to an autonomy decision (`autonomous` /
`approval_required` / `blocked`). No persistence; pure functions.

### 2. Knowledge Pack Blueprints

**File:** `src/features/agents/agent-knowledge-packs.ts`

One blueprint per agent. Captures: allowed skill IDs, missing skill IDs, required
context items, trusted sources, guardrails, success metrics, and operating contexts.
`humanOnTheLoop: true` and `noExecutionAuthorized: true` are literal fields on every
blueprint — not flags, not config.

### 3. Quality Evaluation Scorecards

**File:** `src/features/agents/agent-quality-evaluation.ts`

Builder: `buildAgentQualityEvaluation({ knowledgeCatalog, autonomyCockpit, observations? })`

Produces one scorecard per knowledge pack. Dimensions:
- `profitSignal` (weight 25%) — realized profit cents
- `ceoLoadReduction` (weight 25%) — CEO minutes saved
- `guardrailCompliance` (weight 25%) — guardrail violations
- `knowledgeReadiness` (weight 15%) — missing skills, context coverage
- `outputUsefulness` (weight 10%) — useful / reviewed output ratio

Without `observations`, all scorecards use `evidenceMode: "blueprint_baseline"` and
report `null` for all realized metrics. Profit is never invented from a blueprint.

### 4. Observed Outcome Evaluation

**File:** `src/features/agents/observed-agent-outcome.ts`

Contract: `ObservedAgentOutcome` — a locally recorded observation of what an agent
actually produced. Status: `draft | simulated | completed | failed | blocked`.
Risk level: `low | medium | high | critical`.

Required fields on `completed`/`failed` outcomes: `actualOutcome`, `evidence`.
Required on all outcomes: `id`, `agentId`, `source`, `objective`, `expectedOutcome`,
`createdAt` (parseable ISO timestamp).

Pipeline function: `evaluateObservedAgentOutcome(outcome, context)`

Steps:
1. `validateObservedAgentOutcome` — report-style, no throws, returns `{ valid, errors[] }`
2. `toQualityEvaluationInput` — pure adapter, no mutation, deterministic
3. `buildAgentQualityEvaluation` — existing scorecard evaluator

Returns `ObservedAgentOutcomeEvaluation` with status `evaluated | invalid |
agent_not_in_catalog`, carrying `riskLevel` and `outcomeStatus` for downstream review.

### 5. Review Recommendations

**File:** `src/features/agents/observed-agent-outcome-review.ts`

Builder: `buildObservedAgentOutcomeReviewRecommendation(evaluation)`

Governance thresholds (explicit constants):

| Constant | Value | Meaning |
|---|---|---|
| `STRONG_QUALITY_SCORE` | 70 | Minimum score for expansion eligibility |
| `LOW_QUALITY_SCORE` | 40 | Score below which knowledge pack review is triggered |
| `MIN_REVIEWED_OUTPUTS` | 5 | Minimum reviewed outputs before any autonomy decision |
| `SERIOUS_GUARDRAIL_VIOLATIONS` | 2 | Violations at or above this trigger autonomy reduction |

Decision outcomes:

| Decision | Trigger |
|---|---|
| `reduce_autonomy_recommendation` | ≥2 guardrail violations |
| `block_autonomy_increase` | ≥1 violation, high/critical risk, or failed outcome |
| `improve_knowledge_pack` | Quality score < 40 |
| `require_more_observations` | < 5 reviewed outputs or no realized value |
| `eligible_for_controlled_expansion` | Score ≥ 70, 0 violations, ≥ 5 reviewed outputs, low/medium risk, profit > 0 |
| `continue_monitoring` | All other cases |

Each decision maps 1:1 to a `nextAction` string for the reviewer. A recommendation
carries `humanOnTheLoop: true` and `noExecutionAuthorized: true`.

### 6. Review Queue Builder

**File:** `src/features/agents/agent-review-queue.ts`

Builder: `buildAgentReviewQueue({ items, createdAt })`

Input: array of `{ evaluation, recommendation }` pairs plus a caller-provided
`createdAt` timestamp (the builder is pure; it never calls `Date.now()`).

Priority assignment:

| Priority | Triggers |
|---|---|
| `critical` | Decision is `reduce_autonomy_recommendation` or `block_autonomy_increase`, OR risk flags include `high_guardrail_violations` or `high_or_critical_risk` |
| `high` | Risk flags include `invalid_observation`, `agent_not_in_catalog`, `failed_outcome`, or `low_quality_score` |
| `medium` | Decision is `require_more_observations`, `improve_knowledge_pack`, or `eligible_for_controlled_expansion` |
| `low` | Decision is `continue_monitoring` |

Output is sorted critical → high → medium → low. Summary counts included.
Every item carries `approvalRequired: true`, `humanOnTheLoop: true`,
`noExecutionAuthorized: true`.

### 7. Agents Cockpit (Read-Only)

**Files:**
- `src/features/agents/components/agent-review-queue-panel.tsx`
- `src/app/hq/agents/page.tsx`

The cockpit page is a Next.js server component. It calls the pure builders at request
time and passes results as props. No client state, no server action, no DB call,
no network call. `createdAt` is pinned to a fixed constant for stable server renders.

The `AgentReviewQueuePanel` renders the queue with priority-coded items (critical red,
high orange, medium amber, low neutral). A persistent safety banner reads:

> "Read-only review queue. No approvals, autonomy changes, or runtime execution are
> performed from this view. All items are advisory only and require explicit human decision."

No approve button. No execute button. No mutation of any kind.

---

## Current Boundaries (Phase 1)

| Boundary | Enforced |
|---|---|
| No DB writes | Yes — no Supabase client is imported in any pipeline file |
| No Supabase writes | Yes |
| No API route | Yes — no `app/api/` file in this pipeline |
| No network call | Yes — no `fetch`, no HTTP client |
| No external worker | Yes |
| No runtime execution | Yes — no runtime import in pipeline files |
| No auto-approval | Yes — `approvalRequired: true` is a literal, not a flag |
| No autonomy change | Yes — evaluation result carries no write-back path |
| No env var dependency | Yes — all builders work without any environment variable |
| Deterministic output | Yes — given identical inputs, every function returns identical outputs |

---

## Human Review Model

The review queue gives the human reviewer (Michael / Joris) a structured view of:

| Field | Purpose |
|---|---|
| `priority` | How urgently the item needs attention |
| `agentId` | Which agent the observation concerns |
| `outcomeId` | Which specific outcome was evaluated |
| `decision` | The recommended governance action |
| `riskFlags` | Specific signals that triggered the recommendation |
| `nextAction` | A concrete next step for the reviewer |
| `rationale` | Short evidence strings explaining the decision |
| `executiveSummary` | One-sentence plain-English summary |
| `approvalRequired` | Always `true` — no action can proceed without explicit approval |
| `humanOnTheLoop` | Always `true` — carried through every stage |
| `noExecutionAuthorized` | Always `true` — carried through every stage |

The reviewer's job is to read the queue, investigate flagged agents, and make an
explicit decision. The system makes no decision on the reviewer's behalf.

---

## Future Extension Path

These phases are **not implemented**. They are documented here so that each extension
is planned deliberately, not added incrementally without design.

### Phase 1 — Current: Local Read-Only Review Queue

Pure builders, no persistence, no approval flow, no runtime.
Cockpit renders deterministic queue from local scorecards.

### Phase 2 — UI Polish (Low risk)

Better filters (by priority, agent, decision), clearer empty states, date range on
observations, pagination. No new data contracts needed. No DB required.

### Phase 3 — Controlled Persistence

Design a DB schema for review queue items with:
- RLS enforced from day one
- Audit trail column (`created_by`, `reviewed_at`, `reviewed_by`)
- No item is writable by the agent itself
- All writes go through a server action that checks auth

This phase must not be started without a schema review and RLS design document.

### Phase 4 — Approval Packet Contract

Before any action can be authorized, define a structured `ApprovalPacket` contract:
- Ties to a specific `outcomeId`, `agentId`, `queueItemId`
- Captures the decision, the reviewer identity, the timestamp, and the rationale
- Is immutable once created
- Cannot be issued by the agent itself

No runtime action may proceed without a valid `ApprovalPacket`. This is a hard
pre-condition for Phase 6.

### Phase 5 — Action Ledger Integration

Every approved decision must be written to the Action Ledger before execution begins.
The ledger entry must be auditable and tamper-evident. See
`docs/ACTION_LEDGER_MISSION_TRACEABILITY.md` for the existing ledger contract.

### Phase 6 — Runtime-Controlled Execution

Only actions that satisfy all of the following may execute:
1. Approved (`ApprovalPacket` exists and is valid)
2. Logged (Action Ledger entry is written before execution)
3. Bounded (scoped to a single skill invocation, no unbounded loops)
4. Reversible where possible (dry-run first, rollback path documented)

See `docs/ORIA_RUNTIME_CONTRACT.md` for the existing runtime boundary specification.

---

## Non-Negotiable Boundaries

These rules apply at all phases, including future ones.

- [ ] No public runtime endpoint without audit trail
- [ ] No DB writes without RLS enforced from the first migration
- [ ] No external worker without defined control boundaries and kill switch
- [ ] No secret hardcoded in source, config, or committed files
- [ ] No agent auto-approval — every autonomy change requires explicit human decision
- [ ] No autonomy level increase without a reviewed queue item and explicit approval
- [ ] No execution without an approved `ApprovalPacket` and a written ledger entry
- [ ] No batch execution at the contract level — one skill invocation per approved instruction
- [ ] `humanOnTheLoop: true` and `noExecutionAuthorized: true` must remain literal fields, not runtime flags, until Phase 6 is fully designed and audited

---

## Implementation Map

| Stage | File |
|---|---|
| Autonomy policy | `src/features/agents/autonomy-policy.ts` |
| Knowledge pack blueprints | `src/features/agents/agent-knowledge-packs.ts` |
| Quality evaluation scorecards | `src/features/agents/agent-quality-evaluation.ts` |
| Observed outcome contract + pipeline | `src/features/agents/observed-agent-outcome.ts` |
| Review recommendations | `src/features/agents/observed-agent-outcome-review.ts` |
| Review queue builder | `src/features/agents/agent-review-queue.ts` |
| Cockpit panel | `src/features/agents/components/agent-review-queue-panel.tsx` |
| Cockpit page | `src/app/hq/agents/page.tsx` |
| Runtime boundary spec | `docs/ORIA_RUNTIME_CONTRACT.md` |
| Action ledger contract | `docs/ACTION_LEDGER_MISSION_TRACEABILITY.md` |
| Operational safeguards | `docs/OPERATIONAL_SAFEGUARDS_V1.md` |
