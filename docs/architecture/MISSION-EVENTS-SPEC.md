# Mission events — append-only mission history (spec, draft)

Status: **draft contract**. Migration `db/migrations/0037_mission_events.sql` is *prepared only*:
it has **not** been applied to any remote database. Applying it needs an explicit CEO GO.

Backend contract for three UI screens:

| Screen | Reads |
|---|---|
| **Approval** | `approval_requested` events + `public.mission_approval_status` (stale / consumed / expired per grant) |
| **Mission life** | ordered events per mission (`mission_id, seq`), current state from `projectMission()` |
| **Costs** | `cost_micro_usd` + `cost_source` on `tool_call_completed` / `run_cost_recorded`, grouped by provider/model |

## 1. Inputs read

- `0017_events.sql` — `public.events`: generic cockpit stream (`idea.captured`), `user_id`-owner RLS
  (`user_id = auth.uid()`), free-form `type` + `payload`, no ordering beyond `recorded_at`, append-only
  only by *absence* of UPDATE/DELETE policies (service role can still mutate).
- `0008_governance_decisions.sql` — audit-only records, RESTRICTIVE deny for anon/authenticated,
  service-role only; "never authorizes execution".
- `0030_mission_approval_binding.sql`, `0032_workspace_members.sql` (membership source for RLS).
- `src/server/orchestration/paperclip-dispatch*.ts`, `src/core/openhands-launch-contract.ts` — runs
  carry `traceId`-like ids and sha256-hex hashes (`/^[a-f0-9]{64}$/`); we reuse that hash shape.
- `src/server/atelier/atelier-mission.ts` (`approveHarnessChange`, `approveUnsandboxed`) — ad-hoc
  boolean approvals `{ by }`, not bound to a payload, not single-use, no expiry.

## 2. Decision: new `public.mission_events` (option B), swappable

The Architecte Senior may rule otherwise; both options are documented so the choice can be swapped.

**Option A — extend `public.events`** (add `seq`, `mission_id`, `state`, `payload_hash`, cost columns…).
- + One physical history table for everything.
- − `public.events` is *user-owned* (RLS `user_id = auth.uid()`); missions are *workspace*-owned and
  written by agents/system. Changing its RLS changes the semantics of existing `idea.captured` reads.
- − Every mission column would be nullable for non-mission rows; CHECKs become `type = … implies …`
  chains; the per-stream seq trigger would apply to unrelated streams.
- − Append-only must be retrofitted (trigger) onto a live table; risk to the PR-1 loop.

**Option B — new `public.mission_events`** (chosen).
- + Strict, non-nullable typed columns and CHECKs; real append-only (trigger, also blocks service_role).
- + Workspace-member RLS from day one; no change to `public.events` behaviour.
- − Two event tables. Mitigation ("one history" rule): `mission_events` is **the only** history for
  missions; nothing mission-related is written to `public.events`. A later view can union both for
  a global activity feed.

Swap path to A: the TS contract (`src/core/mission-events-contract.ts`) and `projectMission()` are
storage-agnostic; only the migration and repository change. Requirements either way: append-only,
indexes on `(mission_id, seq)` (served by the unique `(workspace_id, mission_id, seq)` index) and `trace_id`, RLS workspace isolation.

## 3. Model (Temporal-style history)

- Append-only: `BEFORE UPDATE OR DELETE` row trigger + `BEFORE TRUNCATE` trigger raise `42501`
  (applies to every role incl. service_role/superuser); `authenticated` is granted only SELECT, INSERT.
- Per-mission **dense monotonic `seq`**: insert trigger requires `seq = max(seq)+1` for
  `(workspace_id, mission_id)` under a transaction advisory lock; `unique (workspace_id, mission_id, seq)` backs it.
- **Idempotency**: `intent_key` (client intentKey), `unique (workspace_id, intent_key)`; a retry with
  the same key is refused (caller treats the unique violation as "already recorded").
