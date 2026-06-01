# Agent Approval Persistence Schema

**Status:** Proposed schema. Documentation only. No migration in this PR.  
**Last updated:** 2026-06-01  
**Branch at time of writing:** `codex/agent-approval-persistence-schema-docs`

---

## Purpose

This document specifies the future Supabase persistence model for agent review
approval packets and approval events.

It closes the design gap between:

- the pure `AgentReviewApprovalPacket` contract in
  `src/features/agents/agent-review-approval-packet.ts`
- the pure `AgentReviewApprovalEvent` contract in
  `src/features/agents/agent-review-approval-event.ts`
- the Action Ledger mapping in `docs/AGENT_APPROVAL_PACKET_LEDGER_MAPPING.md`

This is a schema and RLS specification only. It does not create tables, apply a
migration, add a repository, add a server action, add UI controls, or enable any
runtime behavior.

---

## Current State

Today, agent review approvals are local TypeScript contracts:

| Contract | Current behavior |
|---|---|
| `AgentReviewApprovalPacket` | Prepares a human decision from a review queue item |
| `AgentReviewApprovalEvent` | Records a human decision shape in memory |
| Action Ledger mapping | Documents how a future ledgered action must reference the approval chain |

All current builders are pure and deterministic. They perform no DB I/O, no
Supabase calls, no network calls, no Action Ledger writes, no autonomy mutation,
and no runtime execution.

---

## Non-Goals

This PR does not authorize or implement:

- DB migration
- Supabase migration apply
- repository write path
- server action
- public API route
- direct client writes
- approval button
- execute button
- autonomy mutation
- Action Ledger write
- runtime dispatch
- `src/server/joris` changes
- package, env, auth, or Supabase config changes

---

## Persistence Model

The future persistence model has two required tables and one later optional link
table.

| Table | Required in first migration? | Purpose |
|---|---:|---|
| `public.agent_review_approval_packets` | Yes | Immutable snapshot of a prepared human-review packet |
| `public.agent_review_approval_events` | Yes | Append-only record of explicit human decisions on packets |
| `public.agent_review_approval_ledger_links` | Later | Correlates an approved event to a future Action Ledger entry |

Packets and events are audit records. They are not runtime tokens.

---

## Table: `agent_review_approval_packets`

Stores the packet shown to the human reviewer. A packet is not an approval and
never authorizes execution.

### Columns

| Column | Type | Required | Notes |
|---|---|---:|---|
| `id` | `text primary key` | Yes | Mirrors `packetId` |
| `workspace_id` | `text` | Yes | Derived server-side; never trusted from the client |
| `queue_item_id` | `text` | Yes | Mirrors `queueItemId` |
| `agent_id` | `text` | Yes | Subject agent under review |
| `outcome_id` | `text` | Yes | Source observed outcome |
| `priority` | `text` | Yes | `critical`, `high`, `medium`, `low` |
| `packet_status` | `text` | Yes | `draft_for_human_review`, `ready_for_human_review`, `blocked_pending_more_evidence` |
| `requested_decision` | `text` | Yes | Mirrors `requestedDecision` |
| `source_decision` | `text` | Yes | Mirrors upstream recommendation |
| `source_next_action` | `text` | Yes | Human-readable next action |
| `risk_level` | `text` | Yes | Snapshot from `riskSummary.level` |
| `risk_flags` | `jsonb` | Yes | Frozen array from the packet |
| `required_review` | `text` | Yes | `ceo_review_required`, `operator_review_required`, `routine_review_required`, `more_evidence_required` |
| `rationale` | `jsonb` | Yes | Frozen array of evidence strings |
| `executive_summary` | `text` | Yes | Reviewer-facing summary |
| `guardrails` | `jsonb` | Yes | Frozen named constraints |
| `packet_snapshot` | `jsonb` | Yes | Full packet payload for audit parity |
| `approval_required` | `boolean` | Yes | Must be `true` |
| `human_on_the_loop` | `boolean` | Yes | Must be `true` |
| `no_execution_authorized` | `boolean` | Yes | Must be `true` |
| `created_at` | `timestamptz` | Yes | Packet creation timestamp from contract |
| `expires_at` | `timestamptz` | No | Optional packet expiry |
| `persisted_at` | `timestamptz` | Yes | DB insertion timestamp, default `now()` |

### Required Checks

The future migration must enforce:

- non-empty `workspace_id`, `queue_item_id`, `agent_id`, `outcome_id`
- enum-style checks for `priority`, `packet_status`, `requested_decision`,
  `source_decision`, `risk_level`, and `required_review`
