# Runtime Controlled Execution Gap Audit

> **Status:** Active — v1.0
> **Last Updated:** 2026-05-27
> **Scope:** Gap analysis between theoretical runtime contracts and actual implementation.

## 1. Current State Summary

Orya HQ currently operates with a set of well-defined but theoretical runtime contracts (`ORIA_RUNTIME_CONTRACT`, `DRY_RUN_EXECUTOR_CONTRACT`, `MISSION_STATE_MACHINE`). Recent repository inspection confirms that while core Mission persistence and RLS boundaries *are* fully implemented, the critical `MissionApprovalRecord` persistence is missing. As a result, the live executor remains blocked. Joris currently bypasses the mission state machine entirely, executing intents directly rather than routing through a controlled, database-derived approval chain.

## 2. Confirmed Database Schema

- **`public.missions` exists:** Verified via `db/migrations/0001_missions.sql`. The core table structure, constraints (e.g., status, autonomy_level), and JSONB input/result payloads are fully materialized in the database.
- **`public.action_ledger` accepts mission tracing:** Verified via server repository logic. The JSONB `metadata` column is designed to accept and store `missionId` to satisfy mission traceability requirements.

## 3. Confirmed RLS Posture

- **Strict `RESTRICTIVE` policies:** Verified via `db/migrations/0005_missions_rls.sql`. 
- The `public.missions` table is locked down completely. Both `anon` and `authenticated` roles are explicitly denied all `SELECT`, `INSERT`, `UPDATE`, and `DELETE` operations using `RESTRICTIVE` policies (`using (false)`).
- This confirms that only the server-side service-role client (which bypasses RLS) can read or mutate mission state, preventing any client-side tampering.

## 4. Confirmed Server Implementation

- **`src/server/missions/mission-repository.ts`**: Fully implemented and wired to Supabase. It uses the service-role client to securely query `public.missions`.
- **`src/server/actions/action-ledger-repository.ts`**: Fully implemented and correctly maps `missionId` into the `metadata` JSONB column for traceability.
- **`src/server/missions/state-machine.ts`**: Pure functions defining the state machine (`draft` → `queued` → `running`) and evaluating safety gates are implemented.
- **`src/server/missions/executor-contract.ts`**: Pure function `buildDryRunMissionExecutionPlan()` is implemented.

## 5. Confirmed Docs/Contracts Only

- **`MissionApprovalRecord` Contract:** The `approval-record.ts` file exists and defines the type shapes and pure functions (`createMissionApprovalRecordDraft`, `verifyMissionApprovalRecord`). However, it has no database persistence.
- **`DRY_RUN_EXECUTOR_CONTRACT.md`**: Defines the dry-run execution path, but this path is not currently invoked by the main interactive agent (Joris).

## 6. Confirmed Missing Pieces

- **`mission_approvals` Database Migration:** No Supabase migration exists to store `MissionApprovalRecord`s.
- **Approval Repository:** No server-side code exists to persist or fetch approvals from the database.
- **Joris Executor Integration:** Joris executes intents directly and does not route proposed actions through `buildDryRunMissionExecutionPlan()`.
- **Idempotency Locks:** There are no distributed locks or ETags enforcing idempotent mission state transitions.
- **Live Executor:** The actual `mode: "live"` execution loop does not exist.

## 7. Assumptions / Items Requiring Verification

- **Assumption:** The UI components in `/hq/missions` can gracefully handle a transition from instantaneous Joris actions to asynchronous, approval-gated Mission execution.
- **Assumption:** The Joris intent parser produces outputs that can perfectly map to the expected `Mission` schema and `ActionQueueItem` structures.

## 8. Security Implications

- **Strong Foundation:** The RESTRICTIVE RLS on `public.missions` means the mission state cannot be forged by a malicious client.
- **Bypass Vulnerability:** Because Joris bypasses the state machine, the system relies entirely on Joris' internal logic rather than the generic, centralized Mission execution gates.
- **Live Execution is Blocked:** Live execution MUST remain blocked. It cannot be unlocked until `approvalConfirmed` can be derived from a verified database record (`MissionApprovalRecord`), rather than being passed as a free boolean by a caller.

## 9. Recommended PR Sequence

1. **PR 1** — Docs-only controlled execution gap audit (This document)
2. **PR 2** — Tests-only dry-run / ledger / approval contract coverage
3. **PR 3** — Dry-run mission executor integration, no side effects
4. **PR 4** — Approval persistence and derivation foundation
5. **PR 5+** — Live executor candidate only after all gates pass

## 10. Explicit Non-Goals

- This gap audit **does not** authorize the creation of a Live Executor. Live execution remains explicitly blocked until approval persistence, approval derivation, idempotency, ledger guarantees, RLS boundaries, and comprehensive tests are confirmed complete.
- This gap audit **does not** authorize modifying the Joris UI or frontend agent interaction flows at this stage.