- Fields: `workspace_id, mission_id, seq, intent_key, event_type, state, trace_id, payload_hash
  (sha256 hex), actor (user or agent id), channel (screen|mobile|voice|agent|system), capability,
  grant_id, expires_at, cost_micro_usd bigint null, cost_source ('measured'|'estimated'|null),
  provider, model, payload jsonb, occurred_at, recorded_at`.
- `state` = mission state *after* the event: `queued, running, waiting_approval, approved,
  approval_stale, blocked, cancelled, succeeded, failed, outcome_unknown`. Terminal (cancelled,
  succeeded, failed) is sticky in the projection. `outcome_unknown` = side effect may or may not have
  happened (timeout after send) — never retried automatically.
- Event types: `mission_queued, mission_started, step_started, tool_call_completed, run_cost_recorded,
  approval_requested, approval_granted, approval_rejected, approval_consumed, payload_changed,
  mission_blocked, mission_cancelled, mission_succeeded, mission_failed, outcome_unknown`.

### Costs
`cost_micro_usd` (≥0, integer micro-dollars) and `cost_source` must be both null or both set (CHECK).
Per-tool cost on `tool_call_completed`, per-run total on `run_cost_recorded`. `measured` = provider
reported usage; `estimated` = our token×price estimate. Screens show both sums separately, never mixed.
The request cited CrewAI 1.15.27/28 for per-tool-call completion + per-run cost events; the pattern is
sound and included, but that CrewAI version detail was **not verified** in this PR.