- `jsonb_typeof(risk_flags) = 'array'`
- `jsonb_typeof(rationale) = 'array'`
- `jsonb_typeof(guardrails) = 'array'`
- `jsonb_typeof(packet_snapshot) = 'object'`
- `approval_required = true`
- `human_on_the_loop = true`
- `no_execution_authorized = true`

### Required Indexes

| Index | Purpose |
|---|---|
| `(workspace_id)` | Workspace filtering |
| `(workspace_id, agent_id)` | Agent review history |
| `(workspace_id, outcome_id)` | Outcome traceability |
| `(workspace_id, created_at desc)` | Cockpit/review ordering |
| `(workspace_id, packet_status)` | Review queue filtering |
| `(workspace_id, requested_decision)` | Decision-type filtering |

---

## Table: `agent_review_approval_events`

Stores explicit human decisions on approval packets. Events are append-only.
Even an `approved` event does not authorize runtime execution; it only records a
human decision and preserves the requirement that a future Action Ledger entry
must exist before execution.

### Columns

| Column | Type | Required | Notes |
|---|---|---:|---|
| `id` | `text primary key` | Yes | Mirrors `approvalEventId` |
| `workspace_id` | `text` | Yes | Derived server-side |
| `source_packet_id` | `text` | Yes | FK to `agent_review_approval_packets(id)` |
| `source_queue_item_id` | `text` | Yes | Copied for traceability |
| `agent_id` | `text` | Yes | Subject agent under review |
| `outcome_id` | `text` | Yes | Source observed outcome |
| `reviewer_id` | `text` | Yes for human decisions | Server-derived human reviewer |
| `reviewer_role` | `text` | Yes for human decisions | `ceo`, `operator`, or future workspace role |
| `decision` | `text` | Yes | `approved`, `rejected`, `needs_more_evidence`, `expired`, `revoked` |
| `event_status` | `text` | Yes | `draft`, `valid_human_decision`, `invalid`, `expired`, `revoked` |
| `decision_rationale` | `jsonb` | Yes | Required non-empty for human decisions |
| `approved_scope` | `jsonb` | Only when approved | Conceptual scope; not a runtime token |
| `constraints` | `jsonb` | Yes | Reviewer-attached constraints |
| `guardrails` | `jsonb` | Yes | Frozen event guardrails |
| `event_snapshot` | `jsonb` | Yes | Full event payload for audit parity |
| `human_approved` | `boolean` | Yes | `true` only for `decision = 'approved'` |
| `ledger_required_before_execution` | `boolean` | Yes | Must be `true` |
| `no_runtime_execution_authorized` | `boolean` | Yes | Must be `true` |
| `no_auto_approval` | `boolean` | Yes | Must be `true` |
| `approval_event_only` | `boolean` | Yes | Must be `true` |
| `created_at` | `timestamptz` | Yes | Event timestamp from contract |
| `expires_at` | `timestamptz` | Required when approved | Approval expiry |
| `persisted_at` | `timestamptz` | Yes | DB insertion timestamp, default `now()` |

### Required Checks

The future migration must enforce:

- non-empty `workspace_id`, `source_packet_id`, `agent_id`, `outcome_id`
- enum-style checks for `decision` and `event_status`
- `jsonb_typeof(decision_rationale) = 'array'`
- `jsonb_typeof(constraints) = 'array'`
- `jsonb_typeof(guardrails) = 'array'`
- `jsonb_typeof(event_snapshot) = 'object'`
- if `decision in ('approved', 'rejected', 'needs_more_evidence')`, then
  `reviewer_id`, `reviewer_role`, and a non-empty `decision_rationale` are
  required
- if `decision = 'approved'`, then `human_approved = true`,
  `approved_scope is not null`, and `expires_at is not null`
- if `decision <> 'approved'`, then `human_approved = false`
- `ledger_required_before_execution = true`
- `no_runtime_execution_authorized = true`
- `no_auto_approval = true`
- `approval_event_only = true`

### Required Indexes

| Index | Purpose |
|---|---|
| `(workspace_id)` | Workspace filtering |
| `(workspace_id, source_packet_id)` | Packet decision history |
| `(workspace_id, agent_id)` | Agent decision history |
| `(workspace_id, outcome_id)` | Outcome traceability |
| `(workspace_id, decision)` | Decision filtering |
| `(workspace_id, created_at desc)` | Review timeline ordering |

### Foreign Key

`agent_review_approval_events.source_packet_id` must reference
`agent_review_approval_packets(id)` with `on delete restrict`.

Packets must not be deleted as part of normal application behavior. Revocation is
represented as a new event, not by mutating or deleting the original packet.

