# OpenHands durable reservation v1 (not activated)

The reservation service reuses the existing missions JSONB and action ledger. It does not create an execution queue, call OpenHands, register an HTTP route or change the existing dry-run executor. All results explicitly return externalEffectAllowed:false. No database migration or live database write was performed in this implementation.

## Authority boundary

Existing full_mission / transition_to_running approval cannot authorize a dossier or arbitrary tools. A mandatory server resolver supplies a strict record: version1, UUIDid, scope openhands.submission, workspaceId, missionId, missionVersion, idempotencyKey, payloadHash, actorId, approvedAt and expiresAt. Unknown fields are refused. All identifiers/hashes must match the freshly rebuilt dossier and actual actor supplied by a future authenticated boundary. Dates must be valid; approval cannot be future-dated; expiration is mandatory, must be after approval and now, and lifetime is at most24hours. Time is sampled after awaiting the resolver.

Core validation establishes structure, binding and time only. It does NOT prove that the actor is the owner, authenticate a signature, or accept an approval copied from a browser. The resolver must establish those properties from a server-owned durable record. No default resolver or approving boolean is provided. This exact submission approval does not grant tool, network, secret, deployment or spending permissions. Actual executor capabilities need their own enforced policy.

## Durable sequence

1. Load the exact workspace mission through the durable store. Rebuild and validate the full submission dossier.
2. Resolve and validate server authority for that exact key/hash/version.
3. CAS the original id/workspace/status/updatedAt/full input to a new _openhandsReservation receipt. Only the successful winner continues. Existing development input is preserved.
4. Persist an existing action-ledger entry with reservationId, key/hash/version and authorization reference, with no external effect.
5. CAS the reserved row to audit_recorded with auditId. Return the closed preparation receipt, not permission to execute.

Receipts bind workspace, mission and original missionVersion even though writing the receipt advances row updatedAt. A repeated request rebuilds the original-version dossier and compares its hash against the receipt. Same key with different payload conflicts. Other actors cannot inherit the receipt. Unknown/malformed receipts, reserved/outcome_unknown states, audit failure and ambiguous writes require reconciliation. They are never deleted or automatically retried. Audit success followed by uncertain secondCAS also requires reconciliation; a later lookup can report already_reserved if the audit reference persisted. No automatic external resend exists.

Parent added a reciprocal Paperclip guard: presence of _openhandsReservation (including malformed/null) blocks handoff. OpenHands preparation already refuses any _paperclipDispatch input. Current draft persistence inserts-or-ignores an existing ID, preserving existing reservations. A future input writer must preserve or reject both reserved keys; arbitrary SQL actors can still violate this application invariant, so this is not a database-enforced global uniqueness guarantee.

## Remaining work before activation

- The subsequent disabled-by-default owner endpoint now implements the authenticated resolver and persisted dossier decision; see OPENHANDS_CONFIRMATION_ENDPOINT.md. Qualify its real session/database path before activation.
- Verify CAS/ledger behavior under real concurrent database transactions; tests currently use a deterministic CAS fixture and real Supabase query serialization with synthetic fetch, not live writes.
- Add an explicit reconciliation/read path for reserved or uncertain outcomes; never treat re-preparation as dispatch.
- Verify repository/commit and executor pin, isolate runtime, and reject capabilities/budget enforcement the actual executor cannot honor.
- Recheck authority expiration and mission/dossier state immediately before any external effect; reservation is not a transferable capability. Provide durable dispatch intent/result and cancellation semantics before real launch.

Validation covers duplicate and concurrent attempts, same-version payload conflict, foreign workspace/actor, expired/invalid/broad authority, delay past expiration, unavailable store, audit failure, ambiguous committed CAS, malformed receipts, and CAS predicates preserving the original input. No live activation, deployment or secret change.