### Known residual risk: table owner (follow-up issue)
The triggers stop every role **except the table owner / superuser**: the owner can
`ALTER TABLE … DISABLE TRIGGER`, `DROP TRIGGER`, and a superuser can `SET session_replication_role = replica`
(Sentinelle's attack suite proves it; kept as a documented test). Follow-up: make the owner a
dedicated `NOLOGIN` role used only by migrations, and add a per-mission hash chain
(`prev_hash`, `event_hash = sha256(prev_hash || canonical row)`) so tampering is detectable offline.
Not in this PR.

### Writers and clock
- JWT (`authenticated`) callers may insert only `mission_queued`, `mission_cancelled`,
  `approval_rejected` (privilege-reducing human events), and only with `actor = auth.uid()`.
  `approval_granted`, `approval_consumed`, `run_cost_recorded`, `tool_call_completed` and all progress
  events are **service_role only** (insert policy + trigger mirror).
- Human approval goes through a future server route: it authenticates the session, then inserts
  `approval_granted` with service_role and `actor = <session user uuid>`; the DB re-checks the actor.
- `occurred_at` more than **60 s** in the future (clock-skew tolerance) is refused. Expiry is always
  evaluated against the server's `now()`, never against client-supplied `occurred_at`.

## 4. Approvals: payload binding, single-use grants, closed allowlist

- **Closed allowlist** (`CAPABILITY_ALLOWLIST`: `repo.read, repo.write_branch, test.run, build.run,
  llm.subscription`). Any other capability — `connector:*`, `secret:*`, `egress:<host>`, `tool:<new>`,
  `harness_change`, `unsandboxed`, `external_send:*`, `payment`, `merge:*`, `delete:*` — must produce
  `approval_requested` with state `waiting_approval`, a `payload_hash`, an `expires_at`, and a `grant_id`.
- **Closed list in SQL**: `public.mission_capabilities` (exact rows for the free allowlist, class rows
  for approval-requiring classes; class = text before the first `:` or `.`). Any capability not
  matching a row is refused at insert (`delete_repo`, `payments:card`…).
- **Grant** = `approval_granted` event (same grant_id, payload_hash, capability, expires_at). One grant
  per grant_id (partial unique index). **No self-approval**: channel must be screen/mobile/voice
  (CHECK); actor must be a human workspace member uuid (and `= auth.uid()` for JWT callers); a prior
  `approval_requested` with the same grant_id/payload_hash/capability must exist and be unexpired;
  the requester cannot approve its own request. `expires_at` must be in the future at insert.
- **Single use**: using it appends `approval_consumed`; partial unique index
  `(workspace_id, mission_id, grant_id) where event_type='approval_consumed'` refuses a second use.
  The insert trigger also refuses consumption when the grant is missing, bound to another
  payload/capability, expired (`expires_at <= now()`), or **stale**.
- **Stale rule**: a grant is stale if any later event in the mission carries a non-null payload_hash
  different from the grant's. Derived in SQL by view `public.mission_approval_status`
  (`security_invoker`, so RLS applies) and in TS by `projectMission()`; `authorizeCapability()` returns
  `approval_stale` / `waiting_approval` accordingly. Approvals are never "updated" — a new request/grant
  is appended.
- **Voice**: allowlist, not blacklist. Voice may grant/consume only capabilities whose registry row has
  `voice_approvable = true`, and a CHECK on the registry allows that only for free (non-approval)
  capabilities. Today: no approval-requiring capability is voice-approvable (external_send.email,
  harness_change, unsandboxed:shell, merge, payment, delete… all refused).

### Migration path for `approveHarnessChange` / `approveUnsandboxed` (not done in this PR)
Mapped to capabilities `harness_change` / `unsandboxed` (`LEGACY_APPROVAL_CAPABILITIES`).
1. Verify route computes `payload_hash` = sha256 of (mission id, command, harness diff / sandbox config).
2. Without a usable grant: append `approval_requested` (`waiting_approval`, expires_at) and return 409.
3. Owner approves on the Approval screen → `approval_granted`.
4. `runCommandStep` calls `authorizeCapability()`, appends `approval_consumed` in the same transaction
   as the run start; the body boolean `approveHarnessChange: true` is retired after a deprecation window.

## 5. RLS / tenancy

Same pattern as 0036 on `feat/agent-display-names-v2`: `(select auth.uid())` + `exists(workspace_members)`.
Based on **main**: `public.workspaces` does not exist on main (it arrives in PR #424's 0033), so
`workspace_id` is `text` without FK, like every durable table on main; a FK can be added once 0033
lands. Members can SELECT/INSERT; non-members see nothing (also through the view) and inserts are
refused (the SECURITY DEFINER insert trigger refuses non-members first so seq values don't leak).
anon: no privileges. Writers in practice use the service role (no JWT → membership check skipped).

## 6. Numbering

Next free on main is 0033, but PR #424 uses 0033–0036 (`workspaces`, `display_text_rule`,
`employee_profiles`, `agent_display_names`). This uses **0037** to avoid the collision.
Revert: `0037_mission_events_revert.sql` (destroys history; CEO GO only).

## 7. Tests

- `src/server/missions/mission-events-migration.test.mjs` (PGlite 0.5.11, in-process): idempotent
  apply ×2, dense seq, intent_key uniqueness, UPDATE/DELETE/TRUNCATE refusal, cost_source check,
  approval binding/expiry/single-use/stale/voice, view derivation, RLS member vs non-member vs anon, revert.
- `src/server/missions/mission-events-sentinelle-attacks.test.mjs`: Sentinelle's attack suite, copied;
  former CONSTAT cases now assert the fix; owner-bypass case kept as documented risk.
- `src/core/mission-events-contract.test.mjs`: zod contract, allowlist, projection, authorization.

## 8. Unverified / open

- Follow-ups (tracked in a separate issue): NOLOGIN owner + hash chain; cost totals flagged
  `estimated` when any line is estimated (contract P3); `workspace_id` FK to `public.workspaces`
  after #424's 0033 lands.

- Not run against real Supabase (auth schema and roles are stubbed in PGlite).
- No repository/route writes events yet; screens not wired.
- Concurrency of the seq advisory lock only reasoned about, not load-tested.
- CrewAI 1.15.27/28 behaviour not checked.