---

## Optional Later Table: `agent_review_approval_ledger_links`

This table is not required in the first persistence migration. It becomes useful
only once a future Action Ledger entry is created from an approved event.

| Column | Type | Required | Notes |
|---|---|---:|---|
| `id` | `text primary key` | Yes | Stable link id |
| `workspace_id` | `text` | Yes | Derived server-side |
| `approval_event_id` | `text` | Yes | FK to approval event |
| `action_ledger_id` | `uuid` | Yes | FK to `public.action_ledger(id)` |
| `agent_id` | `text` | Yes | Subject agent |
| `linked_by` | `text` | Yes | Server-derived actor |
| `link_metadata` | `jsonb` | Yes | Audit metadata only |
| `created_at` | `timestamptz` | Yes | Default `now()` |

This link does not authorize execution by itself. It is only correlation after a
valid approved event and a separate Action Ledger write both exist.

---

## RLS And Grants Design

The future migration must follow the repository pattern used by
`0008_governance_decisions`:

1. Enable RLS immediately on every new table.
2. Do not add public client access.
3. Do not add policies for `service_role`; service role bypasses RLS and naming
   it in policies is misleading.
4. Add restrictive block-all policies for `anon` and `authenticated` unless a
   later workspace-membership model is explicitly designed.
5. Review Data API grants in the same migration. If the table is in an exposed
   schema, revoke direct privileges from `anon` and `authenticated`.
6. Never rely on `raw_user_meta_data` for authorization. If JWT claims are used
   in a future workspace model, use `app_metadata` or a server-owned membership
   table and account for JWT freshness.

### Policy Shape For First Migration

The first DB migration should be server-owned only:

```sql
alter table public.agent_review_approval_packets enable row level security;
alter table public.agent_review_approval_events enable row level security;

create policy "agent_review_approval_packets_block_anon_select"
  on public.agent_review_approval_packets
  as restrictive
  for select
  to anon
  using (false);

create policy "agent_review_approval_packets_block_authenticated_select"
  on public.agent_review_approval_packets
  as restrictive
  for select
  to authenticated
  using (false);
```

The future migration must repeat that block-all shape for `select`, `insert`,
`update`, and `delete` on both required tables.

Application writes must go through a server-side repository after an owner-gated
server action derives `workspace_id` from the authenticated session.

---

## Repository Contract For Future Implementation

The future repository must:

- be server-only
- derive `workspaceId` server-side
- accept already-built packet/event objects from the pure builders
- insert immutable packet snapshots
- append event snapshots
- never update a packet into an approval
- never allow an agent to be the reviewer
- never accept `reviewerId`, `reviewerRole`, or `workspaceId` from an untrusted
  client payload
- never write the Action Ledger from the packet/event persistence path
- return loud failures in production when Supabase is expected but unavailable
- preserve local fallback only for development/test, if needed

---

## Verification SQL Requirements

Any future migration must ship a matching read-only verify script that checks:

- both tables exist
- RLS is enabled on both tables
- all policies are restrictive
- no policy grants access to `service_role`
- no direct `anon` or `authenticated` table privileges remain unless explicitly
  justified by a later workspace-membership model
- all required check constraints exist
- all required indexes exist
- foreign key from events to packets exists
- `approved` event constraints exist
- no row can set execution authorization booleans to `false`

Expected verification output should be documented in a companion
`*_VERIFICATION.md` file before any migration is applied.

---

## Implementation Sequence

Recommended next PRs:

1. `docs(db): specify agent approval persistence schema` - this document.
2. `db: add agent approval persistence schema with restrictive RLS` - schema
   only; no repository, no UI, no runtime.
3. `feat(agents): add server-only approval persistence repository` - no public
   endpoint; no runtime.
4. `feat(agents): show approval packet preview read-only` - display only; no
   controls.
5. `feat(agents): add CEO-controlled approval event action` - writes approval
   event only; no Action Ledger write and no execution.
6. `feat(ledger): record approved agent action intent` - ledger write only; no
   runtime execution.
7. `feat(runtime): consume ledgered approved actions` - separately gated, after
   runtime and rollback review.

No PR may combine schema, repository writes, UI approval controls, ledger writes,
and runtime execution.

---

## Safety Summary

- Packet persistence is audit only.
- Event persistence is audit only.
- An `approved` event is still not runtime authorization.
- Runtime cannot consume packets or events directly.
- Future execution requires a separate approved Action Ledger entry.
- No migration should be applied without explicit CEO GO.
- RLS must exist from the first migration.
- Direct client access must remain blocked until a workspace membership model is
  designed and reviewed.
