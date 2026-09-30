# OpenHands submission preparation v1

This is a server-only preparation contract, not a connected executor. No route, provider HTTP request, activation flag, scheduler, queue or new persistence store is added. The existing dry-run executor and Paperclip dispatcher are unchanged.

`prepareOpenHandsSubmission(workspaceId, request)` loads the mission through the existing durable DevelopmentStore. No development-memory/local fallback. A future authenticated server boundary must derive workspaceId itself. The pure builder is separately testable and cannot establish durability on its own.

Only an unassigned, untouched development draft is eligible: development metadata v1, matching workspace/request-derived mission ID and original payload hash, expected updatedAt version, default draft risk/autonomy/approval properties. Unknown input extensions, existing Paperclip receipts, terminal/running statuses and execution results are refused rather than silently omitted. Nothing here approves an action or changes mission state.

Required request fields:

- missionId and expectedUpdatedAt, from the persisted mission;
- explicit lowercase full commit SHA (40 or64 hex, nonzero), never branch/latest;
- explicit executor semantic version, not latest;
- budget: maxCostCents1–10000, maxTokens1–200000, maxIterations1–100, timeoutSeconds1–1800. A mission cost ceiling, when present, must not be exceeded. These are preparation bounds, not proof that OpenHands can enforce every field.

Output is deeply frozen and contains the mission/version, objective/scope/acceptance/expected output, commit reference, executor version, budget, approvalRequired and executionRequested:false. Commit syntax is validated but repository existence/ownership is not: commitVerification remains not_verified. Executor version is a requested pin, not installed-runtime evidence.

Idempotency key derives from workspace+mission ID+updatedAt+contract prefix. Exact same preparation yields the same key and payload hash. Changing commit, budget or other payload under the same mission version retains the key but changes the payload hash: the future durable adapter must refuse that mismatch as a conflict. This module alone provides no cross-process deduplication, authorization, reservation, retries or cancellation.

Before any actual dispatch, the next adapter must verify the source repository/commit and installed executor pin, derive real owner approval using existing authority contracts, reserve key+hash durably, enforce approved budgets or reject unsupported enforcement, isolate execution, and reconcile ambiguous outcomes without blind resend. This preparation must not bypass the existing live-mode prohibition.

Validation: synthetic tests build through the existing development service, verify immutability, stable key/conflicting payload, version changes, cross-workspace rejection, stale version, malformed/tampered mission, bounded inputs and durable lookup failure. No live execution is claimed.
